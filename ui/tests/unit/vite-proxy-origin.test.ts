import { describe, expect, it, vi } from 'vitest';
import type { UserConfig } from 'vite';

vi.mock('vite', () => ({ defineConfig: (config: UserConfig) => config }));
vi.mock('@vitejs/plugin-react', () => ({ default: () => ({ name: 'react' }) }));
vi.mock('@tailwindcss/vite', () => ({ default: () => ({ name: 'tailwindcss' }) }));

const { default: viteConfig } = await import('../../vite.config');

type ProxyRequest = {
  getHeader(name: string): string | undefined;
  setHeader(name: string, value: string): void;
};

type IncomingRequest = {
  headers: { origin?: string };
};

type ProxyListener = (proxyRequest: ProxyRequest, request: IncomingRequest) => void;

function getProxyListener(route: '/api' | '/ws', event: 'proxyReq' | 'proxyReqWs'): ProxyListener {
  const proxyOptions = (viteConfig as UserConfig).server?.proxy?.[route];
  if (!proxyOptions || typeof proxyOptions === 'string' || !proxyOptions.configure) {
    throw new Error(`Missing configure hook for ${route}`);
  }

  const listeners = new Map<string, ProxyListener>();
  const proxy = {
    on(registeredEvent: string, listener: ProxyListener) {
      listeners.set(registeredEvent, listener);
    },
  };

  proxyOptions.configure(proxy as never, proxyOptions);

  const listener = listeners.get(event);
  if (!listener) {
    throw new Error(`Missing ${event} listener for ${route}`);
  }

  return listener;
}

function applyOriginRewrite(listener: ProxyListener, origin?: string): string | undefined {
  const headers = new Map<string, string>();
  if (origin !== undefined) {
    headers.set('origin', origin);
  }

  listener(
    {
      getHeader: (name) => headers.get(name),
      setHeader: (name, value) => headers.set(name, value),
    },
    { headers: { origin } }
  );

  return headers.get('origin');
}

it('requires the trusted Vite development port', () => {
  expect((viteConfig as UserConfig).server?.strictPort).toBe(true);
});

describe.each([
  ['/api', 'proxyReq'],
  ['/ws', 'proxyReqWs'],
] as const)('%s Vite dev proxy origin handling', (route, event) => {
  const listener = getProxyListener(route, event);

  it.each(['http://localhost:5173', 'http://127.0.0.1:5173', 'http://[::1]:5173'])(
    'rewrites trusted Vite origin %s to the backend origin',
    (origin) => {
      expect(applyOriginRewrite(listener, origin)).toBe('http://localhost:3000');
    }
  );

  it.each([
    'http://attacker.example.test',
    'http://localhost.evil:5173',
    'http://localhost:5174',
    'https://localhost:5173',
  ])('preserves untrusted origin %s', (origin) => {
    expect(applyOriginRewrite(listener, origin)).toBe(origin);
  });

  it('preserves a missing origin', () => {
    expect(applyOriginRewrite(listener)).toBeUndefined();
  });
});
