import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BUFFER = 1024 * 1024;

function createGithubError(message, cause) {
  const error = new Error(message);
  if (cause) {
    error.cause = cause;
  }
  return error;
}

function normaliseRepo(org, repo) {
  const trimmedOrg = typeof org === 'string' ? org.trim() : '';
  const trimmedRepo = typeof repo === 'string' ? repo.trim() : '';
  if (!trimmedOrg || !trimmedRepo) {
    throw createGithubError('Organisation and repository are required');
  }
  return { repoSlug: `${trimmedOrg}/${trimmedRepo}`, org: trimmedOrg, repo: trimmedRepo };
}

function parseJsonArray(payload, contextMessage) {
  const text = typeof payload === 'string' ? payload.trim() : '';
  if (!text) {
    return [];
  }
  try {
    const data = JSON.parse(text);
    if (Array.isArray(data)) {
      return data;
    }
  } catch (error) {
    throw createGithubError(contextMessage, error);
  }
  throw createGithubError(contextMessage);
}

function parseJsonObject(payload, contextMessage) {
  const text = typeof payload === 'string' ? payload.trim() : '';
  if (!text) {
    throw createGithubError(contextMessage);
  }
  try {
    const data = JSON.parse(text);
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return data;
    }
  } catch (error) {
    throw createGithubError(contextMessage, error);
  }
  throw createGithubError(contextMessage);
}

async function runGh(args, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  try {
    const { stdout } = await execFileAsync('gh', args, {
      timeout: timeoutMs,
      maxBuffer: DEFAULT_MAX_BUFFER,
    });
    return typeof stdout === 'string' ? stdout : '';
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw createGithubError('GitHub CLI (gh) is not installed or not available on PATH', error);
    }
    if (error?.code === 'ETIMEDOUT' || error?.signal === 'SIGTERM' || error?.killed) {
      throw createGithubError('GitHub CLI command timed out', error);
    }
    const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : '';
    const stdout = typeof error?.stdout === 'string' ? error.stdout.trim() : '';
    const message = stderr || stdout || error?.message || 'GitHub CLI command failed';
    throw createGithubError(message, error);
  }
}

export function createGithubClient({ timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  async function countOpenPullRequests(org, repo) {
    const { repoSlug } = normaliseRepo(org, repo);
    const stdout = await runGh(
      ['pr', 'list', '--repo', repoSlug, '--state', 'open', '--json', 'number', '--limit', '100'],
      { timeoutMs },
    );
    return parseJsonArray(stdout, 'Unexpected response when listing pull requests').length;
  }

  async function countOpenIssues(org, repo) {
    const { repoSlug } = normaliseRepo(org, repo);
    const stdout = await runGh(
      ['issue', 'list', '--repo', repoSlug, '--state', 'open', '--json', 'number', '--limit', '100'],
      { timeoutMs },
    );
    return parseJsonArray(stdout, 'Unexpected response when listing issues').length;
  }

  async function countRunningWorkflows(org, repo) {
    const { repoSlug } = normaliseRepo(org, repo);
    const statuses = ['in_progress', 'queued'];
    const results = await Promise.all(
      statuses.map(async (status) => {
        const stdout = await runGh(
          [
            'run',
            'list',
            '--repo',
            repoSlug,
            '--status',
            status,
            '--json',
            'databaseId,status,workflowName',
            '--limit',
            '100',
          ],
          { timeoutMs },
        );
        return parseJsonArray(stdout, 'Unexpected response when listing workflow runs').length;
      }),
    );
    return results.reduce((total, value) => total + value, 0);
  }

  async function listOpenIssues(org, repo) {
    const { repoSlug } = normaliseRepo(org, repo);
    const stdout = await runGh(
      [
        'issue',
        'list',
        '--repo',
        repoSlug,
        '--state',
        'open',
        '--json',
        'number,title,labels,createdAt,url',
        '--limit',
        '200',
      ],
      { timeoutMs },
    );
    const issues = parseJsonArray(stdout, 'Unexpected response when listing issues');
    return issues
      .map((issue) => {
        const number = typeof issue?.number === 'number' ? issue.number : null;
        if (number === null) {
          return null;
        }
        const title = typeof issue?.title === 'string' ? issue.title : '';
        const createdAtValue = typeof issue?.createdAt === 'string' ? issue.createdAt : null;
        let createdAt = null;
        if (createdAtValue) {
          const parsedDate = new Date(createdAtValue);
          if (!Number.isNaN(parsedDate.getTime())) {
            createdAt = parsedDate.toISOString();
          }
        }
        const labels = Array.isArray(issue?.labels)
          ? issue.labels
              .map((label) => (label && typeof label.name === 'string' ? label.name : null))
              .filter(Boolean)
          : [];
        const url = typeof issue?.url === 'string' && issue.url
          ? issue.url
          : `https://github.com/${repoSlug}/issues/${number}`;
        return {
          number,
          title,
          createdAt,
          labels,
          url,
        };
      })
      .filter(Boolean);
  }

  async function getIssue(org, repo, issueNumber) {
    const { repoSlug } = normaliseRepo(org, repo);
    const parsedNumber =
      typeof issueNumber === 'number'
        ? issueNumber
        : Number.parseInt(typeof issueNumber === 'string' ? issueNumber.trim() : '', 10);

    if (!Number.isInteger(parsedNumber) || parsedNumber <= 0) {
      throw createGithubError('Issue number must be a positive integer');
    }

    const stdout = await runGh(
      [
        'issue',
        'view',
        String(parsedNumber),
        '--repo',
        repoSlug,
        '--json',
        'number,title,body,author,createdAt,updatedAt,labels,url,state',
      ],
      { timeoutMs },
    );

    const issue = parseJsonObject(stdout, 'Unexpected response when reading issue details');
    const title = typeof issue?.title === 'string' ? issue.title : '';
    const body = typeof issue?.body === 'string' ? issue.body : '';

    const createdAtValue = typeof issue?.createdAt === 'string' ? issue.createdAt : null;
    const updatedAtValue = typeof issue?.updatedAt === 'string' ? issue.updatedAt : null;

    function normaliseDate(value) {
      if (!value) {
        return null;
      }
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return null;
      }
      return parsed.toISOString();
    }

    const authorData =
      issue && typeof issue.author === 'object' && issue.author !== null ? issue.author : null;
    let author = null;
    if (authorData) {
      const login = typeof authorData.login === 'string' && authorData.login ? authorData.login : null;
      const name = typeof authorData.name === 'string' && authorData.name ? authorData.name : null;
      const profileUrl =
        typeof authorData.url === 'string' && authorData.url ? authorData.url : null;
      const avatarUrl =
        typeof authorData.avatarUrl === 'string' && authorData.avatarUrl ? authorData.avatarUrl : null;
      if (login || name || profileUrl || avatarUrl) {
        author = {
          login,
          name,
          url: profileUrl,
          avatarUrl,
        };
      }
    }

    const labels = Array.isArray(issue?.labels)
      ? issue.labels
          .map((label) => {
            if (!label || typeof label.name !== 'string' || !label.name) {
              return null;
            }
            const color = typeof label.color === 'string' && label.color ? label.color : null;
            return { name: label.name, color };
          })
          .filter(Boolean)
      : [];

    const url =
      typeof issue?.url === 'string' && issue.url
        ? issue.url
        : `https://github.com/${repoSlug}/issues/${parsedNumber}`;

    const state =
      typeof issue?.state === 'string' && issue.state
        ? issue.state.toLowerCase()
        : 'open';

    return {
      number: parsedNumber,
      title,
      body,
      author,
      createdAt: normaliseDate(createdAtValue),
      updatedAt: normaliseDate(updatedAtValue),
      labels,
      url,
      state,
    };
  }

  return {
    countOpenPullRequests,
    countOpenIssues,
    countRunningWorkflows,
    listOpenIssues,
    getIssue,
  };
}
