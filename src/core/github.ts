import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BUFFER = 1024 * 1024;

function createGithubError(message: string, cause?: unknown): Error {
  const error = new Error(message);
  if (cause) {
    (error as { cause?: unknown }).cause = cause;
  }
  return error;
}

function normaliseRepo(org: string, repo: string): { repoSlug: string; org: string; repo: string } {
  const trimmedOrg = typeof org === 'string' ? org.trim() : '';
  const trimmedRepo = typeof repo === 'string' ? repo.trim() : '';
  if (!trimmedOrg || !trimmedRepo) {
    throw createGithubError('Organisation and repository are required');
  }
  return { repoSlug: `${trimmedOrg}/${trimmedRepo}`, org: trimmedOrg, repo: trimmedRepo };
}

function parseJsonArray(payload: string, contextMessage: string): unknown[] {
  const text = typeof payload === 'string' ? payload.trim() : '';
  if (!text) {
    return [];
  }
  try {
    const data = JSON.parse(text);
    if (Array.isArray(data)) {
      return data;
    }
  } catch (error: unknown) {
    throw createGithubError(contextMessage, error);
  }
  throw createGithubError(contextMessage);
}

function parseJsonObject(payload: string, contextMessage: string): Record<string, unknown> {
  const text = typeof payload === 'string' ? payload.trim() : '';
  if (!text) {
    throw createGithubError(contextMessage);
  }
  try {
    const data = JSON.parse(text);
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return data;
    }
  } catch (error: unknown) {
    throw createGithubError(contextMessage, error);
  }
  throw createGithubError(contextMessage);
}

async function runGh(args: string[], { timeoutMs = DEFAULT_TIMEOUT_MS }: { timeoutMs?: number } = {}): Promise<string> {
  try {
    const { stdout } = await execFileAsync('gh', args, {
      timeout: timeoutMs,
      maxBuffer: DEFAULT_MAX_BUFFER,
    });
    return typeof stdout === 'string' ? stdout : '';
  } catch (error: unknown) {
    const err = error as { code?: string; signal?: string; killed?: boolean; stderr?: string; stdout?: string; message?: string };
    if (err?.code === 'ENOENT') {
      throw createGithubError('GitHub CLI (gh) is not installed or not available on PATH', error);
    }
    if (err?.code === 'ETIMEDOUT' || err?.signal === 'SIGTERM' || err?.killed) {
      throw createGithubError('GitHub CLI command timed out', error);
    }
    const stderr = typeof err?.stderr === 'string' ? err.stderr.trim() : '';
    const stdout = typeof err?.stdout === 'string' ? err.stdout.trim() : '';
    const message = stderr || stdout || err?.message || 'GitHub CLI command failed';
    throw createGithubError(message, error);
  }
}

export function createGithubClient({ timeoutMs = DEFAULT_TIMEOUT_MS }: { timeoutMs?: number } = {}) {
  async function countOpenPullRequests(org: string, repo: string): Promise<number> {
    const { repoSlug } = normaliseRepo(org, repo);
    const stdout = await runGh(
      ['pr', 'list', '--repo', repoSlug, '--state', 'open', '--json', 'number', '--limit', '100'],
      { timeoutMs },
    );
    return parseJsonArray(stdout, 'Unexpected response when listing pull requests').length;
  }

  async function countOpenIssues(org: string, repo: string): Promise<number> {
    const { repoSlug } = normaliseRepo(org, repo);
    const stdout = await runGh(
      ['issue', 'list', '--repo', repoSlug, '--state', 'open', '--json', 'number', '--limit', '100'],
      { timeoutMs },
    );
    return parseJsonArray(stdout, 'Unexpected response when listing issues').length;
  }

  async function countRunningWorkflows(org: string, repo: string): Promise<number> {
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

  async function listOpenIssues(org: string, repo: string): Promise<unknown[]> {
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
        const issueRecord = issue as Record<string, unknown>;
        const number = typeof issueRecord['number'] === 'number' ? issueRecord['number'] : null;
        if (number === null) {
          return null;
        }
        const title = typeof issueRecord['title'] === 'string' ? issueRecord['title'] : '';
        const createdAtValue = typeof issueRecord['createdAt'] === 'string' ? issueRecord['createdAt'] : null;
        let createdAt = null;
        if (createdAtValue) {
          const parsedDate = new Date(createdAtValue);
          if (!Number.isNaN(parsedDate.getTime())) {
            createdAt = parsedDate.toISOString();
          }
        }
        const labels = Array.isArray(issueRecord['labels'])
          ? (issueRecord['labels'] as unknown[])
              .map((label) => {
                const labelRecord = label as Record<string, unknown>;
                return labelRecord && typeof labelRecord['name'] === 'string' ? labelRecord['name'] : null;
              })
              .filter(Boolean)
          : [];
        const url = typeof issueRecord['url'] === 'string' && issueRecord['url']
          ? issueRecord['url']
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

  async function getIssue(org: string, repo: string, issueNumber: number | string): Promise<Record<string, unknown>> {
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
    const title = typeof issue?.["title"] === 'string' ? issue["title"] : '';
    const body = typeof issue?.["body"] === 'string' ? issue["body"] : '';

    const createdAtValue = typeof issue?.["createdAt"] === 'string' ? issue["createdAt"] : null;
    const updatedAtValue = typeof issue?.["updatedAt"] === 'string' ? issue["updatedAt"] : null;

    function normaliseDate(value: unknown): string | null {
      if (!value) {
        return null;
      }
      const parsed = new Date(String(value));
      if (Number.isNaN(parsed.getTime())) {
        return null;
      }
      return parsed.toISOString();
    }

    const authorData =
      issue && typeof issue?.["author"] === 'object' && issue["author"] !== null ? issue["author"] : null;
    let author = null;
    if (authorData) {
      const authorRecord = authorData as Record<string, unknown>;
      const login = typeof authorRecord['login'] === 'string' && authorRecord['login'] ? authorRecord['login'] : null;
      const name = typeof authorRecord['name'] === 'string' && authorRecord['name'] ? authorRecord['name'] : null;
      const profileUrl =
        typeof authorRecord['url'] === 'string' && authorRecord['url'] ? authorRecord['url'] : null;
      const avatarUrl =
        typeof authorRecord['avatarUrl'] === 'string' && authorRecord['avatarUrl'] ? authorRecord['avatarUrl'] : null;
      if (login || name || profileUrl || avatarUrl) {
        author = {
          login,
          name,
          url: profileUrl,
          avatarUrl,
        };
      }
    }

    const labels = Array.isArray(issue?.["labels"])
      ? (issue["labels"] as unknown[])
          .map((label) => {
            const labelRecord = label as Record<string, unknown>;
            if (!labelRecord || typeof labelRecord['name'] !== 'string' || !labelRecord['name']) {
              return null;
            }
            const color = typeof labelRecord['color'] === 'string' && labelRecord['color'] ? labelRecord['color'] : null;
            return { name: labelRecord['name'], color };
          })
          .filter(Boolean)
      : [];

    const url =
      typeof issue?.["url"] === 'string' && issue["url"]
        ? issue["url"]
        : `https://github.com/${repoSlug}/issues/${parsedNumber}`;

    const state =
      typeof issue?.["state"] === 'string' && issue["state"]
        ? (issue["state"] as string).toLowerCase()
        : null;

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
