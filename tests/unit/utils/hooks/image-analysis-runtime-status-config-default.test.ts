import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

/**
 * Regression: resolveImageAnalysisRuntimeStatus used to default to the built-in
 * DEFAULT_IMAGE_ANALYSIS_CONFIG constant, which carries empty profile_backends
 * and a gemini fallback_backend. Launch paths call it without an explicit
 * config, so user-configured profile_backends were dropped and every settings
 * profile resolved to gemini, then bailed to native Read on missing Gemini auth.
 */
describe('resolveImageAnalysisRuntimeStatus config default', () => {
  let tmpHome = '';
  let previousCcsHome: string | undefined;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'ccs-image-analysis-config-default-'));
    const ccsDir = join(tmpHome, '.ccs');
    mkdirSync(ccsDir, { recursive: true });

    const settingsPath = join(ccsDir, 'deepseek.settings.json');
    writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
            ANTHROPIC_MODEL: 'deepseek-v4-pro',
          },
        },
        null,
        2
      ) + '\n'
    );

    writeFileSync(
      join(ccsDir, 'config.yaml'),
      [
        'version: 14',
        'profiles:',
        '  deepseek:',
        '    type: api',
        `    settings: ${settingsPath}`,
        'image_analysis:',
        '  enabled: true',
        '  timeout: 60',
        '  provider_models:',
        '    claude: claude-haiku-4-5-20251001',
        '  fallback_backend: claude',
        '  profile_backends:',
        '    deepseek: claude',
        '',
      ].join('\n')
    );

    previousCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tmpHome;
  });

  afterEach(() => {
    if (previousCcsHome === undefined) {
      delete process.env.CCS_HOME;
    } else {
      process.env.CCS_HOME = previousCcsHome;
    }

    if (tmpHome) {
      rmSync(tmpHome, { recursive: true, force: true });
    }
  });

  it('honors user profile_backends when no explicit config is passed', async () => {
    const { resolveImageAnalysisRuntimeStatus } = await import(
      '../../../../src/utils/hooks/image-analysis-runtime-status'
    );

    const status = await resolveImageAnalysisRuntimeStatus(
      {
        profileName: 'deepseek',
        profileType: 'settings',
      },
      undefined,
      {
        checkRemoteProxy: async () => ({ reachable: true }),
        fetchRemoteAuthStatus: async () => [{ provider: 'claude', authenticated: true }],
        getProxyTarget: () => ({
          host: '100.64.0.1',
          port: 8317,
          protocol: 'http',
          isRemote: true,
        }),
        initializeAccounts: () => {},
        getAuthStatus: () => ({
          provider: 'claude',
          authenticated: true,
          tokenDir: join(tmpHome, 'auth'),
          tokenFiles: [],
          accounts: [],
          defaultAccount: undefined,
        }),
        isCliproxyRunning: async () => true,
      }
    );

    expect(status.backendId).toBe('claude');
    expect(status.resolutionSource).toBe('profile-backend');
    expect(status.model).toBe('claude-haiku-4-5-20251001');
    expect(status.runtimePath).toBe('/api/provider/claude');
    expect(status.effectiveRuntimeMode).toBe('cliproxy-image-analysis');
  });
});
