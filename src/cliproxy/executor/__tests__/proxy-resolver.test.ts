/**
 * Unit tests for proxy-resolver.ts (Phase 03 extraction)
 *
 * Tests cover the proxy resolution + remote reachability + binary acquisition
 * logic extracted from executor/index.ts.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { ResolveExecutorProxyContext } from '../proxy-resolver';
import type { ExecutorConfig } from '../../types';
import type { UnifiedConfig } from '../../../config/schemas/unified-config';

// ── Module mocks ──────────────────────────────────────────────────────────────

const mockEnsureCLIProxyBinary = mock(async () => '/usr/local/bin/cliproxy');
const mockGetConfiguredBackend = mock(() => 'original');
const mockGetPlusBackendUnavailableMessage = mock(() => 'Plus backend unavailable');
const mockInstallCliproxyVersion = mock(async () => undefined);
const mockFetchLatestCliproxyVersion = mock(async () => 'test-version');
const mockCheckCliproxyUpdate = mock(async () => ({ available: false }));

mock.module('../../binary-manager', () => ({
  ensureCLIProxyBinary: mockEnsureCLIProxyBinary,
  getConfiguredBackend: mockGetConfiguredBackend,
  getPlusBackendUnavailableMessage: mockGetPlusBackendUnavailableMessage,
  getStoredConfiguredBackend: mockGetConfiguredBackend,
  getCLIProxyPath: mock(() => '/usr/local/bin/cliproxy'),
  getInstalledCliproxyVersion: mock(() => 'test-version'),
  isCLIProxyInstalled: mock(() => true),
  resolveLocalBackend: mockGetConfiguredBackend,
  syncPlusFallbackStateIfNeeded: mock(() => {}),
  installCliproxyVersion: mockInstallCliproxyVersion,
  fetchLatestCliproxyVersion: mockFetchLatestCliproxyVersion,
  checkCliproxyUpdate: mockCheckCliproxyUpdate,
  getPinnedVersion: mock(() => null),
  savePinnedVersion: mock(() => {}),
  clearPinnedVersion: mock(() => {}),
  isVersionPinned: mock(() => false),
  getVersionPinPath: mock(() => '/tmp/cliproxy-version-pin'),
  BinaryManager: class {},
}));

const mockCheckRemoteProxy = mock(
  async (): Promise<{ reachable: boolean; latencyMs?: number; error?: string }> => ({
    reachable: true,
  })
);
mock.module('../../services/remote-proxy-client', () => ({
  checkRemoteProxy: mockCheckRemoteProxy,
}));

mock.module('../retry-handler', () => ({
  isNetworkError: mock(() => false),
  handleNetworkError: mock(() => {}),
  handleTokenExpiration: mock(() => {}),
  handleQuotaCheck: mock(() => {}),
  PROVIDER_ERROR_PATTERNS: [],
  detectFailedTier: mock(() => null),
  isProviderError: mock(() => false),
}));

// ── Import after mocks ────────────────────────────────────────────────────────

const { resolveExecutorProxy, resolveExecutorProxyConfig } = await import('../proxy-resolver');

const PROXY_ENV_KEYS = [
  'CCS_PROXY_HOST',
  'CCS_PROXY_PORT',
  'CCS_PROXY_PROTOCOL',
  'CCS_PROXY_AUTH_TOKEN',
  'CCS_PROXY_TIMEOUT',
  'CCS_PROXY_FALLBACK_ENABLED',
  'CCS_ALLOW_SELF_SIGNED',
] as const;

let proxyEnvSnapshot: Record<string, string | undefined> = {};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMinimalUnifiedConfig(): UnifiedConfig {
  return {
    cliproxy_server: undefined,
  } as unknown as UnifiedConfig;
}

function makeBaseCfg(): ExecutorConfig {
  return {
    port: 8317,
    timeout: 5000,
    verbose: false,
    pollInterval: 100,
  };
}

function makeContext(
  overrides: Partial<ResolveExecutorProxyContext> = {}
): ResolveExecutorProxyContext {
  return {
    unifiedConfig: makeMinimalUnifiedConfig(),
    allProviders: ['gemini'],
    verbose: false,
    cfg: makeBaseCfg(),
    log: mock(() => {}),
    ...overrides,
  };
}

async function resolveProxyForTest(args: string[], context = makeContext()) {
  const resolvedConfig = resolveExecutorProxyConfig(args, context);
  return resolveExecutorProxy(resolvedConfig, context);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockEnsureCLIProxyBinary.mockClear();
  mockGetConfiguredBackend.mockClear();
  mockGetPlusBackendUnavailableMessage.mockClear();
  mockInstallCliproxyVersion.mockClear();
  mockFetchLatestCliproxyVersion.mockClear();
  mockCheckCliproxyUpdate.mockClear();
  mockCheckRemoteProxy.mockClear();
  proxyEnvSnapshot = Object.fromEntries(PROXY_ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of PROXY_ENV_KEYS) {
    delete process.env[key];
  }
  mockEnsureCLIProxyBinary.mockResolvedValue('/usr/local/bin/cliproxy');
  mockGetConfiguredBackend.mockReturnValue('original');
});

afterEach(() => {
  for (const key of PROXY_ENV_KEYS) {
    const value = proxyEnvSnapshot[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('resolveExecutorProxy — local mode', () => {
  it('returns useRemoteProxy=false and correct binary for local mode', async () => {
    const result = await resolveProxyForTest(['--local-proxy', '--verbose']);

    expect(result.useRemoteProxy).toBe(false);
    expect(result.localBackend).toBe('original');
    expect(result.binaryPath).toBe('/usr/local/bin/cliproxy');
    expect(result.argsWithoutProxy).toEqual(['--verbose']);
  });

  it('strips proxy flags and passes remainingArgs through', async () => {
    const result = await resolveProxyForTest(['--local-proxy', 'clean-arg']);

    expect(result.argsWithoutProxy).toEqual(['clean-arg']);
    expect(result.useRemoteProxy).toBe(false);
  });

  it('does not call checkRemoteProxy in local mode', async () => {
    await resolveProxyForTest(['--local-proxy']);

    expect(mockCheckRemoteProxy).not.toHaveBeenCalled();
  });
});

describe('resolveExecutorProxy — remote mode reachable', () => {
  it('returns useRemoteProxy=true when remote proxy is reachable', async () => {
    mockCheckRemoteProxy.mockResolvedValue({ reachable: true, latencyMs: 12, error: undefined });

    const result = await resolveProxyForTest(['--proxy-host', '192.168.1.100']);

    expect(result.useRemoteProxy).toBe(true);
  });

  it('skips binary acquisition when remote proxy is reachable', async () => {
    mockCheckRemoteProxy.mockResolvedValue({ reachable: true, latencyMs: 5, error: undefined });

    const result = await resolveProxyForTest(['--proxy-host', '192.168.1.100']);

    expect(result.binaryPath).toBeUndefined();
    expect(mockEnsureCLIProxyBinary).not.toHaveBeenCalled();
  });
});

describe('resolveExecutorProxy — remote mode unreachable', () => {
  it('throws expected message when remoteOnly=true and remote is unreachable', async () => {
    mockCheckRemoteProxy.mockResolvedValue({ reachable: false, error: 'Connection refused' });

    await expect(
      resolveProxyForTest(['--proxy-host', '192.168.1.100', '--remote-only'])
    ).rejects.toThrow('Remote proxy unreachable and --remote-only specified');
  });

  it('throws when fallback disabled and remote is unreachable', async () => {
    process.env.CCS_PROXY_FALLBACK_ENABLED = '0';
    mockCheckRemoteProxy.mockResolvedValue({ reachable: false, error: 'Timeout' });

    await expect(resolveProxyForTest(['--proxy-host', '192.168.1.100'])).rejects.toThrow(
      'Remote proxy unreachable and fallback disabled'
    );
  });

  it('falls back to local and acquires binary when autoStartLocal=true', async () => {
    mockCheckRemoteProxy.mockResolvedValue({ reachable: false, error: 'Timeout' });
    mockEnsureCLIProxyBinary.mockResolvedValue('/usr/local/bin/cliproxy');

    const result = await resolveProxyForTest(['--proxy-host', '192.168.1.100']);

    expect(result.useRemoteProxy).toBe(false);
    expect(result.binaryPath).toBe('/usr/local/bin/cliproxy');
    expect(mockEnsureCLIProxyBinary).toHaveBeenCalled();
  });
});

describe('resolveExecutorProxy — proxyConfig propagated in result', () => {
  it('returns the resolved proxyConfig object', async () => {
    const result = await resolveProxyForTest(['--local-proxy']);

    expect(result.proxyConfig).toBeDefined();
    expect(result.proxyConfig.mode).toBe('local');
    expect(result.proxyConfig.port).toBe(8317);
  });

  it('returns mutated cfg with validated port', async () => {
    const ctx = makeContext();

    const result = await resolveProxyForTest(['--local-proxy'], ctx);

    // cfg is mutated in place and also returned
    expect(result.cfg).toBe(ctx.cfg);
    expect(result.cfg.port).toBe(8317);
  });
});
