import OpenAI from 'openai';
import { loadDeveloperMessage } from '../config/developer-messages.js';

export const DEFAULT_PLAN_DEVELOPER_MESSAGE = `\`\`\`
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

const DEFAULT_PLAN_MODEL = 'gpt-5';

function collectMessageContent(content) {
  if (!content) {
    return '';
  }

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((entry) => {
        if (!entry) {
          return '';
        }
        if (typeof entry === 'string') {
          return entry;
        }
        if (typeof entry.text === 'string') {
          return entry.text;
        }
        return '';
      })
      .join('');
  }

  return '';
}

export function createPlanService({ apiKey } = {}) {
  const trimmedKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  const openaiClient = trimmedKey ? new OpenAI({ apiKey: trimmedKey }) : null;
  let developerMessagePromise = null;

  async function getDeveloperMessage() {
    if (!developerMessagePromise) {
      developerMessagePromise = loadDeveloperMessage(
        'create-plan',
        DEFAULT_PLAN_DEVELOPER_MESSAGE,
      );
    }
    return developerMessagePromise;
  }

  function ensureClient() {
    if (!openaiClient) {
      const error = new Error(
        'OpenAI API key is not configured (set openaiApiKey in config.json).',
      );
      error.code = 'OPENAI_NOT_CONFIGURED';
      throw error;
    }
  }

  async function generatePlanStream({ prompt }) {
    ensureClient();

    if (typeof prompt !== 'string' || !prompt.trim()) {
      throw new Error('prompt is required');
    }

    const developerMessage = await getDeveloperMessage();

    try {
      return await openaiClient.chat.completions.create({
        model: DEFAULT_PLAN_MODEL,
        messages: [
          { role: 'system', content: developerMessage },
          { role: 'user', content: prompt },
        ],
        stream: true,
      });
    } catch (error) {
      throw new Error(
        `Failed to reach OpenAI: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async function generatePlanText({ prompt }) {
    ensureClient();

    if (typeof prompt !== 'string' || !prompt.trim()) {
      throw new Error('prompt is required');
    }

    const developerMessage = await getDeveloperMessage();

    let response;
    try {
      response = await openaiClient.chat.completions.create({
        model: DEFAULT_PLAN_MODEL,
        messages: [
          { role: 'system', content: developerMessage },
          { role: 'user', content: prompt },
        ],
      });
    } catch (error) {
      throw new Error(
        `Failed to reach OpenAI: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const message = response?.choices?.[0]?.message;
    const content = collectMessageContent(message?.content).trim();
    if (!content) {
      throw new Error('OpenAI response did not include a plan.');
    }

    return content;
  }

  return {
    isConfigured: Boolean(openaiClient),
    async createPlanStream(options) {
      return generatePlanStream(options);
    },
    async createPlanText(options) {
      return generatePlanText(options);
    },
  };
}
