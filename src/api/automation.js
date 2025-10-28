import {
  cloneRepository,
  createWorktree,
  ensureRepository,
  getWorktreePath,
  normaliseBranchName,
} from '../core/git.js';
import { launchAgentProcess } from '../core/agents.js';
import { sendJson } from '../utils/http.js';

function extractApiKey(req) {
  const apiKeyHeader = req.headers?.['x-api-key'];
  if (typeof apiKeyHeader === 'string' && apiKeyHeader.trim()) {
    return apiKeyHeader.trim();
  }

  const authHeader = req.headers?.authorization;
  if (typeof authHeader === 'string') {
    const trimmed = authHeader.trim();
    if (/^bearer\s+/i.test(trimmed)) {
      return trimmed.replace(/^bearer\s+/i, '').trim();
    }
  }

  return '';
}

function parseRepoIdentifier(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error('repo must be provided in the format "org/repository"');
  }

  const cleaned = input.trim().replace(/\.git$/i, '');
  const segments = cleaned.split('/').filter(Boolean);
  if (segments.length !== 2) {
    throw new Error('repo must be provided in the format "org/repository"');
  }

  return { org: segments[0], repo: segments[1] };
}

function sanitiseBranch(worktreeDescriptor) {
  if (typeof worktreeDescriptor !== 'string' || !worktreeDescriptor.trim()) {
    throw new Error('worktree must be provided as "type/title"');
  }

  const parts = worktreeDescriptor
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    throw new Error('worktree must include both type and title separated by "/"');
  }

  const slugify = (value) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');

  const segments = parts.map((part) => {
    const slug = slugify(part);
    if (!slug) {
      throw new Error('worktree name segments must include alphanumeric characters');
    }
    return slug;
  });
  const branchName = normaliseBranchName(segments.join('/'));

  if (!branchName) {
    throw new Error('Derived branch name is empty');
  }

  if (branchName.toLowerCase() === 'main') {
    throw new Error('worktree branch "main" is not allowed');
  }

  return branchName;
}

async function ensureRepositoryExists(workdir, org, repo) {
  try {
    const { repositoryPath } = await ensureRepository(workdir, org, repo);
    return { repositoryPath, cloned: false };
  } catch (error) {
    if (error && /Repository not found/i.test(error.message || '')) {
      const remote = `git@github.com:${org}/${repo}.git`;
      await cloneRepository(workdir, remote);
      const { repositoryPath } = await ensureRepository(workdir, org, repo);
      return { repositoryPath, cloned: true };
    }
    throw error;
  }
}

async function ensureWorktreeExists(workdir, org, repo, branch) {
  try {
    const { worktreePath } = await getWorktreePath(workdir, org, repo, branch);
    return { worktreePath, created: false };
  } catch (error) {
    if (error && /worktree .* not found/i.test(error.message || '')) {
      await createWorktree(workdir, org, repo, branch);
      const { worktreePath } = await getWorktreePath(workdir, org, repo, branch);
      return { worktreePath, created: true };
    }
    throw error;
  }
}

function resolveAgentCommand(agentCommands, requested) {
  const key = typeof requested === 'string' ? requested.trim().toLowerCase() : '';
  if (!key) {
    throw new Error('command must be one of: codex, cursor, claude');
  }

  const mapping = {
    codex: agentCommands?.codex,
    cursor: agentCommands?.cursor,
    claude: agentCommands?.claude,
  };

  const command = mapping[key];
  if (!command) {
    throw new Error(`Unsupported command "${requested}". Expected codex, cursor, or claude.`);
  }

  return { key, command };
}

export function createAutomationHandlers({ workdir, agentCommands, apiKey }) {
  async function launch(context) {
    if (!apiKey) {
      sendJson(context.res, 503, { error: 'Automation API is not configured (missing API key)' });
      return;
    }

    const providedKey = extractApiKey(context.req);
    if (providedKey !== apiKey) {
      sendJson(context.res, 401, { error: 'Invalid API key' });
      return;
    }

    let payload;
    try {
      payload = await context.readJsonBody();
    } catch (error) {
      sendJson(context.res, 400, { error: error.message });
      return;
    }

    let org;
    let repo;
    try {
      ({ org, repo } = parseRepoIdentifier(payload.repo));
    } catch (error) {
      sendJson(context.res, 400, { error: error.message });
      return;
    }

    let branch;
    try {
      branch = sanitiseBranch(payload.worktree);
    } catch (error) {
      sendJson(context.res, 400, { error: error.message });
      return;
    }

    let prompt = '';
    if (payload.prompt !== undefined) {
      if (typeof payload.prompt !== 'string') {
        sendJson(context.res, 400, { error: 'prompt must be a string' });
        return;
      }
      prompt = payload.prompt;
    }

    let agent;
    try {
      agent = resolveAgentCommand(agentCommands, payload.command);
    } catch (error) {
      sendJson(context.res, 400, { error: error.message });
      return;
    }

    try {
      const { repositoryPath, cloned } = await ensureRepositoryExists(workdir, org, repo);
      const { worktreePath, created } = await ensureWorktreeExists(workdir, org, repo, branch);

      const { pid } = await launchAgentProcess({
        command: agent.command,
        cwd: worktreePath,
        prompt,
      });

      sendJson(context.res, 202, {
        data: {
          org,
          repo,
          branch,
          repositoryPath,
          worktreePath,
          clonedRepository: cloned,
          createdWorktree: created,
          agent: agent.key,
          agentCommand: agent.command,
          pid,
        },
      });
    } catch (error) {
      sendJson(context.res, 500, { error: error.message });
    }
  }

  return { launch };
}
