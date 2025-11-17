import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  createPlan,
  deletePlan,
  listPlans,
  readPlan,
  updatePlan,
  type PlanRecord,
} from './plan-mode-store.js';

describe('plan-mode-store', () => {
  let workdir: string;
  let planStoreRoot: string;
  const PLAN_STORE_ENV = 'AGENTRIX_PLAN_STORE';
  let originalPlanStoreEnv: string | undefined;

  beforeEach(async () => {
    workdir = await mkdtemp(join(tmpdir(), 'agentrix-plan-mode-'));
    planStoreRoot = await mkdtemp(join(tmpdir(), 'agentrix-plan-store-'));
    originalPlanStoreEnv = process.env[PLAN_STORE_ENV];
    process.env[PLAN_STORE_ENV] = planStoreRoot;
  });

  afterEach(async () => {
    if (workdir) {
      await rm(workdir, { recursive: true, force: true }).catch(() => {});
    }
    if (planStoreRoot) {
      await rm(planStoreRoot, { recursive: true, force: true }).catch(() => {});
    }
    if (originalPlanStoreEnv === undefined) {
      delete process.env[PLAN_STORE_ENV];
    } else {
      process.env[PLAN_STORE_ENV] = originalPlanStoreEnv;
    }
  });

  async function createSamplePlan(): Promise<PlanRecord> {
    return await createPlan(
      { workdir, org: 'acme', repo: 'demo' },
      {
        title: 'Demo Feature',
        markdown: '# Plan\n- step one',
        defaultBranch: 'main',
        source: { type: 'issue', issueNumber: 42, issueUrl: 'https://example.test' },
      },
    );
  }

  it('creates and lists plans per repository', async () => {
    const created = await createSamplePlan();
    assert.equal(created.org, 'acme');
    assert.equal(created.repo, 'demo');
    assert.equal(created.slug, 'demo-feature');
    assert.equal(created.status, 'draft');
    assert.equal(created.defaultBranch, 'main');
    assert.equal(created.markdown.includes('# Plan'), true);
    assert.ok(created.createdAt);
    assert.equal(created.source.issueNumber, 42);

    const plans = await listPlans({ workdir, org: 'acme', repo: 'demo' });
    assert.equal(plans.length, 1);
    assert.equal(plans[0]?.id, created.id);
  });

  it('updates plan content and records diff metadata', async () => {
    const created = await createSamplePlan();
    const updated = await updatePlan(
      { workdir, org: 'acme', repo: 'demo', id: created.id },
      { markdown: '# Plan\n- step one\n- step two', updatedBy: 'codex' },
    );
    assert.equal(updated.status, 'updated');
    assert.ok(updated.lastChange);
    assert.equal(updated.lastChange?.hunks.length ?? 0 > 0, true);
    const firstHunk = updated.lastChange?.hunks[0];
    assert.ok(firstHunk);
    const hasAddition = firstHunk?.lines.some((line) => line.type === 'added' && line.text.includes('step two'));
    assert.equal(hasAddition, true);

    const roundTrip = await readPlan({ workdir, org: 'acme', repo: 'demo', id: created.id });
    assert.ok(roundTrip);
    assert.equal(roundTrip?.markdown.includes('step two'), true);
  });

  it('deletes plans and leaves repository storage empty', async () => {
    const created = await createSamplePlan();
    await deletePlan({ workdir, org: 'acme', repo: 'demo', id: created.id });
    const plans = await listPlans({ workdir, org: 'acme', repo: 'demo' });
    assert.equal(plans.length, 0);
  });
});
