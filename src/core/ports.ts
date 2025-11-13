import { exec as execCallback } from 'node:child_process';
import type { ExecOptions } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(execCallback);

type ExecCommand = (command: string, options?: ExecOptions) => Promise<{ stdout: string | Buffer; stderr: string | Buffer }>;
type Clock = () => number;

interface NgrokListener {
  url(): string;
  close(): Promise<void>;
}

type NgrokForward = (options: Record<string, unknown>) => Promise<NgrokListener> | NgrokListener;
type ForwardLoader = () => Promise<NgrokForward>;

interface PortsDependencies {
  execCommand: ExecCommand;
  loadForward: ForwardLoader;
  now: Clock;
  platform: NodeJS.Platform;
}

interface PortListCommandSpec {
  command: string;
  options?: ExecOptions;
}

const LINUX_PORT_LIST_COMMAND = `ss -ntlpH | awk '{print $5}' | awk -F: '{print $NF}' | sort -n | uniq`;
const DARWIN_PORT_LIST_COMMAND = `lsof -nP -iTCP -sTCP:LISTEN | awk 'NR>1 {print $9}' | awk -F ':' '{print $NF}' | sort -n | uniq`;
const WINDOWS_PORT_LIST_COMMAND = `powershell.exe -NoLogo -NoProfile -Command "Get-NetTCPConnection -State Listen | Select-Object -ExpandProperty LocalPort | Sort-Object -Unique"`;

function resolvePortListCommand(platform: NodeJS.Platform): PortListCommandSpec | null {
  switch (platform) {
    case 'linux':
    case 'android':
      return { command: LINUX_PORT_LIST_COMMAND, options: { shell: '/bin/sh' } };
    case 'darwin':
      return { command: DARWIN_PORT_LIST_COMMAND, options: { shell: '/bin/sh' } };
    case 'win32':
      return { command: WINDOWS_PORT_LIST_COMMAND };
    default:
      return null;
  }
}

const defaultDependencies: PortsDependencies = {
  execCommand: async (command, options) => {
    const { stdout, stderr } = await execAsync(command, options);
    return { stdout, stderr };
  },
  loadForward: async () => {
    const module = await import('@ngrok/ngrok');
    const forward = (module as { forward?: NgrokForward }).forward;
    if (typeof forward !== 'function') {
      throw new Error('Ngrok SDK forward function is unavailable');
    }
    return forward;
  },
  now: () => Date.now(),
  platform: process.platform,
};

let activeDependencies: PortsDependencies = { ...defaultDependencies };

/**
 * @internal Test helper to override dependencies
 */
export function __setPortsTestOverrides(overrides?: Partial<PortsDependencies>): void {
  if (!overrides) {
    activeDependencies = { ...defaultDependencies };
    return;
  }
  activeDependencies = {
    ...activeDependencies,
    ...overrides,
  };
}

/**
 * Executes the system command to list active TCP ports and returns a unique sorted list.
 */
export async function listActivePorts(): Promise<number[]> {
  try {
    const platform = activeDependencies.platform ?? process.platform;
    const commandSpec = resolvePortListCommand(platform);
    if (!commandSpec) {
      throw new Error(`Port listing is not supported on platform: ${platform}`);
    }

    const { stdout } = await activeDependencies.execCommand(commandSpec.command, commandSpec.options);
    const output = typeof stdout === 'string' ? stdout : stdout.toString('utf8');
    if (!output) {
      return [];
    }
    const seen = new Set<number>();
    const values = output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    for (const token of values) {
      const parsed = Number.parseInt(token, 10);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        continue;
      }
      seen.add(parsed);
    }

    return Array.from(seen).sort((a, b) => a - b);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to list active ports: ${message}`);
  }
}

export interface PortTunnel {
  port: number;
  url: string;
  createdAt: number;
}

export interface PortTunnelManager {
  open(port: number): Promise<PortTunnel>;
  close(port: number): Promise<void>;
  closeAll(): Promise<void>;
  list(): PortTunnel[];
}

interface PortTunnelManagerOptions {
  authtoken?: string;
  proto?: string;
  schemes?: string | string[];
}

/**
 * Creates a manager responsible for opening and tracking ngrok tunnels mapped to local ports.
 */
export function createPortTunnelManager({
  authtoken,
  proto = 'http',
  schemes,
}: PortTunnelManagerOptions = {}): PortTunnelManager {
  const tunnels = new Map<number, { listener: NgrokListener; details: PortTunnel }>();
  let forwardFnPromise: Promise<NgrokForward> | null = null;

  async function resolveForward(): Promise<NgrokForward> {
    if (!forwardFnPromise) {
      forwardFnPromise = activeDependencies.loadForward();
    }
    return forwardFnPromise;
  }

  async function disposeTunnel(port: number): Promise<void> {
    const entry = tunnels.get(port);
    if (!entry) {
      return;
    }

    tunnels.delete(port);
    try {
      await entry.listener.close();
    } catch {
      // Swallow close errors to avoid masking other shutdown operations
    }
  }

  return {
    async open(port: number): Promise<PortTunnel> {
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('Port must be an integer between 1 and 65535');
      }
      if (!authtoken) {
        throw new Error('Ngrok API key is not configured');
      }

      await disposeTunnel(port);

      const forward = await resolveForward();
      const forwardOptions: Record<string, unknown> = {
        addr: port,
        authtoken,
        proto,
      };
      const resolvedSchemes = schemes ?? (proto === 'http' ? ['https'] : undefined);
      if (resolvedSchemes) {
        forwardOptions['schemes'] = resolvedSchemes;
      }
      const listener = await forward(forwardOptions) as NgrokListener;

      if (!listener || typeof listener.url !== 'function' || typeof listener.close !== 'function') {
        throw new Error('Ngrok listener returned an unexpected value');
      }

      const url = listener.url();
      if (!url) {
        await listener.close().catch(() => {});
        throw new Error('Ngrok tunnel did not return a public URL');
      }

      const details: PortTunnel = {
        port,
        url,
        createdAt: activeDependencies.now(),
      };
      tunnels.set(port, { listener, details });

      return details;
    },

    async close(port: number): Promise<void> {
      await disposeTunnel(port);
    },

    async closeAll(): Promise<void> {
      const closeTasks: Promise<void>[] = [];
      for (const [port] of tunnels) {
        closeTasks.push(disposeTunnel(port));
      }
      await Promise.all(closeTasks);
    },

    list(): PortTunnel[] {
      return Array.from(tunnels.values()).map((entry) => entry.details);
    },
  };
}
