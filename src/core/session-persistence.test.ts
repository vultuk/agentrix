import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  persistSessionsSnapshot,
  loadPersistedSessionsSnapshot,
  __setSessionPersistenceTestOverrides,
  __resetSessionPersistenceStateForTests,
} from './session-persistence.js';
import type { WorktreeSessionSummary } from '../types/terminal.js';

describe('session persistence', () => {
  afterEach(() => {
    __setSessionPersistenceTestOverrides();
    __resetSessionPersistenceStateForTests();
  });

  it('writes sanitised snapshots to ~/.agentrix/sessions.json', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agentrix-session-'));
    try {
      const fixedDate = new Date('2024-01-02T03:04:05.000Z');
      __setSessionPersistenceTestOverrides({
        homedir: () => tempRoot,
        randomUUID: () => 'tmp-file',
        now: () => fixedDate,
      });
      const summaries: WorktreeSessionSummary[] = [
        {
          org: 'acme',
          repo: 'widget',
          branch: 'feature/one',
          idle: false,
          lastActivityAt: '2024-01-01T00:00:00.000Z',
        sessions: [
          {
            id: 'terminal-1',
            label: 'Main shell',
            kind: 'interactive',
            tool: 'terminal',
            idle: false,
            usingTmux: false,
            lastActivityAt: '2024-01-01T00:00:00.000Z',
            createdAt: '2024-01-01T00:00:00.000Z',
            tmuxSessionName: null,
          },
          {
            id: 'agent-1',
            label: 'Agent',
            kind: 'automation',
            tool: 'agent',
            idle: true,
            usingTmux: true,
            lastActivityAt: '2024-01-01T00:01:00.000Z',
            createdAt: '2024-01-01T00:00:30.000Z',
            tmuxSessionName: 'tmux-acme-demo',
          },
            // Invalid sessions should be filtered out
            {
              // @ts-expect-error – ensure invalid entries are ignored
              id: null,
            },
          ] as any,
        },
        // Invalid summaries should be filtered
        {
          // @ts-expect-error – missing identifiers should be ignored
          org: '',
        },
      ];

      await persistSessionsSnapshot(summaries);

      const snapshotPath = path.join(tempRoot, '.agentrix', 'sessions.json');
      const raw = await readFile(snapshotPath, 'utf8');
      const parsed = JSON.parse(raw) as {
        version: number;
        generatedAt: string;
        orgs: Record<string, any>;
        summaries: WorktreeSessionSummary[];
      };

      assert.equal(parsed.version, 1);
      assert.equal(parsed.generatedAt, fixedDate.toISOString());
      assert.deepEqual(Object.keys(parsed.orgs), ['acme']);
      const repoEntry = parsed.orgs.acme.widget;
      assert.ok(repoEntry);
      assert.ok(repoEntry.worktrees['feature/one']);
      assert.equal(repoEntry.worktrees['feature/one'].sessions.length, 2);
      assert.equal(repoEntry.worktrees['feature/one'].sessions[0]?.tmuxSessionName, null);
      assert.equal(repoEntry.worktrees['feature/one'].sessions[1]?.tmuxSessionName, 'tmux-acme-demo');
      assert.equal(parsed.summaries.length, 1);
      assert.equal(parsed.summaries[0]?.sessions.length, 2);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('loads persisted snapshots when available', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agentrix-session-load-'));
    try {
      const fixedDate = new Date('2024-02-02T03:04:05.000Z');
      __setSessionPersistenceTestOverrides({
        homedir: () => tempRoot,
        randomUUID: () => 'tmp-load',
        now: () => fixedDate,
      });

      const summaries: WorktreeSessionSummary[] = [
        {
          org: 'acme',
          repo: 'demo',
          branch: 'feature/foo',
          idle: false,
          lastActivityAt: fixedDate.toISOString(),
          sessions: [
            {
              id: 'session-123',
              label: 'Terminal 1',
              kind: 'interactive',
              tool: 'terminal',
              idle: false,
              usingTmux: false,
              lastActivityAt: fixedDate.toISOString(),
              createdAt: fixedDate.toISOString(),
              tmuxSessionName: null,
            },
          ],
        },
      ];

      await persistSessionsSnapshot(summaries);

      const loaded = await loadPersistedSessionsSnapshot();
      assert.deepEqual(loaded, summaries);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('skips persistence when homedir is unavailable', async () => {
    let mkdirCalls = 0;
    __setSessionPersistenceTestOverrides({
      homedir: () => '',
      mkdir: async () => {
        mkdirCalls += 1;
      },
    });

    await persistSessionsSnapshot([]);
    assert.equal(mkdirCalls, 0);
  });
});
