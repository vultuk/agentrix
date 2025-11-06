import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { printHelp, printVersion } from './help.js';

describe('CLI help utilities', () => {
  it('prints help text to stdout', () => {
    const output: string[] = [];
    const stdoutMock = mock.method(process.stdout, 'write', (chunk: string | Uint8Array) => {
      output.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    });

    try {
      printHelp();
    } finally {
      stdoutMock.mock.restore();
    }

    const combined = output.join('');
    assert.match(combined, /Usage: agentrix/);
    assert.match(combined, /--port/);
  });

  it('prints version information from package metadata', async () => {
    const output: string[] = [];
    const stdoutMock = mock.method(process.stdout, 'write', (chunk: string | Uint8Array) => {
      output.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    });

    try {
      const pkg = await import('../../package.json', { with: { type: 'json' } });
      const initialLength = stdoutMock.mock.calls.length;
      await printVersion();
      const versionOutput = stdoutMock.mock.calls
        .slice(initialLength)
        .map((call) => (typeof call.arguments[0] === 'string' ? call.arguments[0] : Buffer.from(call.arguments[0]).toString('utf8')))
        .join('');
      assert.equal(versionOutput, `${pkg.default.version}\n`);
    } finally {
      stdoutMock.mock.restore();
    }
  });
});

