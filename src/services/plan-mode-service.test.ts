import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PLAN_START_TAG, PLAN_END_TAG } from '../constants/plan-tags.js';
import { normalisePlanMarkdown } from './plan-mode-service.js';

describe('normalisePlanMarkdown', () => {
  it('keeps the full plan content when literal plan tags appear inside the plan body', () => {
    const rawPlan = `${PLAN_START_TAG}
## Overview
We sometimes mention ${PLAN_START_TAG} or ${PLAN_END_TAG} literally when explaining the protocol.

### Next Steps
Make sure mentions of ${PLAN_END_TAG} do not truncate the text that follows.
${PLAN_END_TAG}`;

    const normalised = normalisePlanMarkdown(rawPlan);
    assert.equal(normalised, rawPlan.trim());
  });

  it('returns trimmed markdown when plan tags are absent', () => {
    const fallback = normalisePlanMarkdown(`
## Overview

This plan does not contain plan tags.
`);
    assert.equal(fallback, `## Overview

This plan does not contain plan tags.`);
  });
});
