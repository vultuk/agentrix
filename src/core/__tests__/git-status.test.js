import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { getWorktreeStatus } from '../git.js';
import { getWorktreeFileDiff } from '../git.js';

const execFileAsync = promisify(execFile);

async function runGit(args, options) {
  await execFileAsync('git', args, { ...options, maxBuffer: 1024 * 1024 });
}

async function createRepoFixture(name) {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), `tw-git-status-${name}-`));
  const workdir = path.join(baseDir, 'workdir');
  const org = 'acme';
  const repo = `${name}-repo`;
  const repositoryPath = path.join(workdir, org, repo, 'repository');
  await fs.mkdir(repositoryPath, { recursive: true });
  await runGit(['init', '-b', 'main'], { cwd: repositoryPath });
  await runGit(['config', 'user.name', 'Test User'], { cwd: repositoryPath });
  await runGit(['config', 'user.email', 'test@example.com'], { cwd: repositoryPath });
  await fs.writeFile(path.join(repositoryPath, 'README.md'), '# Demo\n');
  await runGit(['add', 'README.md'], { cwd: repositoryPath });
  await runGit(['commit', '-m', 'Initial commit'], { cwd: repositoryPath });

  return {
    baseDir,
    workdir,
    org,
    repo,
    repositoryPath,
    async cleanup() {
      await fs.rm(baseDir, { recursive: true, force: true });
    }
  };
}

test('getWorktreeStatus groups staged, unstaged, untracked, and operations metadata', async () => {
  const fixture = await createRepoFixture('summary');
  const { repositoryPath, workdir, org, repo } = fixture;

  try {
    await fs.writeFile(path.join(repositoryPath, 'notes.txt'), 'one\n');
    await runGit(['add', 'notes.txt'], { cwd: repositoryPath });
    await runGit(['commit', '-m', 'Add notes'], { cwd: repositoryPath });

    await fs.writeFile(path.join(repositoryPath, 'docs.md'), 'docs\n');
    await runGit(['add', 'docs.md'], { cwd: repositoryPath });
    await runGit(['commit', '-m', 'Add docs'], { cwd: repositoryPath });
    await runGit(['mv', 'docs.md', 'docs-renamed.md'], { cwd: repositoryPath });

    await fs.writeFile(path.join(repositoryPath, 'notes.txt'), 'one\nstaged change\n');
    await runGit(['add', 'notes.txt'], { cwd: repositoryPath });
    await fs.appendFile(path.join(repositoryPath, 'notes.txt'), 'working tree delta\n');

    await fs.writeFile(path.join(repositoryPath, 'untracked.log'), 'temporary\n');

    const headHashResult = await execFileAsync('git', ['-C', repositoryPath, 'rev-parse', 'HEAD']);
    const mergeHead = headHashResult.stdout.trim();
    const gitDirResult = await execFileAsync('git', ['-C', repositoryPath, 'rev-parse', '--git-dir']);
    const gitDir = path.resolve(repositoryPath, gitDirResult.stdout.trim());
    await fs.writeFile(path.join(gitDir, 'MERGE_HEAD'), `${mergeHead}\n`);
    await fs.writeFile(path.join(gitDir, 'MERGE_MSG'), 'Merge in progress\n');

    const status = await getWorktreeStatus(workdir, org, repo, 'main', {
      entryLimit: 20,
      commitLimit: 5,
    });

    assert.equal(status.branchSummary.head, 'main');
    assert.equal(status.totals.staged >= 1, true);
    assert.equal(status.totals.unstaged >= 1, true);
    assert.equal(status.totals.untracked, 1);
    assert.equal(status.totals.conflicts, 0);

    const stagedPaths = status.files.staged.items.map((item) => item.path);
    assert.ok(stagedPaths.includes('notes.txt'));
    const renameEntry = status.files.staged.items.find((item) => item.path === 'docs-renamed.md');
    assert.ok(renameEntry, 'expected staged rename entry');
    assert.equal(renameEntry.previousPath, 'docs.md');

    const unstagedPaths = status.files.unstaged.items.map((item) => item.path);
    assert.ok(unstagedPaths.includes('notes.txt'));

    assert.equal(status.files.untracked.items[0].path, 'untracked.log');
    assert.equal(status.operations.merge.inProgress, true);
    assert.equal(status.operations.rebase.inProgress, false);
    assert.equal(status.operations.merge.message?.includes('Merge in progress'), true);
    assert.equal(status.commits.items.length >= 1, true);
    assert.ok(status.worktreePath.endsWith(path.join(org, repo, 'repository')));
  } finally {
    await fixture.cleanup();
  }
});

test('getWorktreeStatus respects entry and commit limits', async () => {
  const fixture = await createRepoFixture('limits');
  const { repositoryPath, workdir, org, repo } = fixture;

  try {
    for (let index = 0; index < 3; index += 1) {
      const filename = `file-${index}.txt`;
      await fs.writeFile(path.join(repositoryPath, filename), `content ${index}\n`);
      await runGit(['add', filename], { cwd: repositoryPath });
      await runGit(['commit', '-m', `Add ${filename}`], { cwd: repositoryPath });
    }

    // create additional commits to exceed the commitLimit later
    for (let index = 0; index < 4; index += 1) {
      await fs.appendFile(path.join(repositoryPath, 'file-0.txt'), `extra ${index}\n`);
      await runGit(['commit', '-am', `Update file-0 iteration ${index}`], { cwd: repositoryPath });
    }

    await fs.writeFile(path.join(repositoryPath, 'untracked-a.txt'), 'A\n');
    await fs.writeFile(path.join(repositoryPath, 'untracked-b.txt'), 'B\n');
    await fs.writeFile(path.join(repositoryPath, 'untracked-c.txt'), 'C\n');

    const status = await getWorktreeStatus(workdir, org, repo, 'main', {
      entryLimit: 1,
      commitLimit: 2,
    });

    assert.equal(status.files.untracked.items.length, 1);
    assert.equal(status.files.untracked.total, 3);
    assert.equal(status.files.untracked.truncated, true);
    assert.equal(status.commits.items.length, 2);
    assert.equal(status.commits.truncated, true);
  } finally {
    await fixture.cleanup();
  }
});

test('recent commits include only commits ahead of upstream', async () => {
  const fixture = await createRepoFixture('ahead');
  const { repositoryPath, workdir, org, repo, baseDir } = fixture;

  try {
    const remotePath = path.join(baseDir, 'remote.git');
    await runGit(['init', '--bare', remotePath]);
    await runGit(['remote', 'add', 'origin', remotePath], { cwd: repositoryPath });
    await runGit(['push', '-u', 'origin', 'main'], { cwd: repositoryPath });

    await fs.appendFile(path.join(repositoryPath, 'README.md'), 'update 1\n');
    await runGit(['commit', '-am', 'Ahead commit 1'], { cwd: repositoryPath });
    await fs.appendFile(path.join(repositoryPath, 'README.md'), 'update 2\n');
    await runGit(['commit', '-am', 'Ahead commit 2'], { cwd: repositoryPath });

    const status = await getWorktreeStatus(workdir, org, repo, 'main', {
      commitLimit: 5,
    });

    assert.equal(status.branchSummary.upstream, 'origin/main');
    assert.equal(status.branchSummary.ahead >= 2, true);
    const commitSubjects = status.commits.items.map((item) => item.subject);
    assert.ok(commitSubjects.includes('Ahead commit 1'));
    assert.ok(commitSubjects.includes('Ahead commit 2'));
    assert.ok(!commitSubjects.includes('Initial commit'));
  } finally {
    await fixture.cleanup();
  }
});

test('recent commits filter using local main when upstream missing', async () => {
  const fixture = await createRepoFixture('local-feature');
  const { repositoryPath, workdir, org, repo } = fixture;

  try {
    const repoRoot = path.dirname(repositoryPath);
    const featureWorktreePath = path.join(repoRoot, 'feature');
    await runGit(['worktree', 'add', featureWorktreePath, '-b', 'feature', 'main'], {
      cwd: repositoryPath,
    });

    await runGit(['config', 'user.name', 'Worktree User'], { cwd: featureWorktreePath });
    await runGit(['config', 'user.email', 'worktree@example.com'], { cwd: featureWorktreePath });

    await fs.writeFile(path.join(featureWorktreePath, 'feature.txt'), 'feature change\n');
    await runGit(['add', 'feature.txt'], { cwd: featureWorktreePath });
    await runGit(['commit', '-m', 'Feature branch commit'], { cwd: featureWorktreePath });

    const status = await getWorktreeStatus(workdir, org, repo, 'feature', {
      commitLimit: 5,
    });

    assert.equal(status.branchSummary.upstream, null);
    const commitSubjects = status.commits.items.map((item) => item.subject);
    assert.ok(commitSubjects.includes('Feature branch commit'));
    assert.ok(!commitSubjects.includes('Initial commit'));
  } finally {
    await fixture.cleanup();
  }
});

test('getWorktreeFileDiff returns staged and unstaged diffs', async () => {
  const fixture = await createRepoFixture('diff');
  const { repositoryPath, workdir, org, repo } = fixture;

  try {
    const filePath = path.join(repositoryPath, 'sample.txt');
    await fs.writeFile(filePath, 'original\n');
    await runGit(['add', 'sample.txt'], { cwd: repositoryPath });
    await runGit(['commit', '-m', 'Add sample'], { cwd: repositoryPath });

    await fs.writeFile(filePath, 'original\nstaged change\n');
    await runGit(['add', 'sample.txt'], { cwd: repositoryPath });

    await fs.writeFile(filePath, 'original\nstaged change\nworking tree\n');

    const staged = await getWorktreeFileDiff(workdir, org, repo, 'main', {
      path: 'sample.txt',
      mode: 'staged',
    });
    assert.ok(staged.diff.includes('staged change'));
    assert.ok(!staged.diff.includes('working tree'));

    const unstaged = await getWorktreeFileDiff(workdir, org, repo, 'main', {
      path: 'sample.txt',
      mode: 'unstaged',
    });
    assert.ok(unstaged.diff.includes('working tree'));

    const newFilePath = path.join(repositoryPath, 'fresh.txt');
    await fs.writeFile(newFilePath, 'hello\n');

    const untracked = await getWorktreeFileDiff(workdir, org, repo, 'main', {
      path: 'fresh.txt',
      mode: 'untracked',
    });
    assert.ok(untracked.diff.includes('+++ b/fresh.txt'));
  } finally {
    await fixture.cleanup();
  }
});

test('detects rebase apply state', async () => {
  const fixture = await createRepoFixture('rebase');
  const { repositoryPath, workdir, org, repo } = fixture;

  try {
    const gitDirResult = await execFileAsync('git', ['-C', repositoryPath, 'rev-parse', '--git-dir']);
    const gitDir = path.resolve(repositoryPath, gitDirResult.stdout.trim());
    const rebaseApplyDir = path.join(gitDir, 'rebase-apply');
    await fs.mkdir(rebaseApplyDir, { recursive: true });
    await fs.writeFile(path.join(rebaseApplyDir, 'head-name'), 'refs/heads/main\n');
    await fs.writeFile(path.join(rebaseApplyDir, 'onto'), 'refs/remotes/origin/main\n');
    await fs.writeFile(path.join(rebaseApplyDir, 'msgnum'), '2\n');
    await fs.writeFile(path.join(rebaseApplyDir, 'end'), '5\n');

    const status = await getWorktreeStatus(workdir, org, repo, 'main');
    assert.equal(status.operations.rebase.inProgress, true);
    assert.equal(status.operations.rebase.type, 'apply');
    assert.equal(status.operations.rebase.step, 2);
    assert.equal(status.operations.rebase.total, 5);
  } finally {
    await fixture.cleanup();
  }
});
