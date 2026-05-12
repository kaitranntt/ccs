import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Server } from 'http';
import settingsRoutes from '../../../src/web-server/routes/settings-routes';

function writeJson(filePath: string, value: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function installSharedHook(tempHome: string): string {
  const hooksDir = path.join(tempHome, '.ccs', 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });

  for (const fileName of ['image-analyzer-transformer.cjs', 'image-analysis-runtime.cjs']) {
    fs.copyFileSync(
      path.join(process.cwd(), 'lib', 'hooks', fileName),
      path.join(hooksDir, fileName)
    );
  }

  const hookPath = path.join(hooksDir, 'image-analyzer-transformer.cjs');
  return hookPath;
}

function writeProfileSettings(
  tempHome: string,
  profileName: string,
  env: Record<string, string>,
  settingsPath = path.join(tempHome, '.ccs', `${profileName}.settings.json`)
): string {
  const hookPath = installSharedHook(tempHome);
  writeJson(settingsPath, {
    env,
    hooks: {
      PreToolUse: [
        {
          matcher: 'Read',
          hooks: [{ type: 'command', command: `node "${hookPath}"`, timeout: 65000 }],
        },
      ],
    },
  });
  return settingsPath;
}

function createSymlinkIfAvailable(
  targetPath: string,
  linkPath: string,
  type?: fs.symlink.Type
): boolean {
  try {
    fs.symlinkSync(targetPath, linkPath, type);
    return true;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (process.platform === 'win32' && (code === 'EPERM' || code === 'EACCES')) {
      console.warn('Skipping symlink escape regression: symlink creation unavailable on Windows.');
      return false;
    }
    throw error;
  }
}

describe('settings-routes image-analysis status', () => {
  let server: Server;
  let baseUrl = '';
  let tempHome = '';
  let originalCcsHome: string | undefined;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/settings', settingsRoutes);

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
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-image-status-routes-'));
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }

    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('returns fallback-backed image analysis status for settings profiles', async () => {
    writeProfileSettings(tempHome, 'glm', {
      ANTHROPIC_BASE_URL: 'https://api.z.ai/v1',
      ANTHROPIC_API_KEY: 'glm-test-key',
    });

    const response = await fetch(`${baseUrl}/api/settings/glm/raw`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      imageAnalysisStatus: {
        status: string;
        backendId: string | null;
        resolutionSource: string;
        model: string | null;
        persistencePath: string | null;
        authReadiness: string;
        effectiveRuntimeMode: string;
      };
    };

    expect(body.imageAnalysisStatus.status).toBe('active');
    expect(body.imageAnalysisStatus.backendId).toBe('gemini');
    expect(body.imageAnalysisStatus.resolutionSource).toBe('fallback-backend');
    expect(body.imageAnalysisStatus.model).toBe('gemini-3-flash-preview');
    expect(body.imageAnalysisStatus.persistencePath).toContain('glm.settings.json');
    expect(body.imageAnalysisStatus.authReadiness).toBe('missing');
    expect(body.imageAnalysisStatus.effectiveRuntimeMode).toBe('native-read');
  });

  it('keeps direct Anthropic settings profiles on native read diagnostics', async () => {
    writeJson(path.join(tempHome, '.ccs', 'claude-direct.settings.json'), {
      env: {
        ANTHROPIC_API_KEY: 'anthropic-test-key',
      },
    });

    const response = await fetch(`${baseUrl}/api/settings/claude-direct/raw`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      imageAnalysisStatus: {
        status: string;
        backendId: string | null;
        shouldPersistHook: boolean;
        runtimePath: string | null;
        reason: string | null;
        authReadiness: string;
        proxyReadiness: string;
      };
    };

    expect(body.imageAnalysisStatus.status).toBe('skipped');
    expect(body.imageAnalysisStatus.backendId).toBeNull();
    expect(body.imageAnalysisStatus.shouldPersistHook).toBe(false);
    expect(body.imageAnalysisStatus.runtimePath).toBeNull();
    expect(body.imageAnalysisStatus.reason).toContain('native file access');
    expect(body.imageAnalysisStatus.authReadiness).toBe('not-needed');
    expect(body.imageAnalysisStatus.proxyReadiness).toBe('not-needed');
  });

  it('returns explicit mapped status for custom aliases', async () => {
    writeJson(path.join(tempHome, '.ccs', 'config.yaml'), {
      version: 11,
      image_analysis: {
        enabled: true,
        timeout: 60,
        provider_models: {
          gemini: 'gemini-2.5-flash',
          ghcp: 'claude-haiku-4.5',
        },
        profile_backends: {
          orq: 'copilot',
        },
      },
    });
    writeProfileSettings(tempHome, 'orq', {
      ANTHROPIC_BASE_URL: 'https://openrouter.ai/api/v1',
      ANTHROPIC_API_KEY: 'orq-test-key',
    });

    const response = await fetch(`${baseUrl}/api/settings/orq/raw`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      imageAnalysisStatus: {
        status: string;
        backendId: string | null;
        resolutionSource: string;
        model: string | null;
        authReadiness: string;
        effectiveRuntimeMode: string;
      };
    };

    expect(body.imageAnalysisStatus.status).toBe('mapped');
    expect(body.imageAnalysisStatus.backendId).toBe('ghcp');
    expect(body.imageAnalysisStatus.resolutionSource).toBe('profile-backend');
    expect(body.imageAnalysisStatus.model).toBe('claude-haiku-4.5');
    expect(body.imageAnalysisStatus.authReadiness).toBe('missing');
    expect(body.imageAnalysisStatus.effectiveRuntimeMode).toBe('native-read');
  });

  it('uses the configured custom settings path for status and persistence diagnostics', async () => {
    const customSettingsPath = path.join(tempHome, '.ccs', 'profiles', 'foo.bar.settings.json');
    writeJson(path.join(tempHome, '.ccs', 'config.json'), {
      profiles: {
        'foo.bar': customSettingsPath,
      },
    });
    writeProfileSettings(
      tempHome,
      'foo.bar',
      {
        ANTHROPIC_BASE_URL: 'https://api.z.ai/v1',
        ANTHROPIC_API_KEY: 'glm-test-key',
      },
      customSettingsPath
    );

    const response = await fetch(`${baseUrl}/api/settings/foo.bar/raw`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      path: string;
      imageAnalysisStatus: {
        persistencePath: string | null;
        hookInstalled: boolean | null;
      };
    };

    expect(body.path).toBe(customSettingsPath);
    expect(body.imageAnalysisStatus.persistencePath).toBe(customSettingsPath);
    expect(body.imageAnalysisStatus.hookInstalled).toBe(true);
  });

  it('resolves configured profile and variant relative settings paths under the CCS directory', async () => {
    const profileSettingsPath = path.join(tempHome, '.ccs', 'profiles', 'relative.settings.json');
    const variantSettingsPath = path.join(
      tempHome,
      '.ccs',
      'variants',
      'relative-var.settings.json'
    );
    writeJson(path.join(tempHome, '.ccs', 'config.json'), {
      profiles: {
        relative: 'profiles/relative.settings.json',
      },
      cliproxy: {
        'relative-var': {
          provider: 'gemini',
          settings: 'variants/relative-var.settings.json',
        },
      },
    });
    writeProfileSettings(
      tempHome,
      'relative',
      {
        ANTHROPIC_BASE_URL: 'https://api.z.ai/v1',
        ANTHROPIC_API_KEY: 'relative-profile-key',
      },
      profileSettingsPath
    );
    writeProfileSettings(
      tempHome,
      'relative-var',
      {
        ANTHROPIC_BASE_URL: 'https://api.z.ai/v1',
        ANTHROPIC_API_KEY: 'relative-variant-key',
      },
      variantSettingsPath
    );

    const profileResponse = await fetch(`${baseUrl}/api/settings/relative/raw`);
    expect(profileResponse.status).toBe(200);
    const profileBody = (await profileResponse.json()) as { path: string };
    expect(profileBody.path).toBe(profileSettingsPath);

    const variantResponse = await fetch(`${baseUrl}/api/settings/relative-var/raw`);
    expect(variantResponse.status).toBe(200);
    const variantBody = (await variantResponse.json()) as { path: string };
    expect(variantBody.path).toBe(variantSettingsPath);
  });

  it('rejects configured profile settings paths outside the CCS directory', async () => {
    const outsideSettingsPath = path.join(tempHome, 'outside', 'escaped.settings.json');
    writeJson(path.join(tempHome, '.ccs', 'config.json'), {
      profiles: {
        escaped: outsideSettingsPath,
      },
    });
    writeJson(outsideSettingsPath, {
      env: {
        ANTHROPIC_AUTH_TOKEN: 'outside-secret',
      },
    });

    const readResponse = await fetch(`${baseUrl}/api/settings/escaped/raw`);
    expect(readResponse.status).toBe(500);

    const writeResponse = await fetch(`${baseUrl}/api/settings/escaped`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        settings: {
          env: {
            ANTHROPIC_AUTH_TOKEN: 'overwritten-secret',
          },
        },
      }),
    });
    expect(writeResponse.status).toBe(500);

    const outsideSettings = JSON.parse(fs.readFileSync(outsideSettingsPath, 'utf8')) as {
      env: { ANTHROPIC_AUTH_TOKEN: string };
    };
    expect(outsideSettings.env.ANTHROPIC_AUTH_TOKEN).toBe('outside-secret');
  });

  it('rejects raw reads through settings-file symlink escapes', async () => {
    const outsideSettingsPath = path.join(tempHome, 'outside-raw.settings.json');
    const linkedSettingsPath = path.join(tempHome, '.ccs', 'linked.settings.json');
    writeJson(outsideSettingsPath, {
      env: {
        ANTHROPIC_AUTH_TOKEN: 'raw-outside-secret',
      },
    });
    fs.mkdirSync(path.dirname(linkedSettingsPath), { recursive: true });
    if (!createSymlinkIfAvailable(outsideSettingsPath, linkedSettingsPath)) {
      return;
    }

    const response = await fetch(`${baseUrl}/api/settings/linked/raw`);
    expect(response.status).toBe(500);

    const outsideSettings = JSON.parse(fs.readFileSync(outsideSettingsPath, 'utf8')) as {
      env: { ANTHROPIC_AUTH_TOKEN: string };
    };
    expect(outsideSettings.env.ANTHROPIC_AUTH_TOKEN).toBe('raw-outside-secret');
  });

  it('rejects variant settings paths outside the CCS directory', async () => {
    const outsideSettingsPath = path.join(tempHome, 'outside-variant', 'escaped.settings.json');
    writeJson(path.join(tempHome, '.ccs', 'config.json'), {
      profiles: {},
      cliproxy: {
        evilvar: {
          provider: 'gemini',
          settings: outsideSettingsPath,
        },
      },
    });
    writeJson(outsideSettingsPath, {
      env: {
        ANTHROPIC_AUTH_TOKEN: 'variant-outside-secret',
      },
    });

    const response = await fetch(`${baseUrl}/api/settings/evilvar/raw`);
    expect(response.status).toBe(500);

    const writeResponse = await fetch(`${baseUrl}/api/settings/evilvar`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        settings: {
          env: {
            ANTHROPIC_AUTH_TOKEN: 'variant-overwritten-secret',
          },
        },
      }),
    });
    expect(writeResponse.status).toBe(500);

    const outsideSettings = JSON.parse(fs.readFileSync(outsideSettingsPath, 'utf8')) as {
      env: { ANTHROPIC_AUTH_TOKEN: string };
    };
    expect(outsideSettings.env.ANTHROPIC_AUTH_TOKEN).toBe('variant-outside-secret');
  });

  it('rejects variant PUT settings paths that escape through symlinked parents', async () => {
    const outsideDir = path.join(tempHome, 'outside-variant-link');
    const outsideSettingsPath = path.join(outsideDir, 'escaped.settings.json');
    const linkDir = path.join(tempHome, '.ccs', 'variant-link');
    const linkedSettingsPath = path.join(linkDir, 'escaped.settings.json');
    fs.mkdirSync(outsideDir, { recursive: true });
    writeJson(outsideSettingsPath, {
      env: {
        ANTHROPIC_AUTH_TOKEN: 'variant-link-original',
      },
    });
    fs.mkdirSync(path.dirname(linkDir), { recursive: true });
    if (!createSymlinkIfAvailable(outsideDir, linkDir, 'dir')) {
      return;
    }

    writeJson(path.join(tempHome, '.ccs', 'config.json'), {
      profiles: {},
      cliproxy: {
        'linked-var': {
          provider: 'gemini',
          settings: linkedSettingsPath,
        },
      },
    });

    const response = await fetch(`${baseUrl}/api/settings/linked-var`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        settings: {
          env: {
            ANTHROPIC_AUTH_TOKEN: 'variant-link-overwritten',
          },
        },
      }),
    });
    expect(response.status).toBe(500);

    const outsideSettings = JSON.parse(fs.readFileSync(outsideSettingsPath, 'utf8')) as {
      env: { ANTHROPIC_AUTH_TOKEN: string };
    };
    expect(outsideSettings.env.ANTHROPIC_AUTH_TOKEN).toBe('variant-link-original');
  });

  it('previews image-analysis status from unsaved editor settings', async () => {
    writeProfileSettings(tempHome, 'glm', {
      ANTHROPIC_BASE_URL: 'https://api.z.ai/v1',
      ANTHROPIC_API_KEY: 'glm-test-key',
    });

    const response = await fetch(`${baseUrl}/api/settings/glm/image-analysis-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: {
          env: {
            ANTHROPIC_BASE_URL: 'https://proxy.example/api/provider/ghcp',
            ANTHROPIC_AUTH_TOKEN: 'preview-token',
          },
        },
      }),
    });
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      imageAnalysisStatus: {
        backendId: string | null;
        resolutionSource: string;
        authReadiness: string;
      };
    };

    expect(body.imageAnalysisStatus.backendId).toBe('ghcp');
    expect(body.imageAnalysisStatus.resolutionSource).toBe('cliproxy-bridge');
    expect(body.imageAnalysisStatus.authReadiness).toBe('missing');
  });

  it('respects per-profile native image preference stored in settings json', async () => {
    writeJson(path.join(tempHome, '.ccs', 'glmv.settings.json'), {
      env: {
        ANTHROPIC_BASE_URL: 'https://api.z.ai/v1',
        ANTHROPIC_MODEL: 'glm-4.5v',
        ANTHROPIC_AUTH_TOKEN: 'glmv-test-key',
      },
      ccs_image: {
        native_read: true,
      },
    });

    const response = await fetch(`${baseUrl}/api/settings/glmv/raw`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      imageAnalysisStatus: {
        backendId: string | null;
        resolutionSource: string;
        profileModel: string | null;
        nativeReadPreference: boolean;
        nativeImageCapable: boolean | null;
        effectiveRuntimeMode: string;
      };
    };

    expect(body.imageAnalysisStatus.backendId).toBeNull();
    expect(body.imageAnalysisStatus.resolutionSource).toBe('native-compatible');
    expect(body.imageAnalysisStatus.profileModel).toBe('glm-4.5v');
    expect(body.imageAnalysisStatus.nativeReadPreference).toBe(true);
    expect(body.imageAnalysisStatus.nativeImageCapable).toBe(true);
    expect(body.imageAnalysisStatus.effectiveRuntimeMode).toBe('native-read');
  });
});
