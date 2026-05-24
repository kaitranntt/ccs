import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Server } from 'http';
import { mutateUnifiedConfig } from '../../../src/config/unified-config-loader';
import imageAnalysisRoutes from '../../../src/web-server/routes/image-analysis-routes';

describe('image-analysis routes', () => {
  let server: Server;
  let baseUrl = '';
  let tempHome: string;
  let originalCcsHome: string | undefined;
  let originalDashboardAuthEnabled: string | undefined;
  let forcedRemoteAddress = '127.0.0.1';

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      Object.defineProperty(req.socket, 'remoteAddress', {
        value: forcedRemoteAddress,
        configurable: true,
      });
      next();
    });
    app.use('/api/image-analysis', imageAnalysisRoutes);

    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1');
      const onError = (error: Error) => reject(error);

      server.once('error', onError);
      server.once('listening', () => {
        server.off('error', onError);
        resolve();
      });
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Unable to resolve test server port');
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-image-analysis-routes-test-'));
    originalCcsHome = process.env.CCS_HOME;
    originalDashboardAuthEnabled = process.env.CCS_DASHBOARD_AUTH_ENABLED;
    process.env.CCS_HOME = tempHome;
    process.env.CCS_DASHBOARD_AUTH_ENABLED = 'false';
    forcedRemoteAddress = '127.0.0.1';

    const glmSettingsPath = path.join(tempHome, 'glm.settings.json');
    const codexSettingsPath = path.join(tempHome, 'codex-profile.settings.json');

    fs.writeFileSync(
      glmSettingsPath,
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'https://proxy.example/api/provider/gemini',
            ANTHROPIC_AUTH_TOKEN: 'glm-token',
          },
        },
        null,
        2
      )
    );
    fs.writeFileSync(
      codexSettingsPath,
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'https://proxy.example/api/provider/ghcp',
            ANTHROPIC_AUTH_TOKEN: 'codex-token',
          },
        },
        null,
        2
      )
    );

    mutateUnifiedConfig((config) => {
      config.profiles.glm = {
        settings: glmSettingsPath,
        target: 'claude',
      };
      config.profiles.codexProfile = {
        settings: codexSettingsPath,
        target: 'droid',
      };
      config.image_analysis = {
        enabled: true,
        timeout: 60,
        provider_models: {
          gemini: 'gemini-3-flash-preview',
          ghcp: 'claude-haiku-4.5',
        },
        fallback_backend: 'gemini',
        profile_backends: {
          codexProfile: 'ghcp',
        },
      };
    });
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }

    if (originalDashboardAuthEnabled !== undefined) {
      process.env.CCS_DASHBOARD_AUTH_ENABLED = originalDashboardAuthEnabled;
    } else {
      delete process.env.CCS_DASHBOARD_AUTH_ENABLED;
    }

    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('blocks remote access when dashboard auth is disabled', async () => {
    forcedRemoteAddress = '10.10.0.24';

    const response = await fetch(`${baseUrl}/api/image-analysis`);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Image Analysis endpoints require localhost access when dashboard auth is disabled.',
    });
  });

  it('returns global settings, backend readiness, and profile coverage', async () => {
    const response = await fetch(`${baseUrl}/api/image-analysis`);
    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.config).toMatchObject({
      enabled: true,
      timeout: 60,
      fallbackBackend: 'gemini',
      profileBackends: {
        codexProfile: 'ghcp',
      },
    });
    expect(payload.catalog.knownBackends).toContain('gemini');
    expect(payload.backends).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          backendId: 'gemini',
          model: 'gemini-3-flash-preview',
        }),
        expect.objectContaining({
          backendId: 'ghcp',
          profilesUsing: 1,
        }),
      ])
    );
    expect(payload.profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'glm',
          target: 'claude',
          currentTargetMode: 'setup',
        }),
        expect.objectContaining({
          name: 'codexProfile',
          target: 'droid',
          backendId: 'ghcp',
          currentTargetMode: 'bypassed',
        }),
      ])
    );
    expect(payload.summary).toMatchObject({
      backendCount: 2,
      bypassedProfileCount: 1,
    });
    expect(payload.runtime).toMatchObject({
      managedToolReady: false,
      sharedHookInstalled: false,
    });
  });

  it('updates the saved config through the dashboard route and provisions the local runtime', async () => {
    const staleSettingsPath = path.join(tempHome, '.ccs', 'legacy.settings.json');
    fs.writeFileSync(
      staleSettingsPath,
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'https://proxy.example/api/provider/gemini',
            ANTHROPIC_AUTH_TOKEN: 'legacy-token',
          },
          hooks: {
            PreToolUse: [
              {
                matcher: 'Read',
                hooks: [
                  {
                    type: 'command',
                    command: 'node "/home/kai/.ccs/hooks/image-analyzer-transformer.cjs"',
                    timeout: 65000,
                  },
                ],
              },
            ],
          },
        },
        null,
        2
      )
    );
    const instanceDir = path.join(tempHome, '.ccs', 'instances', 'demo');
    fs.mkdirSync(instanceDir, { recursive: true });
    fs.writeFileSync(
      path.join(instanceDir, '.claude.json'),
      JSON.stringify(
        {
          mcpServers: {
            custom: {
              type: 'stdio',
              command: 'node',
              args: ['custom-server.cjs'],
              env: {},
            },
          },
        },
        null,
        2
      )
    );

    const response = await fetch(`${baseUrl}/api/image-analysis`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: true,
        timeout: 120,
        providerModels: {
          gemini: 'gemini-2.5-pro',
          ghcp: 'claude-haiku-4.5',
        },
        fallbackBackend: 'ghcp',
        profileBackends: {
          glm: 'gemini',
          codexProfile: 'ghcp',
        },
      }),
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.config).toMatchObject({
      timeout: 120,
      fallbackBackend: 'ghcp',
      profileBackends: {
        glm: 'gemini',
        codexProfile: 'ghcp',
      },
    });
    expect(payload.config.providerModels).toMatchObject({
      gemini: 'gemini-2.5-pro',
    });
    expect(payload.runtime).toMatchObject({
      managedToolReady: true,
      sharedHookInstalled: true,
    });

    const ccsDir = path.join(tempHome, '.ccs');
    expect(fs.existsSync(path.join(ccsDir, 'mcp', 'ccs-image-analysis-server.cjs'))).toBe(true);
    expect(fs.existsSync(path.join(ccsDir, 'mcp', 'image-analysis-runtime.cjs'))).toBe(true);
    expect(fs.existsSync(path.join(ccsDir, 'hooks', 'image-analyzer-transformer.cjs'))).toBe(true);
    expect(fs.existsSync(path.join(ccsDir, 'hooks', 'image-analysis-runtime.cjs'))).toBe(true);

    const claudeConfig = JSON.parse(
      fs.readFileSync(path.join(tempHome, '.claude.json'), 'utf8')
    ) as {
      mcpServers?: Record<string, unknown>;
    };
    expect(claudeConfig.mcpServers?.['ccs-image-analysis']).toEqual({
      type: 'stdio',
      command: 'node',
      args: [path.join(ccsDir, 'mcp', 'ccs-image-analysis-server.cjs')],
      env: {},
    });

    const repairedSettings = JSON.parse(fs.readFileSync(staleSettingsPath, 'utf8')) as {
      hooks?: { PreToolUse?: Array<{ matcher?: string }> };
    };
    expect(repairedSettings.hooks?.PreToolUse?.some((hook) => hook.matcher === 'Read') ?? false).toBe(
      false
    );

    const instanceConfig = JSON.parse(
      fs.readFileSync(path.join(instanceDir, '.claude.json'), 'utf8')
    ) as {
      mcpServers?: Record<string, unknown>;
    };
    expect(instanceConfig.mcpServers?.custom).toEqual({
      type: 'stdio',
      command: 'node',
      args: ['custom-server.cjs'],
      env: {},
    });
    expect(instanceConfig.mcpServers?.['ccs-image-analysis']).toEqual({
      type: 'stdio',
      command: 'node',
      args: [path.join(ccsDir, 'mcp', 'ccs-image-analysis-server.cjs')],
      env: {},
    });
  });

  it('rejects profile mappings that point to a missing backend with a client error', async () => {
    const response = await fetch(`${baseUrl}/api/image-analysis`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerModels: {
          gemini: 'gemini-3-flash-preview',
        },
        fallbackBackend: 'gemini',
        profileBackends: {
          codexProfile: 'ghcp',
        },
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Profile mapping for "codexProfile" references an unknown backend.',
    });
  });

  it('rejects unsupported provider backends and preserves existing configuration', async () => {
    const putResponse = await fetch(`${baseUrl}/api/image-analysis`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerModels: {
          gemini: 'gemini-3-flash-preview',
          evil: 'vision-model',
        },
        fallbackBackend: 'gemini',
      }),
    });

    expect(putResponse.status).toBe(400);
    expect(await putResponse.json()).toEqual({
      error: 'Unsupported provider backend "evil".',
    });

    const getResponse = await fetch(`${baseUrl}/api/image-analysis`);
    expect(getResponse.status).toBe(200);
    const payload = await getResponse.json();
    expect(payload.config.providerModels).toMatchObject({
      gemini: 'gemini-3-flash-preview',
      ghcp: 'claude-haiku-4.5',
    });
  });
});
