import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import express from 'express';
import type { Server } from 'http';

describe('cliproxy routing routes', () => {
  let server: Server;
  let baseUrl = '';
  let readStateMock: ReturnType<typeof mock>;
  let applyStrategyMock: ReturnType<typeof mock>;
  let readAffinityStateMock: ReturnType<typeof mock>;
  let applyAffinityMock: ReturnType<typeof mock>;
  let readRetryMock: ReturnType<typeof mock>;
  let applyRetryMock: ReturnType<typeof mock>;

  beforeEach(async () => {
    readStateMock = mock(async () => ({
      strategy: 'round-robin',
      source: 'live',
      target: 'local',
      reachable: true,
    }));
    applyStrategyMock = mock(async () => ({
      strategy: 'fill-first',
      source: 'live',
      target: 'local',
      reachable: true,
      applied: 'live-and-config',
    }));
    readAffinityStateMock = mock(async () => ({
      enabled: true,
      ttl: '1h',
      source: 'config',
      target: 'local',
      reachable: true,
      manageable: true,
    }));
    applyAffinityMock = mock(async () => ({
      enabled: false,
      ttl: '30m',
      source: 'config',
      target: 'local',
      reachable: true,
      manageable: true,
      applied: 'config-only',
    }));
    readRetryMock = mock(async () => ({
      request_retry: 2,
      max_retry_interval: 20,
      source: 'live',
      target: 'local',
      reachable: true,
      manageable: true,
    }));
    applyRetryMock = mock(async () => ({
      request_retry: 3,
      max_retry_interval: 30,
      source: 'live',
      target: 'local',
      reachable: true,
      manageable: true,
      applied: 'live-and-config',
    }));

    mock.module('../../../src/cliproxy/routing/routing-strategy', () => ({
      readCliproxyRoutingState: readStateMock,
      applyCliproxyRoutingStrategy: applyStrategyMock,
      readCliproxySessionAffinityState: readAffinityStateMock,
      applyCliproxySessionAffinitySettings: applyAffinityMock,
      normalizeCliproxyRoutingStrategy: (value: unknown) => {
        if (value === 'round-robin' || value === 'fill-first') {
          return value;
        }
        return null;
      },
      normalizeCliproxySessionAffinityEnabled: (value: unknown) => {
        if (value === true || value === false) return value;
        return null;
      },
      normalizeCliproxySessionAffinityTtl: (value: unknown) => {
        if (value === '30m' || value === '1h') return value;
        return null;
      },
    }));
    mock.module('../../../src/cliproxy/routing/retry-settings', () => ({
      readCliproxyRetryState: readRetryMock,
      applyCliproxyRetrySettings: applyRetryMock,
      normalizeCliproxyRetryValue: (value: unknown) =>
        typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null,
    }));

    const { default: routingRoutes } = await import(
      `../../../src/web-server/routes/cliproxy-routing-routes?test=${Date.now()}-${Math.random()}`
    );

    const app = express();
    app.use(express.json());
    app.use('/api/cliproxy', routingRoutes);

    server = await new Promise<Server>((resolve, reject) => {
      const instance = app.listen(0, '127.0.0.1');
      instance.once('error', reject);
      instance.once('listening', () => resolve(instance));
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Unable to resolve test server port');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    mock.restore();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('returns the current routing state', async () => {
    const response = await fetch(`${baseUrl}/api/cliproxy/routing/strategy`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      strategy: 'round-robin',
      source: 'live',
      target: 'local',
      reachable: true,
    });
    expect(readStateMock).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid routing values', async () => {
    const response = await fetch(`${baseUrl}/api/cliproxy/routing/strategy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'auto' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Invalid strategy. Use: round-robin or fill-first',
    });
    expect(applyStrategyMock).not.toHaveBeenCalled();
  });

  it('applies a valid routing strategy', async () => {
    const response = await fetch(`${baseUrl}/api/cliproxy/routing/strategy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'fill-first' }),
    });

    expect(response.status).toBe(200);
    expect(applyStrategyMock).toHaveBeenCalledWith('fill-first');
    expect(await response.json()).toEqual({
      strategy: 'fill-first',
      source: 'live',
      target: 'local',
      reachable: true,
      applied: 'live-and-config',
    });
  });

  it('returns the current session-affinity state', async () => {
    const response = await fetch(`${baseUrl}/api/cliproxy/routing/session-affinity`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      enabled: true,
      ttl: '1h',
      source: 'config',
      target: 'local',
      reachable: true,
      manageable: true,
    });
    expect(readAffinityStateMock).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid session-affinity payloads', async () => {
    const response = await fetch(`${baseUrl}/api/cliproxy/routing/session-affinity`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: 'auto', ttl: 'forever' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Invalid session affinity payload. Use enabled=true|false and ttl like 30m or 1h.',
    });
    expect(applyAffinityMock).not.toHaveBeenCalled();
  });

  it('applies valid session-affinity settings', async () => {
    const response = await fetch(`${baseUrl}/api/cliproxy/routing/session-affinity`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false, ttl: '30m' }),
    });

    expect(response.status).toBe(200);
    expect(applyAffinityMock).toHaveBeenCalledWith({ enabled: false, ttl: '30m' });
    expect(await response.json()).toEqual({
      enabled: false,
      ttl: '30m',
      source: 'config',
      target: 'local',
      reachable: true,
      manageable: true,
      applied: 'config-only',
    });
  });

  it('returns and updates retry settings through the dedicated route', async () => {
    const readResponse = await fetch(`${baseUrl}/api/cliproxy/retry`);
    expect(readResponse.status).toBe(200);
    expect((await readResponse.json()).request_retry).toBe(2);

    const updateResponse = await fetch(`${baseUrl}/api/cliproxy/retry`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_retry: 3, max_retry_interval: 30 }),
    });
    expect(updateResponse.status).toBe(200);
    expect(applyRetryMock).toHaveBeenCalledWith({
      request_retry: 3,
      max_retry_interval: 30,
    });
  });

  it.each([
    { request_retry: -1, max_retry_interval: 30 },
    { request_retry: 1.5, max_retry_interval: 30 },
    { request_retry: Number.MAX_SAFE_INTEGER + 1, max_retry_interval: 30 },
    { request_retry: 1, max_retry_interval: '30' },
  ])('rejects invalid retry payload %#', async (payload) => {
    const response = await fetch(`${baseUrl}/api/cliproxy/retry`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(400);
    expect(applyRetryMock).not.toHaveBeenCalled();
  });
});
