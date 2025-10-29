import OpenAI from 'openai';
import { loadDeveloperMessage } from '../config/developer-messages.js';
import { sendJson } from '../utils/http.js';

const DEFAULT_DEVELOPER_MESSAGE = `\`\`\`
Transform any user message describing a feature request, enhancement, or bug fix into a structured PTCGO-style prompt for Codex. The resulting prompt should instruct Codex to directly implement the described change in code provided or in the target repository context.

Follow this structure strictly:

Persona: Assume the role of a senior full-stack developer working with modern frameworks. You write clean, maintainable code and follow SOLID, DRY, and YAGNI principles.

Task: Implement the feature request, enhancement, or bug fix described by the user.

Steps to Complete Task:
1. Analyse the user’s description to determine what part of the codebase is affected and what needs to change.
2. If code is provided, use it as the working context. Otherwise, infer where changes belong.
3. Write complete, correct, and self-contained code implementing the change.
4. Include inline documentation and clear commit-style explanations if relevant.

Context / Constraints:
- Do not add boilerplate or unrelated refactors.
- Maintain existing coding conventions, folder structure, and architectural boundaries.
- Use concise, idiomatic, production-grade TypeScript or the language of the provided code.

Goal: Produce the minimal and correct code modification that fulfils the request as described. The result must be ready to paste or commit directly.

Format Output: Provide only the final prompt Codex should act on — no extra commentary or metadata. The output must be plain text starting with 'Implement the following change:' followed by the fully structured Codex instruction.
\`\`\``;

export function createPlanHandlers({ openaiApiKey } = {}) {
  const trimmedKey = typeof openaiApiKey === 'string' ? openaiApiKey.trim() : '';
  const openaiClient = trimmedKey ? new OpenAI({ apiKey: trimmedKey }) : null;

  async function create(context) {
    let payload;
    try {
      payload = await context.readJsonBody();
    } catch (error) {
      sendJson(context.res, 400, { error: error.message });
      return;
    }

    const prompt = typeof payload.prompt === 'string' ? payload.prompt : '';
    if (!prompt.trim()) {
      sendJson(context.res, 400, { error: 'prompt is required' });
      return;
    }

    if (!openaiClient) {
      sendJson(context.res, 500, { error: 'OpenAI API key is not configured (set openaiApiKey in config.json).' });
      return;
    }

    const developerMessage = await loadDeveloperMessage('create-plan', DEFAULT_DEVELOPER_MESSAGE);

    let stream;
    try {
      stream = await openaiClient.chat.completions.create({
        model: 'gpt-5',
        messages: [
          { role: 'system', content: developerMessage },
          { role: 'user', content: prompt },
        ],
        stream: true,
      });
    } catch (error) {
      sendJson(context.res, 502, {
        error: `Failed to reach OpenAI: ${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }

    const { req, res } = context;

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.shouldKeepAlive = true;

    const socket = res.socket;
    if (socket) {
      socket.setKeepAlive(true, 0);
      socket.setNoDelay(true);
    }

    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    let clientClosed = false;
    let hasContent = false;
    let streamErrorMessage = null;

    const handleClose = () => {
      clientClosed = true;
    };

    req.on('close', handleClose);

    const writeIfPossible = (chunk) => {
      if (clientClosed || res.writableEnded) {
        return;
      }
      res.write(chunk);
    };

    const writeEvent = (data, eventType = 'message') => {
      if (clientClosed || res.writableEnded) {
        return;
      }
      if (eventType && eventType !== 'message') {
        writeIfPossible(`event: ${eventType}\n`);
      }
      if (typeof data === 'string') {
        const segments = data.split(/\r?\n/);
        for (const segment of segments) {
          writeIfPossible(`data: ${segment}\n`);
        }
      } else {
        writeIfPossible(`data: ${JSON.stringify(data)}\n`);
      }
      writeIfPossible('\n');
    };

    const normaliseContent = (delta) => {
      if (!delta) {
        return '';
      }

      if (typeof delta.content === 'string') {
        return delta.content;
      }

      if (Array.isArray(delta.content)) {
        return delta.content
          .map((part) => {
            if (!part) {
              return '';
            }
            if (typeof part === 'string') {
              return part;
            }
            if (typeof part.text === 'string') {
              return part.text;
            }
            return '';
          })
          .join('');
      }

      return '';
    };

    try {
      for await (const chunk of stream) {
        if (clientClosed) {
          break;
        }
        const delta = chunk?.choices?.[0]?.delta;
        const content = normaliseContent(delta);
        if (typeof content !== 'string' || content.length === 0) {
          continue;
        }
        hasContent = true;
        writeEvent({ content });
      }
    } catch (error) {
      streamErrorMessage = `Streaming error: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      if (!clientClosed) {
        if (!hasContent && !streamErrorMessage) {
          streamErrorMessage = 'OpenAI response did not include a plan.';
        }
        if (streamErrorMessage) {
          writeEvent({ message: streamErrorMessage }, 'error');
        }
        writeEvent('[DONE]');
        if (!res.writableEnded) {
          res.end();
        }
      }
      req.removeListener('close', handleClose);
    }
  }

  return { create };
}
