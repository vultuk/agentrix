/**
 * Ports API service
 */

import { apiGet, apiPost } from './api-client.js';

interface FetchPortsResponse {
  ports?: unknown;
}

interface OpenTunnelResponse {
  tunnel?: {
    port?: number;
    url?: string;
    createdAt?: number;
  };
}

export interface PortTunnel {
  port: number;
  url: string;
  createdAt: number;
}

/**
 * Fetches the list of active ports exposed by the backend.
 */
export async function fetchPorts(): Promise<number[]> {
  const response = await apiGet<FetchPortsResponse>('/api/ports', {
    errorPrefix: 'Failed to load ports',
  });

  const list = Array.isArray(response?.ports) ? response.ports : [];
  const ports = list
    .map((value) => Number.parseInt(String(value), 10))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 65535);

  return Array.from(new Set(ports)).sort((a, b) => a - b);
}

/**
 * Requests creation of a temporary ngrok tunnel for a specific port.
 */
export async function openPortTunnel(port: number): Promise<PortTunnel> {
  const response = await apiPost<OpenTunnelResponse>(
    '/api/ports/tunnel',
    { port },
    { errorPrefix: 'Failed to open tunnel' },
  );

  if (!response?.tunnel) {
    throw new Error('Tunnel details were not returned by the server');
  }

  const tunnelPort =
    Number.isInteger(response.tunnel.port) && response.tunnel.port
      ? response.tunnel.port
      : port;
  const url =
    typeof response.tunnel.url === 'string' && response.tunnel.url.length > 0
      ? response.tunnel.url
      : '';
  const createdAt =
    typeof response.tunnel.createdAt === 'number'
      ? response.tunnel.createdAt
      : Date.now();

  if (!url) {
    throw new Error('Server did not return a tunnel URL');
  }

  return {
    port: tunnelPort,
    url,
    createdAt,
  };
}
