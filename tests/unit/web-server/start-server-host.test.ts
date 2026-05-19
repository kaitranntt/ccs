import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { AddressInfo } from 'net';

import { startServer } from '../../../src/web-server';

const instances: Array<Awaited<ReturnType<typeof startServer>>> = [];

class MockUpgradeSocket {
  data = '';
  destroyed = false;

  write(chunk: string | Buffer): boolean {
    this.data += chunk.toString();
    return true;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

function dispatchUpgrade(instance: Awaited<ReturnType<typeof startServer>>, url: string) {
  const listener = instance.server.listeners('upgrade')[0] as (
    request: unknown,
    socket: MockUpgradeSocket,
    head: Buffer
  ) => void;
  const socket = new MockUpgradeSocket();

  listener({ url, headers: {}, socket: { remoteAddress: '127.0.0.1' } }, socket, Buffer.alloc(0));

  return socket;
}

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
  it('binds to localhost by default when no host is provided', async () => {
    const instance = await startServer({ port: 0 });
    instances.push(instance);

    const address = instance.server.address() as AddressInfo;
    expect(address.port).toBeGreaterThan(0);
    expect(['127.0.0.1', '::1']).toContain(address.address);
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

  it('rejects unsupported production websocket upgrade paths', async () => {
    const instance = await startServer({ port: 0 });
    instances.push(instance);

    const socket = dispatchUpgrade(instance, '/vite-hmr');

    expect(socket.data.startsWith('HTTP/1.1 404')).toBe(true);
    expect(socket.destroyed).toBe(true);
  });

  it('rejects malformed websocket upgrade targets', async () => {
    const instance = await startServer({ port: 0 });
    instances.push(instance);

    const socket = dispatchUpgrade(instance, 'http://[bad');

    expect(socket.data.startsWith('HTTP/1.1 400')).toBe(true);
    expect(socket.destroyed).toBe(true);
  });
});
