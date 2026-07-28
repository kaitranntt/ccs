import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

import type { CliproxyRouterCapabilityReport } from '../../../src/cliproxy/routing/routing-strategy';

type RoutingStrategyModule = typeof import('../../../src/cliproxy/routing/routing-strategy');
describe('cliproxy router capability report', () => {
  let getInstalledCliproxyVersionMock: ReturnType<typeof mock>;
  let getCliproxyRoutingTargetMock: ReturnType<typeof mock>;
  let loadOrCreateUnifiedConfigMock: ReturnType<typeof mock>;

  beforeEach(() => {
    getInstalledCliproxyVersionMock = mock(() => '7.2.50');
    getCliproxyRoutingTargetMock = mock(() => ({ isRemote: false, port: 0, protocol: 'http' }));
    loadOrCreateUnifiedConfigMock = mock(() => ({
      cliproxy: {
        routing: {
          strategy: 'round-robin',
          session_affinity: false,
        },
        pool_routing: { enabled: false },
      },
    }));

    mock.module('../../../src/cliproxy/binary-manager', () => ({
      getInstalledCliproxyVersion: getInstalledCliproxyVersionMock,
    }));
    mock.module('../../../src/cliproxy/routing/routing-strategy-http', () => ({
      getCliproxyRoutingTarget: getCliproxyRoutingTargetMock,
      fetchCliproxyRoutingResponse: mock(async () => new Response('{}', { status: 200 })),
      getRoutingErrorMessage: mock(async () => 'error'),
    }));
    mock.module('../../../src/config/config-loader-facade', () => ({
      loadUnifiedConfig: loadOrCreateUnifiedConfigMock,
      loadOrCreateUnifiedConfig: loadOrCreateUnifiedConfigMock,
      getConfigYamlPath: mock(() => '/tmp/ccs-test/config.yaml'),
      getConfigJsonPath: mock(() => '/tmp/ccs-test/config.json'),
      hasUnifiedConfig: mock(() => true),
      hasLegacyConfig: mock(() => false),
      getConfigFormat: mock(() => 'yaml'),
      isUnifiedMode: mock(() => true),
      getDefaultProfile: mock(() => 'default'),
      setDefaultProfile: mock(() => {}),
      getWebSearchConfig: mock(() => ({})),
      getGlobalEnvConfig: mock(() => ({})),
      getOutputLimitsEnv: mock(() => ({})),
      getContinuityInheritanceMap: mock(() => ({})),
      getCliproxySafetyConfig: mock(() => ({})),
      getThinkingConfig: mock(() => ({})),
      getOfficialChannelsConfig: mock(() => ({})),
      isDashboardAuthEnabled: mock(() => false),
      getDashboardAuthConfig: mock(() => ({})),
      getBrowserConfig: mock(() => ({})),
      hasExplicitClaudeBrowserDevtoolsPort: mock(() => false),
      getImageAnalysisConfig: mock(() => ({})),
      getLoggingConfig: mock(() => ({})),
      getCursorConfig: mock(() => ({})),
      loadSettings: mock(() => ({})),
      loadConfigSafe: mock(() => ({})),
      readConfig: mock(() => ({})),
      getCcsDir: mock(() => '/tmp/ccs-test'),
      mutateConfig: mock((fn: (cfg: unknown) => void) => {
        fn(loadOrCreateUnifiedConfigMock());
      }),
    }));
  });

  afterEach(() => {
    mock.restore();
  });

  async function loadReport(): Promise<CliproxyRouterCapabilityReport> {
    const mod = (await import(
      `../../../src/cliproxy/routing/routing-strategy?test=${Date.now()}-${Math.random()}`
    )) as RoutingStrategyModule;
    return mod.getCliproxyRouterCapabilityReport();
  }
  async function loadGate(): Promise<(report: CliproxyRouterCapabilityReport) => void> {
    const mod = (await import(
      `../../../src/cliproxy/routing/routing-strategy?test=${Date.now()}-${Math.random()}`
    )) as RoutingStrategyModule;
    return mod.assertAliasPoolFallbackSupported;
  }

  it('returns supported when local version meets the minimum', async () => {
    const report = await loadReport();
    expect(report.installedVersion).toBe('7.2.50');
    expect(report.poolRoutingMinVersion).toBe('6.9.45');
    expect(report.target).toBe('local');
    expect(report.aliasPoolFallback).toBe('supported');
    expect(report.effective).toEqual({
      routingStrategy: 'round-robin',
      sessionAffinity: false,
      maxRetryCredentials: undefined,
      disableCooling: true,
    });
    expect(report.message).toContain('supports');
  });

  it('returns unsupported when local version is below the minimum', async () => {
    getInstalledCliproxyVersionMock.mockImplementation(() => '6.9.44');
    const report = await loadReport();
    expect(report.aliasPoolFallback).toBe('unsupported');
    expect(report.effective).toEqual({
      routingStrategy: 'round-robin',
      sessionAffinity: false,
      maxRetryCredentials: undefined,
      disableCooling: true,
    });
    expect(report.message).toContain('blocked');
  });

  it('fails closed with unknown when the installed version cannot be determined', async () => {
    getInstalledCliproxyVersionMock.mockImplementation(() => {
      throw new Error('binary not found');
    });
    const report = await loadReport();
    expect(report.aliasPoolFallback).toBe('unknown');
    expect(report.effective).toEqual({
      routingStrategy: 'round-robin',
      sessionAffinity: false,
      maxRetryCredentials: undefined,
      disableCooling: true,
    });
    expect(report.message).toContain('blocked');
    expect(report.message).toContain('unknown');
  });

  it('never reports supported for remote targets', async () => {
    getCliproxyRoutingTargetMock.mockImplementation(() => ({
      isRemote: true,
      port: 443,
      protocol: 'https',
    }));
    const report = await loadReport();
    expect(report.target).toBe('remote');
    expect(report.aliasPoolFallback).not.toBe('supported');
    expect(report.effective).toEqual({
      routingStrategy: 'round-robin',
      sessionAffinity: false,
      maxRetryCredentials: undefined,
      disableCooling: true,
    });
    expect(report.message).toContain('remote');
  });
  it('assertAliasPoolFallbackSupported throws when the capability is not supported', async () => {
    getInstalledCliproxyVersionMock.mockImplementation(() => '6.9.44');
    const report = await loadReport();
    const assertSupported = await loadGate();
    expect(() => assertSupported(report)).toThrow('blocked');
  });
});
