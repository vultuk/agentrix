import OpenAI from 'openai';
import { loadDeveloperMessage } from '../config/developer-messages.js';
import { normaliseBranchName } from './git.js';

const DEFAULT_MODEL = 'gpt-5-mini';

const DEFAULT_DEVELOPER_MESSAGE =
  'Generate a branch name in the format <type>/<description> with no preamble or postamble, and no code blocks. The <type> must be one of: feature, enhancement, fix, chore, or another appropriate status. The <description> should be concise (max 7 words), using dashes to separate words. Example: feature/create-calendar-page.';

function slugifySegment(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sanitiseCandidate(rawValue) {
  if (typeof rawValue !== 'string') {
    return '';
  }

  const line = rawValue
    .split('\n')
    .map((segment) => segment.trim())
    .find(Boolean);
  if (!line) {
    return '';
  }

  const cleaned = line.replace(/^`+|`+$/g, '').replace(/^"+|"+$/g, '').trim();
  if (!cleaned) {
    return '';
  }

  const segments = cleaned.split('/').map((segment) => slugifySegment(segment));

  let type = segments[0];
  const remainder = segments.slice(1).filter(Boolean);

  if (!type) {
    type = 'feature';
  }

  if (remainder.length === 0) {
    const fallback = slugifySegment(cleaned.replace(/\//g, '-'));
    if (!fallback) {
      return '';
    }
    remainder.push(fallback);
  }

  const branch = [type, ...remainder].join('/');
  return normaliseBranchName(branch);
}

function buildUserPrompt({ prompt, org, repo } = {}) {
  const sections = [];
  if (org && repo) {
    sections.push(`Repository: ${org}/${repo}`);
  }
  if (prompt) {
    sections.push(`Summary:\n${prompt}`);
  }

  if (sections.length === 0) {
    sections.push('Generate a succinct branch name for an upcoming change.');
  }

  return sections.join('\n\n');
}

export function createBranchNameGenerator({ apiKey, model = DEFAULT_MODEL } = {}) {
  if (!apiKey) {
    return {
      isConfigured: false,
      async generateBranchName() {
        throw new Error('Branch name generation is not configured (missing OpenAI API key).');
      },
    };
  }

  const openai = new OpenAI({ apiKey });

  async function generateBranchName(context = {}) {
    const userPrompt = buildUserPrompt(context);
    const developerMessage = await loadDeveloperMessage('branch-name', DEFAULT_DEVELOPER_MESSAGE);

    let response;
    try {
      response = await openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'developer',
            content: [{ type: 'text', text: developerMessage }],
          },
          {
            role: 'user',
            content: [{ type: 'text', text: userPrompt }],
          },
        ],
        response_format: { type: 'text' },
        verbosity: 'low',
        reasoning_effort: 'minimal',
        store: false,
      });
    } catch (error) {
      throw new Error(
        `Failed to generate branch name: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const choice = response?.choices?.[0]?.message?.content;
    const candidate = sanitiseCandidate(choice);
    if (!candidate) {
      throw new Error('Generated branch name was empty.');
    }

    return candidate;
  }

  return {
    isConfigured: true,
    async generateBranchName(context) {
      const branch = await generateBranchName(context);
      if (branch.toLowerCase() === 'main') {
        throw new Error('Generated branch name is invalid (branch "main" is not allowed).');
      }
      return branch;
    },
  };
}
