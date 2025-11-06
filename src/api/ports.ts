import { listActivePorts } from '../core/ports.js';
import { ValidationError } from '../infrastructure/errors/index.js';
import { createHandler, createQueryHandler } from './base-handler.js';
import type { PortTunnelManager, PortTunnel } from '../core/ports.js';
import type { RequestContext } from '../types/http.js';

interface PortApiDependencies {
  listActivePorts: typeof listActivePorts;
}

const defaultDependencies: PortApiDependencies = {
  listActivePorts,
};

let activeDependencies: PortApiDependencies = { ...defaultDependencies };

/**
 * @internal Test helper to override dependencies
 */
export function __setPortsApiTestOverrides(overrides?: Partial<PortApiDependencies>): void {
  if (!overrides) {
    activeDependencies = { ...defaultDependencies };
    return;
  }
  activeDependencies = {
    ...activeDependencies,
    ...overrides,
  } as PortApiDependencies;
}

interface CreatePortHandlersOptions {
  portManager: PortTunnelManager;
}

interface OpenTunnelInput {
  port: number;
}

interface OpenTunnelValidatorInput {
  port: number;
}

function validateOpenTunnelPayload(payload: unknown): OpenTunnelValidatorInput {
  if (!payload || typeof payload !== 'object') {
    throw new ValidationError('Port payload is required');
  }
  const candidate = (payload as { port?: unknown }).port;
  let parsed: number;
  if (typeof candidate === 'string') {
    parsed = Number.parseInt(candidate, 10);
  } else if (typeof candidate === 'number') {
    parsed = candidate;
  } else {
    throw new ValidationError('Port must be an integer');
  }
  if (!Number.isInteger(parsed)) {
    throw new ValidationError('Port must be an integer');
  }
  if (parsed < 1 || parsed > 65535) {
    throw new ValidationError('Port must be between 1 and 65535');
  }
  return { port: parsed };
}

export interface PortHandlers {
  list: (context: RequestContext) => Promise<void>;
  openTunnel: (context: RequestContext) => Promise<void>;
}

export function createPortHandlers({ portManager }: CreatePortHandlersOptions): PortHandlers {
  if (!portManager) {
    throw new Error('portManager is required');
  }

  const list = createQueryHandler(async (context: RequestContext) => {
    const ports = await activeDependencies.listActivePorts();
    context.res.setHeader('Cache-Control', 'no-store');
    return { ports };
  });

  const openTunnel = createHandler<OpenTunnelInput, PortTunnel>({
    validator: validateOpenTunnelPayload,
    successCode: 201,
    handler: async ({ port }) => {
      const tunnel = await portManager.open(port);
      return tunnel;
    },
    responseTransformer: (tunnel) => ({ tunnel }),
  });

  return {
    list,
    openTunnel,
  };
}
