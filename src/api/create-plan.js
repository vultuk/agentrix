import { createPlanService } from '../core/plan.js';
import { sendJson } from '../utils/http.js';

export function createPlanHandlers({ openaiApiKey, planService: providedPlanService } = {}) {
  const planService = providedPlanService ?? createPlanService({ apiKey: openaiApiKey });

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

    if (!planService || !planService.isConfigured) {
      sendJson(context.res, 500, { error: 'OpenAI API key is not configured (set openaiApiKey in config.json).' });
      return;
    }

    let stream;
    try {
      stream = await planService.createPlanStream({ prompt });
    } catch (error) {
      if (error?.code === 'OPENAI_NOT_CONFIGURED') {
        sendJson(context.res, 500, { error: error.message });
        return;
      }
      if (error instanceof Error && error.message === 'prompt is required') {
        sendJson(context.res, 400, { error: error.message });
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      const errorMessage = message.startsWith('Failed to reach OpenAI:')
        ? message
        : `Failed to reach OpenAI: ${message}`;
      sendJson(context.res, 502, {
        error: errorMessage,
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
