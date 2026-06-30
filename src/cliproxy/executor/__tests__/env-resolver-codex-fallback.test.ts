import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { buildClaudeEnvironment, resolveCliproxyImageAnalysisEnv } from '../env-resolver';
import type { ImageAnalysisStatus } from '../../../utils/hooks';
import { invalidateConfigCache } from '../../../config/config-loader-facade';
import { clearConfigCache } from '../../config/base-config-loader';

const tempDirs: string[] = [];
let originalCcsHome: string | undefined;
let configHome = '';

function writeBackendConfig(backend: 'original' | 'plus'): void {
  const ccsDir = path.join(configHome, '.ccs');
  fs.mkdirSync(ccsDir, { recursive: true });
  fs.writeFileSync(
    path.join(ccsDir, 'config.yaml'),
    ['version: 1', 'cliproxy:', `  backend: ${backend}`, ''].join('\n'),
    'utf8'
  );
  invalidateConfigCache();
  clearConfigCache();
}

function createCodexSettingsFile(models: {
  defaultModel: string;
  opusModel: string;
  sonnetModel: string;
  haikuModel: string;
}): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-codex-fallback-'));
  tempDirs.push(tempDir);

  const settingsPath = path.join(tempDir, 'codex-test.settings.json');
  fs.writeFileSync(
    settingsPath,
    JSON.stringify(
      {
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/codex',
          ANTHROPIC_AUTH_TOKEN: 'test-token',
          ANTHROPIC_MODEL: models.defaultModel,
          ANTHROPIC_DEFAULT_OPUS_MODEL: models.opusModel,
          ANTHROPIC_DEFAULT_SONNET_MODEL: models.sonnetModel,
          ANTHROPIC_DEFAULT_HAIKU_MODEL: models.haikuModel,
        },
      },
      null,
      2
    ) + '\n'
  );

  return settingsPath;
}

function createImageAnalysisStatus(
  overrides: Partial<ImageAnalysisStatus> = {}
): ImageAnalysisStatus {
  return {
    enabled: true,
    supported: true,
    status: 'active',
    backendId: 'agy',
    backendDisplayName: 'Antigravity',
    model: 'gemini-2.5-pro',
    resolutionSource: 'cliproxy-provider',
    reason: null,
    shouldPersistHook: true,
    persistencePath: '/tmp/orq.settings.json',
    runtimePath: '/api/provider/agy',
    usesCurrentTarget: true,
    usesCurrentAuthToken: true,
    hookInstalled: true,
    sharedHookInstalled: true,
    authReadiness: 'ready',
    authProvider: 'agy',
    authDisplayName: 'Antigravity',
    authReason: null,
    proxyReadiness: 'ready',
    proxyReason: 'Local CLIProxy service is reachable.',
    effectiveRuntimeMode: 'cliproxy-image-analysis',
    effectiveRuntimeReason: null,
    ...overrides,
  };
}

describe('buildClaudeEnvironment codex fallback normalization', () => {
  beforeEach(() => {
    originalCcsHome = process.env.CCS_HOME;
    configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-env-resolver-home-'));
    tempDirs.push(configHome);
    process.env.CCS_HOME = configHome;
    invalidateConfigCache();
    clearConfigCache();
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
    invalidateConfigCache();
    clearConfigCache();
    while (tempDirs.length > 0) {
      const tempDir = tempDirs.pop();
      if (tempDir) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  it('normalizes codex effort aliases when reasoning proxy is unavailable', () => {
    const settingsPath = createCodexSettingsFile({
      defaultModel: 'gpt-5.3-codex-high',
      opusModel: 'gpt-5.3-codex-xhigh',
      sonnetModel: 'gpt-5.3-codex-high',
      haikuModel: 'gpt-5.4-mini-medium',
    });

    const env = buildClaudeEnvironment({
      provider: 'codex',
      useRemoteProxy: false,
      localPort: 8317,
      customSettingsPath: settingsPath,
      verbose: false,
    });

    expect(env.ANTHROPIC_MODEL).toBe('gpt-5.3-codex(high)');
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('gpt-5.3-codex(xhigh)');
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('gpt-5.3-codex(high)');
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('gpt-5.4-mini(medium)');
    expect(env.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:8317');
  });

  it('keeps codex effort aliases when reasoning proxy is active', () => {
    const settingsPath = createCodexSettingsFile({
      defaultModel: 'gpt-5.3-codex-high',
      opusModel: 'gpt-5.3-codex-xhigh',
      sonnetModel: 'gpt-5.3-codex-high',
      haikuModel: 'gpt-5.4-mini-medium',
    });

    const env = buildClaudeEnvironment({
      provider: 'codex',
      useRemoteProxy: false,
      localPort: 8317,
      customSettingsPath: settingsPath,
      codexReasoningPort: 9444,
      verbose: false,
    });

    expect(env.ANTHROPIC_MODEL).toBe('gpt-5.3-codex-high');
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('gpt-5.3-codex-xhigh');
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('gpt-5.3-codex-high');
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('gpt-5.4-mini-medium');
    expect(env.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:9444');
  });

  it('keeps scoped codex reasoning URL when the plus backend is active', () => {
    writeBackendConfig('plus');
    const settingsPath = createCodexSettingsFile({
      defaultModel: 'gpt-5.3-codex-high',
      opusModel: 'gpt-5.3-codex-xhigh',
      sonnetModel: 'gpt-5.3-codex-high',
      haikuModel: 'gpt-5.4-mini-medium',
    });

    const env = buildClaudeEnvironment({
      provider: 'codex',
      useRemoteProxy: false,
      localPort: 8317,
      customSettingsPath: settingsPath,
      codexReasoningPort: 9444,
      verbose: false,
    });

    expect(env.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:9444/api/provider/codex');
  });

  it('propagates inherited CLAUDE_CONFIG_DIR when provided', () => {
    const settingsPath = createCodexSettingsFile({
      defaultModel: 'gpt-5.3-codex',
      opusModel: 'gpt-5.3-codex',
      sonnetModel: 'gpt-5.3-codex',
      haikuModel: 'gpt-5-mini',
    });

    const env = buildClaudeEnvironment({
      provider: 'codex',
      useRemoteProxy: false,
      localPort: 8317,
      customSettingsPath: settingsPath,
      claudeConfigDir: '/tmp/.ccs/instances/pro',
      verbose: false,
    });

    expect(env.CLAUDE_CONFIG_DIR).toBe('/tmp/.ccs/instances/pro');
  });

  it('uses an execution-aware image analysis env override when provided', () => {
    const env = buildClaudeEnvironment({
      provider: 'agy',
      useRemoteProxy: false,
      localPort: 8317,
      verbose: false,
      imageAnalysisEnv: {
        CCS_IMAGE_ANALYSIS_ENABLED: '1',
        CCS_IMAGE_ANALYSIS_TIMEOUT: '60',
        CCS_IMAGE_ANALYSIS_PROVIDER_MODELS: 'agy:gemini-2.5-pro',
        CCS_CURRENT_PROVIDER: '',
        CCS_IMAGE_ANALYSIS_SKIP: '1',
      },
    });

    expect(env.CCS_CURRENT_PROVIDER).toBe('');
    expect(env.CCS_IMAGE_ANALYSIS_SKIP).toBe('1');
  });
});

describe('resolveCliproxyImageAnalysisEnv', () => {
  it('falls back to native read when runtime status is not launchable', async () => {
    const result = await resolveCliproxyImageAnalysisEnv(
      {
        profileName: 'orq',
        provider: 'agy',
        profileSettingsPath: '/tmp/orq.settings.json',
        proxyTarget: {
          host: '127.0.0.1',
          port: 8317,
          protocol: 'http',
          isRemote: false,
        },
        proxyReachable: true,
      },
      {
        getImageAnalysisHookEnv: () => ({
          CCS_IMAGE_ANALYSIS_ENABLED: '1',
          CCS_IMAGE_ANALYSIS_TIMEOUT: '60',
          CCS_IMAGE_ANALYSIS_PROVIDER_MODELS: 'agy:gemini-2.5-pro',
          CCS_CURRENT_PROVIDER: 'agy',
          CCS_IMAGE_ANALYSIS_SKIP: '0',
        }),
        hasImageAnalysisProfileHook: () => true,
        hasImageAnalyzerHook: () => true,
        resolveImageAnalysisRuntimeStatus: async (context, _config, deps) => {
          expect(context.profileName).toBe('orq');
          expect(context.cliproxyProvider).toBe('agy');
          expect(context.hookInstalled).toBe(true);
          expect(context.sharedHookInstalled).toBe(true);
          expect(deps?.getProxyTarget?.().isRemote).toBe(false);
          return createImageAnalysisStatus({
            authReadiness: 'missing',
            authReason: 'Antigravity auth is missing.',
            effectiveRuntimeMode: 'native-read',
            effectiveRuntimeReason: 'Antigravity auth is missing.',
          });
        },
      }
    );

    expect(result.env.CCS_CURRENT_PROVIDER).toBe('');
    expect(result.env.CCS_IMAGE_ANALYSIS_SKIP).toBe('1');
    expect(result.warning).toContain('Antigravity auth is missing.');
    expect(result.warning).toContain('native Read');
  });

  it('strips browser env injected through settings before building Claude runtime env', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-browser-env-strip-'));
    tempDirs.push(tempDir);

    const settingsPath = path.join(tempDir, 'browser-env.settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/agy',
            ANTHROPIC_AUTH_TOKEN: 'test-token',
            ANTHROPIC_MODEL: 'gemini-2.5-pro',
            CCS_BROWSER_USER_DATA_DIR: '/tmp/embedded-browser-runtime',
            CCS_BROWSER_PROFILE_DIR: '/tmp/embedded-browser-legacy',
            CCS_BROWSER_DEVTOOLS_WS_URL: 'ws://127.0.0.1/devtools/browser/settings-env',
          },
        },
        null,
        2
      ) + '\n'
    );

    const env = buildClaudeEnvironment({
      provider: 'agy',
      useRemoteProxy: false,
      localPort: 8317,
      customSettingsPath: settingsPath,
      verbose: false,
    });

    expect(env.CCS_BROWSER_USER_DATA_DIR).toBeUndefined();
    expect(env.CCS_BROWSER_PROFILE_DIR).toBeUndefined();
    expect(env.CCS_BROWSER_DEVTOOLS_WS_URL).toBeUndefined();
  });

  it('keeps cliproxy image analysis active when the execution target is reachable', async () => {
    const result = await resolveCliproxyImageAnalysisEnv(
      {
        profileName: 'orq',
        provider: 'agy',
        isComposite: true,
        proxyTarget: {
          host: 'remote.example.com',
          port: 9443,
          protocol: 'https',
          authToken: 'remote-token',
          managementKey: 'remote-management-key',
          allowSelfSigned: true,
          isRemote: true,
        },
        proxyReachable: true,
      },
      {
        getImageAnalysisHookEnv: () => ({
          CCS_IMAGE_ANALYSIS_ENABLED: '1',
          CCS_IMAGE_ANALYSIS_TIMEOUT: '60',
          CCS_IMAGE_ANALYSIS_PROVIDER_MODELS: 'agy:gemini-2.5-pro',
          CCS_CURRENT_PROVIDER: 'agy',
          CCS_IMAGE_ANALYSIS_SKIP: '0',
        }),
        hasImageAnalysisProfileHook: () => true,
        hasImageAnalyzerHook: () => true,
        resolveImageAnalysisRuntimeStatus: async (context, _config, deps) => {
          expect(context.isComposite).toBe(true);
          expect(deps?.getProxyTarget?.().host).toBe('remote.example.com');
          expect(deps?.getProxyTarget?.().managementKey).toBe('remote-management-key');
          expect(deps?.getProxyTarget?.().allowSelfSigned).toBe(true);
          return createImageAnalysisStatus({
            resolutionSource: 'cliproxy-composite',
            proxyReadiness: 'remote',
            proxyReason: 'Remote CLIProxy target remote.example.com:9443 is reachable.',
          });
        },
      }
    );

    expect(result.env.CCS_CURRENT_PROVIDER).toBe('agy');
    expect(result.env.CCS_IMAGE_ANALYSIS_SKIP).toBe('0');
    expect(result.env.CCS_IMAGE_ANALYSIS_RUNTIME_BASE_URL).toBe('https://remote.example.com:9443');
    expect(result.env.CCS_IMAGE_ANALYSIS_RUNTIME_PATH).toBe('/api/provider/agy');
    expect(result.env.CCS_IMAGE_ANALYSIS_RUNTIME_API_KEY).toBe('remote-token');
    expect(result.env.CCS_IMAGE_ANALYSIS_RUNTIME_ALLOW_SELF_SIGNED).toBe('1');
    expect(result.warning).toBeNull();
  });

  it('pins local cliproxy image analysis to the resolved local API key', async () => {
    const result = await resolveCliproxyImageAnalysisEnv(
      {
        profileName: 'orq',
        provider: 'agy',
        profileSettingsPath: '/tmp/orq.settings.json',
        proxyTarget: {
          host: '127.0.0.1',
          port: 8317,
          protocol: 'http',
          isRemote: false,
        },
        proxyReachable: true,
      },
      {
        getImageAnalysisHookEnv: () => ({
          CCS_IMAGE_ANALYSIS_ENABLED: '1',
          CCS_IMAGE_ANALYSIS_TIMEOUT: '60',
          CCS_IMAGE_ANALYSIS_PROVIDER_MODELS: 'agy:gemini-2.5-pro',
          CCS_CURRENT_PROVIDER: 'agy',
          CCS_IMAGE_ANALYSIS_SKIP: '0',
        }),
        hasImageAnalysisProfileHook: () => true,
        hasImageAnalyzerHook: () => true,
        resolveImageAnalysisRuntimeStatus: async () => createImageAnalysisStatus(),
        getLocalRuntimeApiKey: () => 'local-runtime-token',
      }
    );

    expect(result.env.CCS_IMAGE_ANALYSIS_RUNTIME_BASE_URL).toBe('http://127.0.0.1:8317');
    expect(result.env.CCS_IMAGE_ANALYSIS_RUNTIME_PATH).toBe('/api/provider/agy');
    expect(result.env.CCS_IMAGE_ANALYSIS_RUNTIME_API_KEY).toBe('local-runtime-token');
    expect(result.env.CCS_IMAGE_ANALYSIS_RUNTIME_ALLOW_SELF_SIGNED).toBe('0');
    expect(result.warning).toBeNull();
  });

  it('routes remote HTTPS image analysis through the local tunnel when available', async () => {
    const result = await resolveCliproxyImageAnalysisEnv(
      {
        profileName: 'orq',
        provider: 'agy',
        profileSettingsPath: '/tmp/orq.settings.json',
        proxyTarget: {
          host: 'remote.example.com',
          port: 9443,
          protocol: 'https',
          authToken: 'remote-token',
          managementKey: 'remote-management-key',
          allowSelfSigned: true,
          isRemote: true,
        },
        tunnelPort: 9911,
        proxyReachable: true,
      },
      {
        getImageAnalysisHookEnv: () => ({
          CCS_IMAGE_ANALYSIS_ENABLED: '1',
          CCS_IMAGE_ANALYSIS_TIMEOUT: '60',
          CCS_IMAGE_ANALYSIS_PROVIDER_MODELS: 'agy:gemini-2.5-pro',
          CCS_CURRENT_PROVIDER: 'agy',
          CCS_IMAGE_ANALYSIS_SKIP: '0',
        }),
        hasImageAnalysisProfileHook: () => true,
        hasImageAnalyzerHook: () => true,
        resolveImageAnalysisRuntimeStatus: async () => createImageAnalysisStatus(),
      }
    );

    expect(result.env.CCS_IMAGE_ANALYSIS_RUNTIME_BASE_URL).toBe('http://127.0.0.1:9911');
    expect(result.env.CCS_IMAGE_ANALYSIS_RUNTIME_API_KEY).toBe('remote-token');
    expect(result.env.CCS_IMAGE_ANALYSIS_RUNTIME_ALLOW_SELF_SIGNED).toBe('0');
    expect(result.warning).toBeNull();
  });
});
