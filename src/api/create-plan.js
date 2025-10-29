import { sendJson } from '../utils/http.js';

const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

const DEVELOPER_MESSAGE = `\`\`\`
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

    const apiKey = typeof openaiApiKey === 'string' && openaiApiKey.trim()
      ? openaiApiKey.trim()
      : null;
    if (!apiKey) {
      sendJson(context.res, 500, { error: 'OpenAI API key is not configured (set openaiApiKey in config.json).' });
      return;
    }

    let response;
    try {
      // Invoke the OpenAI chat completions endpoint with the mandated system context.
      response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-5',
          messages: [
            { role: 'developer', content: DEVELOPER_MESSAGE },
            { role: 'user', content: prompt },
          ],
          reasoning: { effort: 'medium' },
          verbosity: 'low',
        }),
      });
    } catch (error) {
      sendJson(context.res, 500, {
        error: `Failed to reach OpenAI: ${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }

    if (!response.ok) {
      let detail = `OpenAI request failed with status ${response.status}`;
      try {
        const errorBody = await response.json();
        if (errorBody && typeof errorBody === 'object') {
          const message =
            typeof errorBody.error === 'string'
              ? errorBody.error
              : typeof errorBody.message === 'string'
              ? errorBody.message
              : null;
          if (message) {
            detail = message;
          }
        }
      } catch {
        // Ignore JSON parse errors for OpenAI error responses.
      }
      sendJson(context.res, 502, { error: detail });
      return;
    }

    let data;
    try {
      data = await response.json();
    } catch (error) {
      sendJson(context.res, 502, {
        error: `Failed to parse OpenAI response: ${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }

    const plan = data?.choices?.[0]?.message?.content;
    if (typeof plan !== 'string' || !plan.trim()) {
      sendJson(context.res, 502, { error: 'OpenAI response did not include a plan.' });
      return;
    }

    sendJson(context.res, 200, { plan });
  }

  return { create };
}
