import { test } from 'node:test';
import assert from 'node:assert/strict';

test('createPlanText returns the raw command output', async () => {
  const { createPlanService } = await import(`../plan.js?test=${Date.now()}`);

  const rawOutput = [
    'Thinking through repository state...',
    'Draft steps:',
    '1. Inspect files',
    '2. Modify targets',
    '',
    'Rules:',
    '- Keep output concise.',
    '',
    'exec',
    "bash -lc 'ls' in /tmp succeeded in 10ms: src core",
    '',
    'Implement the following change:',
    'None.',
    '## Problem Summary',
    '- The UI still displays the default theme rather than the requested pink palette.',
    '## Objectives',
    '- Introduce a pink-themed color scheme across the primary layout components.',
    '## Plan of Attack',
    '1. Review existing Tailwind configuration to understand the neutral palette setup.',
    '2. Update Tailwind theme extensions and global styles to add pink variants for background, text, and accents.',
    '3. Adjust key React components to reference the new color tokens ensuring consistent usage.',
    '## Dependencies & Impact',
    '- Tailwind/PostCSS build must be rerun so generated classes pick up the new theme.',
    '## Validation Strategy',
    '- Run `npm run build` under `ui/` to ensure Tailwind compiles without errors and updated styles render.',
    '## Risks & Mitigations',
    '- Risk: Overriding existing neutral tokens could break dark mode contrast; Mitigation: Introduce additive pink tokens and map components selectively.',
    '## Assumptions',
    '- The request only affects styling; functionality remains unchanged.',
  ].join('\n');

  const planService = createPlanService({
    execPlanCommand: async () => rawOutput,
  });
  let result;
  try {
    result = await planService.createPlanText({ prompt: 'Refine plan output' });
  } catch (error) {
    console.error('Plan generation error:', error);
    throw error;
  }

  assert.equal(result, rawOutput);
});

test('createPlanText supports rawPrompt without developer wrappers', async () => {
  const { createPlanService } = await import(`../plan.js?rawTest=${Date.now()}`);

  const capturedCommands = [];
  const planService = createPlanService({
    execPlanCommand: async (command) => {
      capturedCommands.push(command);
      return 'plan output';
    },
  });

  const rawPrompt = 'Using gh issue view 123 to synthesise a plan.';
  await planService.createPlanText({ prompt: rawPrompt, rawPrompt: true });

  assert.equal(capturedCommands.length, 1);
  const rawCommand = capturedCommands[0];
  assert.ok(rawCommand.includes(rawPrompt));
  assert.equal(rawCommand.includes('User Request:'), false);
  assert.equal(rawCommand.includes('Respond with the Codex-ready prompt only.'), false);
  const dangerousIndex = rawCommand.indexOf('--dangerously-bypass-approvals-and-sandbox');
  assert.ok(dangerousIndex !== -1, 'raw prompts should execute in dangerous mode');
  const promptIndex = rawCommand.indexOf(rawPrompt);
  assert.ok(promptIndex !== -1 && dangerousIndex > promptIndex, 'dangerous flag must follow prompt');
  assert.equal(rawCommand.includes('--skip-git-repo-check'), false);

  const standardPrompt = 'Normalise plan output for refactor';
  await planService.createPlanText({ prompt: standardPrompt });

  assert.equal(capturedCommands.length, 2);
  const wrappedCommand = capturedCommands[1];
  assert.ok(wrappedCommand.includes('User Request:'));
  assert.ok(wrappedCommand.includes(standardPrompt));
  assert.equal(wrappedCommand.includes('--dangerously-bypass-approvals-and-sandbox'), false);
  assert.ok(wrappedCommand.includes('--skip-git-repo-check'));
});
