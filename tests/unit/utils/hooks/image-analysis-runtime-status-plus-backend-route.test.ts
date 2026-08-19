import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

/**
 * Counterpart to the original-backend route regression (#1703): with
 * cliproxy.backend: plus, non-Claude providers keep their scoped
 * /api/provider/<id> routes for image analysis.
 */
describe('resolveImageAnalysisRuntimeStatus plus backend route', () => {
  let tmpHome = '';
  let previousCcsHome: string | undefined;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'ccs-image-analysis-plus-route-'));
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
        'cliproxy:',
        '  backend: plus',
        'image_analysis:',
        '  enabled: true',
        '  timeout: 60',
        '  provider_models:',
        '    gemini: gemini-2.5-flash',
        '  fallback_backend: gemini',
        '  profile_backends:',
        '    deepseek: gemini',
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

  it('keeps the scoped provider route for the plus backend', async () => {
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
        fetchRemoteAuthStatus: async () => [{ provider: 'gemini', authenticated: true }],
        getProxyTarget: () => ({
          host: '100.64.0.1',
          port: 8317,
          protocol: 'http',
          isRemote: true,
        }),
        initializeAccounts: () => {},
        getAuthStatus: () => ({
          provider: 'gemini',
          authenticated: true,
          tokenDir: join(tmpHome, 'auth'),
          tokenFiles: [],
          accounts: [],
          defaultAccount: undefined,
        }),
        isCliproxyRunning: async () => true,
      }
    );

    expect(status.backendId).toBe('gemini');
    expect(status.resolutionSource).toBe('profile-backend');
    expect(status.runtimePath).toBe('/api/provider/gemini');
  });
});
