import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { AddressInfo } from 'net';

import { startServer } from '../../../src/web-server';

const instances: Array<Awaited<ReturnType<typeof startServer>>> = [];

afterEach(async () => {
  while (instances.length > 0) {
    const instance = instances.pop();
    if (!instance) {
      continue;
    }

    instance.cleanup();
    await new Promise<void>((resolve) => instance.server.close(() => resolve()));
  }

  mock.restore();
});

describe('startServer host binding', () => {
  it('binds to the IPv4 wildcard host when no host is provided', async () => {
    const instance = await startServer({ port: 0 });
    instances.push(instance);

    const address = instance.server.address() as AddressInfo;
    expect(address.address).toBe('0.0.0.0');
    expect(address.family).toBe('IPv4');
    expect(address.port).toBeGreaterThan(0);
  });

  it('binds to an explicit loopback host', async () => {
    const instance = await startServer({ port: 0, host: '127.0.0.1' });
    instances.push(instance);

    const address = instance.server.address() as AddressInfo;
    expect(address.address).toBe('127.0.0.1');
  });

  it('binds to wildcard host when requested', async () => {
    const instance = await startServer({ port: 0, host: '0.0.0.0' });
    instances.push(instance);

    const address = instance.server.address() as AddressInfo;
    expect(['0.0.0.0', '::']).toContain(address.address);
  });

  it('attaches Vite HMR to the existing HTTP server in dev mode', async () => {
    let viteConfig: Record<string, unknown> | undefined;

    mock.module('vite', () => ({
      createServer: async (config: Record<string, unknown>) => {
        viteConfig = config;
        return {
          middlewares: (_req: unknown, _res: unknown, next: () => void) => next(),
        };
      },
    }));

    const instance = await startServer({ port: 0, dev: true });
    instances.push(instance);

    expect(viteConfig).toBeDefined();
    const serverConfig = viteConfig?.server as
      | { middlewareMode?: boolean; hmr?: { server?: unknown } }
      | undefined;
    expect(serverConfig?.middlewareMode).toBe(true);
    expect(serverConfig?.hmr?.server).toBe(instance.server);
  });
});
