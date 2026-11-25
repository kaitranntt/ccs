import { describe, expect, it } from 'bun:test';
import {
  buildCopilotClaudeLaunchArgs,
  generateCopilotEnv,
  resolveCopilotImageAnalysisEnv,
} from '../../../src/copilot/copilot-executor';
import type { CopilotConfig } from '../../../src/config/unified-config-types';

const baseConfig: CopilotConfig = {
  enabled: true,
  auto_start: false,
  port: 4141,
  account_type: 'individual',
  rate_limit: null,
  wait_on_limit: true,
  model: 'gpt-4.1',
};

it('disallows native WebSearch without CCS steering when the Copilot snapshot is disabled', () => {
  const args = buildCopilotClaudeLaunchArgs(['smoke'], false, false);
  expect(args).toContain('--disallowedTools');
  expect(args).toContain('WebSearch');
  expect(args).not.toContain('--append-system-prompt');
});

describe('generateCopilotEnv', () => {
  it('normalizes deprecated raptor-mini model selections to the safe default', () => {
    const env = generateCopilotEnv({
      ...baseConfig,
      model: 'raptor-mini',
      opus_model: 'raptor-mini',
      sonnet_model: 'raptor-mini',
      haiku_model: 'raptor-mini',
    });

    expect(env.ANTHROPIC_MODEL).toBe('gpt-4.1');
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('gpt-4.1');
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('gpt-4.1');
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('gpt-4.1');
    expect(env.ANTHROPIC_SMALL_FAST_MODEL).toBe('gpt-4.1');
  });

  it('falls back deprecated haiku overrides to the selected base model', () => {
    const env = generateCopilotEnv({
      ...baseConfig,
      model: 'claude-sonnet-4.5',
      haiku_model: 'raptor-mini',
    });

    expect(env.ANTHROPIC_MODEL).toBe('claude-sonnet-4.5');
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('claude-sonnet-4.5');
    expect(env.ANTHROPIC_SMALL_FAST_MODEL).toBe('claude-sonnet-4.5');
  });

  it('includes inherited CLAUDE_CONFIG_DIR when provided', () => {
    const env = generateCopilotEnv(baseConfig, '/tmp/.ccs/instances/pro');
    expect(env.CLAUDE_CONFIG_DIR).toBe('/tmp/.ccs/instances/pro');
  });

  it('omits CLAUDE_CONFIG_DIR when inheritance is not configured', () => {
    const env = generateCopilotEnv(baseConfig);
    expect(env.CLAUDE_CONFIG_DIR).toBeUndefined();
  });

  it('falls back to native read when copilot image analysis auth is missing', async () => {
    const result = await resolveCopilotImageAnalysisEnv(false, {
      getImageAnalysisHookEnv: () => ({
        CCS_CURRENT_PROVIDER: 'ghcp',
        CCS_IMAGE_ANALYSIS_SKIP: '0',
      }),
      resolveImageAnalysisRuntimeStatus: (async () => ({
        enabled: true,
        supported: true,
        status: 'active',
        backendId: 'ghcp',
        backendDisplayName: 'GitHub Copilot (OAuth)',
        model: 'claude-haiku-4.5',
        resolutionSource: 'copilot-alias',
        reason: null,
        shouldPersistHook: true,
        persistencePath: 'copilot.settings.json',
        runtimePath: '/api/provider/ghcp',
        usesCurrentTarget: true,
        usesCurrentAuthToken: true,
        hookInstalled: true,
        sharedHookInstalled: true,
        authReadiness: 'missing',
        authProvider: 'ghcp',
        authDisplayName: 'GitHub Copilot (OAuth)',
        authReason:
          'GitHub Copilot (OAuth) auth is missing. Run "ccs ghcp --auth" to enable image analysis.',
        proxyReadiness: 'stopped',
        proxyReason:
          'Local CLIProxy service is idle. CCS will start it automatically when image analysis is needed.',
        effectiveRuntimeMode: 'native-read',
        effectiveRuntimeReason:
          'GitHub Copilot (OAuth) auth is missing. Run "ccs ghcp --auth" to enable image analysis.',
      })) as never,
    });

    expect(result.env.CCS_CURRENT_PROVIDER).toBe('');
    expect(result.env.CCS_IMAGE_ANALYSIS_SKIP).toBe('1');
    expect(result.warning).toContain('ccs ghcp --auth');
  });

  it('starts local CLIProxy on demand when copilot image analysis is launchable', async () => {
    let ensureCalls = 0;
    const result = await resolveCopilotImageAnalysisEnv(false, {
      getImageAnalysisHookEnv: () => ({
        CCS_CURRENT_PROVIDER: 'ghcp',
        CCS_IMAGE_ANALYSIS_SKIP: '0',
      }),
      resolveImageAnalysisRuntimeStatus: (async () => ({
        enabled: true,
        supported: true,
        status: 'active',
        backendId: 'ghcp',
        backendDisplayName: 'GitHub Copilot (OAuth)',
        model: 'claude-haiku-4.5',
        resolutionSource: 'copilot-alias',
        reason: null,
        shouldPersistHook: true,
        persistencePath: 'copilot.settings.json',
        runtimePath: '/api/provider/ghcp',
        usesCurrentTarget: true,
        usesCurrentAuthToken: true,
        hookInstalled: true,
        sharedHookInstalled: true,
        authReadiness: 'ready',
        authProvider: 'ghcp',
        authDisplayName: 'GitHub Copilot (OAuth)',
        authReason: null,
        proxyReadiness: 'stopped',
        proxyReason:
          'Local CLIProxy service is idle. CCS will start it automatically when image analysis is needed.',
        effectiveRuntimeMode: 'cliproxy-image-analysis',
        effectiveRuntimeReason: null,
      })) as never,
      ensureCliproxyService: async () => {
        ensureCalls += 1;
        return {
          started: true,
          alreadyRunning: false,
          port: 8317,
        };
      },
      getLocalRuntimeApiKey: () => 'local-runtime-token',
    });

    expect(ensureCalls).toBe(1);
    expect(result.env.CCS_CURRENT_PROVIDER).toBe('ghcp');
    expect(result.env.CCS_IMAGE_ANALYSIS_SKIP).toBe('0');
    expect(result.env.CCS_IMAGE_ANALYSIS_RUNTIME_BASE_URL).toBe('http://127.0.0.1:8317');
    expect(result.env.CCS_IMAGE_ANALYSIS_RUNTIME_PATH).toBe('/api/provider/ghcp');
    expect(result.env.CCS_IMAGE_ANALYSIS_RUNTIME_API_KEY).toBe('local-runtime-token');
    expect(result.warning).toBeNull();
  });
});
