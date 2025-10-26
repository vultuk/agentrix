import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const execFileAsync = promisify(execFile);

export async function listWorktrees(repositoryPath) {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repositoryPath, 'worktree', 'list', '--porcelain'],
      { maxBuffer: 1024 * 1024 },
    );

    if (!stdout.trim()) {
      return [];
    }

    const worktrees = [];
    const blocks = stdout.trim().split(/\n\n+/);
    blocks.forEach((block) => {
      let worktreePath = null;
      let branchName = null;

      block.split('\n').forEach((line) => {
        if (line.startsWith('worktree ')) {
          worktreePath = line.slice('worktree '.length).trim();
        } else if (line.startsWith('branch ')) {
          const ref = line.slice('branch '.length).trim();
          branchName = ref.replace(/^refs\/heads\//, '');
        }
      });

      worktrees.push({ path: worktreePath, branch: branchName });
    });

    return worktrees;
  } catch (error) {
    return [];
  }
}

export function parseRepositoryUrl(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error('Repository URL is required');
  }

  const trimmed = input.trim();
  let org = '';
  let repo = '';

  const sshMatch = trimmed.match(/^git@[^:]+:([^/]+)\/(.+)$/);
  if (sshMatch) {
    org = sshMatch[1];
    repo = sshMatch[2];
  } else {
    try {
      if (/^[a-z]+:\/\//i.test(trimmed)) {
        const url = new URL(trimmed);
        const parts = url.pathname.replace(/^\//, '').split('/').filter(Boolean);
        if (parts.length >= 2) {
          org = parts[parts.length - 2];
          repo = parts[parts.length - 1];
        }
      }
    } catch {
      // ignore URL parsing errors and fall back to manual parsing
    }

    if (!org || !repo) {
      const cleaned = trimmed.replace(/\.git$/, '');
      const segments = cleaned.split(/[\\/]+/).filter(Boolean);
      if (segments.length >= 2) {
        org = segments[segments.length - 2];
        repo = segments[segments.length - 1];
      }
    }

    if ((!org || !repo) && trimmed.includes(':')) {
      const tail = trimmed.split(':').pop() || '';
      const segments = tail.replace(/\.git$/, '').split('/').filter(Boolean);
      if (segments.length >= 2) {
        org = segments[segments.length - 2];
        repo = segments[segments.length - 1];
      }
    }
  }

  repo = repo ? repo.replace(/\.git$/, '') : repo;

  if (!org || !repo) {
    throw new Error('Unable to determine repository organisation and name from URL');
  }

  return { org, repo, url: trimmed };
}

export function normaliseBranchName(branch) {
  if (typeof branch !== 'string') {
    return '';
  }
  return branch.trim();
}

export function deriveWorktreeFolderName(branch) {
  const trimmed = normaliseBranchName(branch);
  if (!trimmed) {
    throw new Error('Branch name cannot be empty');
  }
  const parts = trimmed.split('/').filter(Boolean);
  const folder = parts[parts.length - 1];
  if (!folder) {
    throw new Error('Unable to derive worktree folder from branch name');
  }
  return folder;
}

export async function ensureRepository(workdir, org, repo) {
  if (!org || !repo) {
    throw new Error('Repository identifier is incomplete');
  }

  const repoRoot = path.join(workdir, org, repo);
  const repositoryPath = path.join(repoRoot, 'repository');

  let stats;
  try {
    stats = await fs.stat(repositoryPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error(`Repository not found for ${org}/${repo}`);
    }
    throw new Error(`Unable to access repository ${org}/${repo}: ${error.message}`);
  }

  if (!stats.isDirectory()) {
    throw new Error(`Repository path is not a directory: ${repositoryPath}`);
  }

  return { repoRoot, repositoryPath };
}

export async function cloneRepository(workdir, repositoryUrl) {
  const { org, repo, url } = parseRepositoryUrl(repositoryUrl);
  const repoRoot = path.join(workdir, org, repo);
  const repositoryPath = path.join(repoRoot, 'repository');

  await fs.mkdir(repoRoot, { recursive: true });

  try {
    const stats = await fs.stat(repositoryPath);
    if (stats.isDirectory()) {
      throw new Error(`Repository already exists for ${org}/${repo}`);
    }
    throw new Error(`Cannot create repository at ${repositoryPath}`);
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      throw error;
    }
  }

  try {
    await execFileAsync('git', ['clone', url, repositoryPath], { maxBuffer: 1024 * 1024 });
  } catch (error) {
    const stderr = error && error.stderr ? error.stderr.toString() : '';
    const message = stderr || error.message || 'Unknown git error';
    throw new Error(`Failed to clone repository: ${message.trim()}`);
  }

  return { org, repo };
}

async function branchExists(repositoryPath, branch) {
  try {
    await execFileAsync(
      'git',
      ['-C', repositoryPath, 'rev-parse', '--verify', `refs/heads/${branch}`],
      { maxBuffer: 1024 * 1024 },
    );
    return true;
  } catch {
    return false;
  }
}

export async function createWorktree(workdir, org, repo, branch) {
  const branchName = normaliseBranchName(branch);
  if (!branchName) {
    throw new Error('Branch name cannot be empty');
  }

  const { repoRoot, repositoryPath } = await ensureRepository(workdir, org, repo);
  const folderName = deriveWorktreeFolderName(branchName);
  const targetPath = path.join(repoRoot, folderName);

  try {
    await fs.access(targetPath);
    throw new Error(`Worktree directory already exists at ${targetPath}`);
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      throw error;
    }
  }

  try {
    await execFileAsync('git', ['-C', repositoryPath, 'checkout', 'main'], {
      maxBuffer: 1024 * 1024,
    });
    await execFileAsync('git', ['-C', repositoryPath, 'pull', '--ff-only', 'origin', 'main'], {
      maxBuffer: 1024 * 1024,
    });

    const exists = await branchExists(repositoryPath, branchName);
    const args = ['-C', repositoryPath, 'worktree', 'add'];
    if (!exists) {
      args.push('-b', branchName);
    }
    args.push(targetPath);
    if (exists) {
      args.push(branchName);
    }
    await execFileAsync('git', args, { maxBuffer: 1024 * 1024 });
  } catch (error) {
    const stderr = error && error.stderr ? error.stderr.toString() : '';
    const message = stderr || error.message || 'Unknown git error';
    throw new Error(`Failed to create worktree: ${message.trim()}`);
  }
}

export async function getWorktreePath(workdir, org, repo, branch) {
  const { repositoryPath } = await ensureRepository(workdir, org, repo);
  const worktrees = await listWorktrees(repositoryPath);
  const match = worktrees.find((item) => item.branch === branch);
  if (!match || !match.path) {
    throw new Error(`Worktree for ${org}/${repo} branch ${branch} not found`);
  }
  return { repositoryPath, worktreePath: match.path };
}

export async function discoverRepositories(workdir) {
  const result = {};

  let organisations;
  try {
    organisations = await fs.readdir(workdir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return result;
    }
    throw error;
  }

  for (const orgEntry of organisations) {
    if (!orgEntry.isDirectory()) {
      continue;
    }

    const orgName = orgEntry.name;
    const orgPath = path.join(workdir, orgName);
    let repoEntries;

    try {
      repoEntries = await fs.readdir(orgPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const repoEntry of repoEntries) {
      if (!repoEntry.isDirectory()) {
        continue;
      }

      const repoName = repoEntry.name;
      const repoRoot = path.join(orgPath, repoName);
      const repositoryPath = path.join(repoRoot, 'repository');

      try {
        const stats = await fs.stat(repositoryPath);
        if (!stats.isDirectory()) {
          continue;
        }
      } catch {
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const worktrees = await listWorktrees(repositoryPath);
      const branches = Array.from(
        new Set(
          worktrees
            .map((entry) => entry.branch)
            .filter((branch) => typeof branch === 'string' && branch.length > 0),
        ),
      );
      if (!result[orgName]) {
        result[orgName] = {};
      }
      result[orgName][repoName] = branches;
    }
  }

  return result;
}

export async function removeWorktree(workdir, org, repo, branch) {
  const branchName = normaliseBranchName(branch);
  if (!branchName) {
    throw new Error('Branch name cannot be empty');
  }
  if (branchName.toLowerCase() === 'main') {
    throw new Error('Cannot remove the main worktree');
  }

  const { repositoryPath } = await ensureRepository(workdir, org, repo);
  const worktrees = await listWorktrees(repositoryPath);
  const entry = worktrees.find((item) => item.branch === branchName);

  if (!entry || !entry.path) {
    return;
  }

  try {
    await execFileAsync(
      'git',
      ['-C', repositoryPath, 'worktree', 'remove', '--force', entry.path],
      { maxBuffer: 1024 * 1024 },
    );
  } catch (error) {
    const stderr = error && error.stderr ? error.stderr.toString() : '';
    const message = stderr || error.message || 'Unknown git error';
    throw new Error(`Failed to remove worktree: ${message.trim()}`);
  }
}
