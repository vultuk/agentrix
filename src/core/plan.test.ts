import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPlanService } from './plan.js';

describe('createPlanService', () => {
  const PROMPT_FOOTER = 'Respond with the Codex-ready prompt only.';

  it('generates plan text using developer message prompt and custom executor', async () => {
    const commands: Array<{ command: string; cwd?: string; signal?: AbortSignal }> = [];
    const service = createPlanService({
      execPlanCommand: async (command, options: { cwd?: string; signal?: AbortSignal }) => {
        commands.push({ command, cwd: options.cwd, signal: options.signal });
        return 'generated plan';
      },
    });

    const plan = await service.createPlanText({ prompt: 'Implement feature', cwd: '/tmp/work' });
    if (plan !== 'generated plan') {
      throw new Error(`plan value: ${JSON.stringify(plan)}`);
    }
    assert.equal(commands.length, 1);
    const call = commands[0];
    assert.ok(call.command.startsWith('command codex '));
    assert.ok(call.command.includes(PROMPT_FOOTER));
    assert.ok(call.command.includes('User Request:\nImplement feature'));
    assert.equal(call.cwd, '/tmp/work');
    assert.ok(call.signal instanceof AbortSignal);

    const stream = await service.createPlanStream({ prompt: 'Implement feature' });
    const chunks = [] as string[];
    for await (const chunk of stream) {
      chunks.push(chunk as string);
    }
    assert.equal(chunks.join(''), 'generated plan');

    await service.dispose();
  });

  it('uses raw prompts without developer message and supports alternate llms', async () => {
    const captured: string[] = [];
    const service = createPlanService({
      execPlanCommand: async (command) => {
        captured.push(command as string);
        return 'raw-plan';
      },
    });

    const plan = await service.createPlanText({ prompt: 'RAW', rawPrompt: true, llm: 'codex', dangerousMode: true });
    assert.equal(plan, 'raw-plan');
    assert.equal(captured.length, 1);
    const command = captured[0];
    assert.ok(command.startsWith('command codex '));
    assert.ok(command.includes('--dangerously-bypass-approvals-and-sandbox'));
    assert.ok(!command.includes('--skip-git-repo-check'));
    assert.ok(!command.includes(PROMPT_FOOTER));

    await service.dispose();
  });

  it('reports failures with llm context and respects empty output guard', async () => {
    const service = createPlanService({
      execPlanCommand: async () => '   ',
    });

    await assert.rejects(
      () => service.createPlanText({ prompt: 'Implement feature', llm: 'claude' }),
      /Generated plan was empty/,
    );

    const failureService = createPlanService({
      execPlanCommand: async () => {
        throw new Error('boom');
      },
    });

    await assert.rejects(
      () => failureService.createPlanText({ prompt: 'Do it', llm: 'claude' }),
      /Failed to generate plan using claude: boom/,
    );

    await service.dispose();
    await failureService.dispose();
  });

  it('aborts running commands when disposed', async () => {
    let abortSignal: AbortSignal | undefined;
    let rejectPromise: ((error: unknown) => void) | undefined;
    const service = createPlanService({
      execPlanCommand: (_command, options: { signal?: AbortSignal }) =>
        new Promise<string>((_resolve, reject) => {
          abortSignal = options.signal;
          rejectPromise = reject;
        }),
    });

    const resultPromise = service.createPlanText({ prompt: 'Long running task' });

    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(abortSignal);
    assert.equal(abortSignal?.aborted, false);

    abortSignal?.addEventListener('abort', () => {
      rejectPromise?.(Object.assign(new Error('Command aborted'), { name: 'AbortError' }));
    });

    const disposePromise = service.dispose();

    await assert.rejects(resultPromise, /Plan generation was cancelled/);
    await disposePromise;
  });
});


