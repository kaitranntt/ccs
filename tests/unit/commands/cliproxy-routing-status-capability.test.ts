import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

import type {
  CliproxyRoutingState,
  CliproxySessionAffinityState,
} from '../../../src/cliproxy/routing/routing-strategy';

type RoutingSubcommandModule = typeof import('../../../src/commands/cliproxy/routing-subcommand');

const LOCAL_POOL_REMOTE_MESSAGE =
  'Pool routing is managed from the local config only and does not affect this remote proxy. ' +
  'Configure cooling and routing on the host running CLIProxy instead.';

const LOCAL_AFFINITY_REMOTE_MESSAGE =
  'Remote session-affinity management is not supported from CCS yet because upstream management APIs only expose routing.strategy.';

describe('cliproxy routing status: local-vs-remote capability messaging', () => {
  let originalLog: typeof console.log;
  let captured: string[];
  let readRoutingStateMock: ReturnType<typeof mock>;
  let readAffinityStateMock: ReturnType<typeof mock>;
  let loadConfigMock: ReturnType<typeof mock>;

  beforeEach(() => {
    captured = [];
    originalLog = console.log;
    console.log = (...args: unknown[]) => {
      captured.push(args.map(String).join(' '));
    };

    readRoutingStateMock = mock(async () => {
      throw new Error('readCliproxyRoutingState mock not configured for this test');
    });
    readAffinityStateMock = mock(async () => {
      throw new Error('readCliproxySessionAffinityState mock not configured for this test');
    });
    loadConfigMock = mock(() => ({ cliproxy: { pool_routing: { enabled: false } } }));

    mock.module('../../../src/cliproxy/routing/routing-strategy', () => ({
      readCliproxyRoutingState: readRoutingStateMock,
      readCliproxySessionAffinityState: readAffinityStateMock,
      // The status handler does not call the apply* helpers, but the module
      // graph still resolves them via re-exports; stub them so the mock module
      // shape is complete.
      applyCliproxyRoutingStrategy: mock(async () => {
        throw new Error('unused');
      }),
      applyCliproxySessionAffinitySettings: mock(async () => {
        throw new Error('unused');
      }),
      normalizeCliproxyRoutingStrategy: mock(() => null),
      normalizeCliproxySessionAffinityEnabled: mock(() => null),
      normalizeCliproxySessionAffinityTtl: mock(() => null),
    }));

    // Provide the full facade export surface. Under bun:test, `mock.module`
    // registers process-global module overrides that win for every test in
    // the same `bun test` invocation. A partial mock here leaks as a
    // SyntaxError when a sibling test imports the real routing-strategy and
    // re-resolves the facade through the production module graph.
    mock.module('../../../src/config/config-loader-facade', () => ({
      loadOrCreateUnifiedConfig: loadConfigMock,
      loadUnifiedConfig: loadConfigMock,
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
        fn(loadConfigMock());
      }),
      invalidateConfigCache: mock(() => {}),
    }));

    mock.module('../../../src/utils/ui', () => ({
      initUI: mock(async () => {}),
      header: (text: string) => `=== ${text} ===`,
      subheader: (text: string) => `-- ${text} --`,
      color: (text: string) => text,
      dim: (text: string) => text,
      ok: (text: string) => text,
      fail: (text: string) => text,
      warn: (text: string) => text,
      info: (text: string) => text,
      infoBox: (text: string, _level?: string) => text,
    }));
  });

  afterEach(() => {
    console.log = originalLog;
    mock.restore();
  });

  async function loadRoutingSubcommand(): Promise<RoutingSubcommandModule> {
    return (await import(
      `../../../src/commands/cliproxy/routing-subcommand?test=${Date.now()}-${Math.random()}`
    )) as RoutingSubcommandModule;
  }

  it('RED -> GREEN: prints the remote pool-routing capability message on remote targets', async () => {
    const remoteRouting: CliproxyRoutingState = {
      strategy: 'round-robin',
      source: 'live',
      target: 'remote',
      reachable: true,
      poolRouting: {
        enabled: true,
        manageable: false,
        message: LOCAL_POOL_REMOTE_MESSAGE,
      },
    };
    const remoteAffinity: CliproxySessionAffinityState = {
      source: 'unsupported',
      target: 'remote',
      reachable: true,
      manageable: false,
      message: LOCAL_AFFINITY_REMOTE_MESSAGE,
    };
    readRoutingStateMock.mockImplementation(async () => remoteRouting);
    readAffinityStateMock.mockImplementation(async () => remoteAffinity);

    const mod = await loadRoutingSubcommand();
    await mod.handleRoutingStatus();

    const output = captured.join('\n');
    expect(output).toContain('round-robin');
    expect(output).toContain('remote');
    expect(output).toContain('unsupported');
    expect(output).toContain(LOCAL_POOL_REMOTE_MESSAGE);
    expect(output).toContain(LOCAL_AFFINITY_REMOTE_MESSAGE);
  });

  it('does not show a remote capability warning for a healthy local target', async () => {
    const localRouting: CliproxyRoutingState = {
      strategy: 'round-robin',
      source: 'live',
      target: 'local',
      reachable: true,
      poolRouting: { enabled: false },
    };
    const localAffinity: CliproxySessionAffinityState = {
      enabled: false,
      ttl: '1h',
      source: 'config',
      target: 'local',
      reachable: true,
      manageable: true,
    };
    readRoutingStateMock.mockImplementation(async () => localRouting);
    readAffinityStateMock.mockImplementation(async () => localAffinity);

    const mod = await loadRoutingSubcommand();
    await mod.handleRoutingStatus();

    const output = captured.join('\n');
    expect(output).toContain('local');
    expect(output).not.toContain(LOCAL_POOL_REMOTE_MESSAGE);
    expect(output).not.toContain(LOCAL_AFFINITY_REMOTE_MESSAGE);
    // Local target must not be mislabelled as unsupported.
    expect(output).not.toContain('Target:  remote');
  });

  it('remote target: surfaces the local-only capability message even when the remote endpoint is unreachable', async () => {
    const unreachableRouting: CliproxyRoutingState = {
      strategy: 'fill-first',
      source: 'config',
      target: 'remote',
      reachable: false,
      message:
        'Remote CLIProxy routing endpoint is not reachable. Showing the saved startup default; pool routing still applies to local config only.',
      poolRouting: {
        enabled: true,
        manageable: false,
        message: LOCAL_POOL_REMOTE_MESSAGE,
      },
    };
    const unreachableAffinity: CliproxySessionAffinityState = {
      source: 'unsupported',
      target: 'remote',
      reachable: false,
      manageable: false,
      message:
        'Remote session-affinity management is not supported from CCS yet, and the remote CLIProxy routing endpoint is not reachable.',
    };
    readRoutingStateMock.mockImplementation(async () => unreachableRouting);
    readAffinityStateMock.mockImplementation(async () => unreachableAffinity);

    const mod = await loadRoutingSubcommand();
    await mod.handleRoutingStatus();

    const output = captured.join('\n');
    // Capability messaging must render for unreachable remote targets, not just
    // the hard fetch-failure error.
    expect(output).toContain('Target:  remote');
    expect(output).toContain(LOCAL_POOL_REMOTE_MESSAGE);
    expect(output).toContain(
      'Remote session-affinity management is not supported from CCS yet, and the remote CLIProxy routing endpoint is not reachable.'
    );
    expect(output).not.toContain('Target:  local');
  });
});
