import assert from 'node:assert/strict';
import { describe, it, mock, beforeEach, afterEach } from 'node:test';

import {
  listActivePorts,
  createPortTunnelManager,
  __setPortsTestOverrides,
} from './ports.js';

describe('ports core utilities', () => {
  beforeEach(() => {
    __setPortsTestOverrides();
  });

  afterEach(() => {
    __setPortsTestOverrides();
  });

  describe('listActivePorts', () => {
    it('parses unique numeric ports from command output', async () => {
      const execMock = mock.fn(async () => ({
        stdout: '80\n443\n3000\n0\n65536\nnot-a-port\n  22 \n3000\n',
        stderr: '',
      }));

      __setPortsTestOverrides({ execCommand: execMock });

      const ports = await listActivePorts();

      assert.deepEqual(ports, [22, 80, 443, 3000]);
      assert.equal(execMock.mock.callCount(), 1);
    });

    it('returns empty array when command produces no output', async () => {
      const execMock = mock.fn(async () => ({ stdout: '', stderr: '' }));
      __setPortsTestOverrides({ execCommand: execMock });

      const ports = await listActivePorts();

      assert.deepEqual(ports, []);
    });

    it('throws a descriptive error when command execution fails', async () => {
      const execMock = mock.fn(async () => {
        throw new Error('ss not found');
      });
      __setPortsTestOverrides({ execCommand: execMock });

      await assert.rejects(
        () => listActivePorts(),
        /Failed to list active ports: ss not found/,
      );
    });
  });

  describe('createPortTunnelManager', () => {
    it('requires an ngrok API key to open tunnels', async () => {
      const forwardMock = mock.fn(async () => ({
        url: () => 'https://example',
        close: async () => {},
      }));
      __setPortsTestOverrides({
        loadForward: async () => forwardMock,
        now: () => 1700,
      });

      const manager = createPortTunnelManager({ authtoken: undefined });

      await assert.rejects(
        () => manager.open(3000),
        /Ngrok API key is not configured/,
      );
      assert.equal(forwardMock.mock.callCount(), 0);
    });

    it('opens, tracks, and closes tunnels for ports', async () => {
      const closeMock = mock.fn(async () => {});
      const forwardMock = mock.fn(async () => ({
        url: () => 'https://example',
        close: closeMock,
      }));
      const nowMock = mock.fn(() => 25_000);
      __setPortsTestOverrides({
        loadForward: async () => forwardMock,
        now: nowMock,
      });

      const manager = createPortTunnelManager({ authtoken: 'token-123' });
      const first = await manager.open(8080);
      const forwardCall = forwardMock.mock.calls[0];
      assert.ok(forwardCall);
      assert.deepEqual(forwardCall.arguments[0], {
        addr: 8080,
        authtoken: 'token-123',
        proto: 'http',
        schemes: ['https'],
      });

      assert.equal(first.url, 'https://example');
      assert.equal(first.port, 8080);
      assert.equal(first.createdAt, 25_000);
      assert.deepEqual(manager.list(), [first]);

      await manager.close(8080);
      assert.equal(closeMock.mock.callCount(), 1);
      assert.deepEqual(manager.list(), []);
    });

    it('replaces existing tunnel for the same port', async () => {
      const closeFirst = mock.fn(async () => {});
      const closeSecond = mock.fn(async () => {});
      let invocationCount = 0;
      const forwardMock = mock.fn(async () => {
        invocationCount += 1;
        if (invocationCount === 1) {
          return {
            url: () => 'https://first',
            close: closeFirst,
          };
        }
        return {
          url: () => 'https://second',
          close: closeSecond,
        };
      });
      const nowMock = mock.fn(() => 1234);
      __setPortsTestOverrides({
        loadForward: async () => forwardMock,
        now: nowMock,
      });

      const manager = createPortTunnelManager({ authtoken: 'key' });

      const first = await manager.open(9000);
      assert.equal(first.url, 'https://first');

      const second = await manager.open(9000);
      assert.equal(second.url, 'https://second');
      assert.equal(closeFirst.mock.callCount(), 1);
      assert.deepEqual(manager.list().map((entry) => entry.url), ['https://second']);

      await manager.closeAll();
      assert.equal(closeSecond.mock.callCount(), 1);
      assert.deepEqual(manager.list(), []);
    });
  });
});
