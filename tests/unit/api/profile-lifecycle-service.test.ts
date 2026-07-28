import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  copyApiProfile,
  discoverApiProfileOrphans,
  exportApiProfile,
  importApiProfileBundle,
  registerApiProfileOrphans,
} from '../../../src/api/services/profile-lifecycle-service';
import { validateApiProfileSettingsPayload } from '../../../src/api/services/profile-lifecycle-validation';
import { createApiProfile } from '../../../src/api/services/profile-writer';
import {
  loadConfigSafe,
  runWithScopedConfigDir,
  setGlobalConfigDir,
} from '../../../src/utils/config-manager';

describe('profile lifecycle service', () => {
  let tempHome = '';
  let originalCcsHome: string | undefined;
  let originalCcsDir: string | undefined;
  let originalUnifiedMode: string | undefined;

  function getScopedCcsDir(): string {
    return path.join(tempHome, '.ccs');
  }

  async function runInScopedCcsDir<T>(fn: () => T): Promise<T> {
    return await runWithScopedConfigDir(getScopedCcsDir(), fn);
  }

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-profile-lifecycle-'));
    originalCcsHome = process.env.CCS_HOME;
    originalCcsDir = process.env.CCS_DIR;
    originalUnifiedMode = process.env.CCS_UNIFIED_CONFIG;
    process.env.CCS_HOME = tempHome;
    delete process.env.CCS_DIR;
    delete process.env.CCS_UNIFIED_CONFIG;
    setGlobalConfigDir(undefined);
  });

  afterEach(() => {
    mock.restore();

    if (originalCcsHome === undefined) {
      delete process.env.CCS_HOME;
    } else {
      process.env.CCS_HOME = originalCcsHome;
    }

    if (originalCcsDir === undefined) {
      delete process.env.CCS_DIR;
    } else {
      process.env.CCS_DIR = originalCcsDir;
    }

    if (originalUnifiedMode === undefined) {
      delete process.env.CCS_UNIFIED_CONFIG;
    } else {
      process.env.CCS_UNIFIED_CONFIG = originalUnifiedMode;
    }

    setGlobalConfigDir(undefined);

    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('accepts ANTHROPIC_DEFAULT_FABLE_MODEL as a supported model mapping', () => {
    const validation = validateApiProfileSettingsPayload({
      env: {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/codex',
        ANTHROPIC_AUTH_TOKEN: 'token',
        ANTHROPIC_DEFAULT_FABLE_MODEL: 'gpt-5.4-mini',
      },
    });

    expect(validation.valid).toBe(true);
    expect(validation.issues).toEqual([]);
  });

  it('enforces the provider denylist for ANTHROPIC_DEFAULT_FABLE_MODEL', () => {
    const validation = validateApiProfileSettingsPayload({
      env: {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/agy',
        ANTHROPIC_AUTH_TOKEN: 'token',
        ANTHROPIC_DEFAULT_FABLE_MODEL: 'claude-sonnet-4.5',
      },
    });

    expect(validation.valid).toBe(false);
    expect(validation.issues).toContainEqual(
      expect.objectContaining({
        level: 'error',
        code: 'model_denylisted',
        field: 'env.ANTHROPIC_DEFAULT_FABLE_MODEL',
      })
    );
  });

  it('discovers grandfathered xai/grok orphans while skipping other reserved names', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    fs.writeFileSync(
      path.join(ccsDir, 'config.json'),
      JSON.stringify({ profiles: { glm: '~/.ccs/glm.settings.json' } }, null, 2) + '\n'
    );

    fs.writeFileSync(
      path.join(ccsDir, 'glm.settings.json'),
      JSON.stringify(
        { env: { ANTHROPIC_BASE_URL: 'https://api.example.com', ANTHROPIC_AUTH_TOKEN: 'token' } },
        null,
        2
      ) + '\n'
    );
    fs.writeFileSync(
      path.join(ccsDir, 'extra.settings.json'),
      JSON.stringify(
        { env: { ANTHROPIC_BASE_URL: 'https://api.example.com', ANTHROPIC_AUTH_TOKEN: 'token' } },
        null,
        2
      ) + '\n'
    );
    fs.writeFileSync(
      path.join(ccsDir, 'gemini.settings.json'),
      JSON.stringify(
        { env: { ANTHROPIC_BASE_URL: 'https://api.example.com', ANTHROPIC_AUTH_TOKEN: 'token' } },
        null,
        2
      ) + '\n'
    );
    for (const profileName of ['xai', 'grok']) {
      fs.writeFileSync(
        path.join(ccsDir, `${profileName}.settings.json`),
        JSON.stringify(
          {
            env: {
              ANTHROPIC_BASE_URL: 'https://api.example.com',
              ANTHROPIC_AUTH_TOKEN: 'token',
            },
          },
          null,
          2
        ) + '\n'
      );
    }

    const result = await runInScopedCcsDir(() => discoverApiProfileOrphans());
    expect(result.orphans.map((orphan) => orphan.name).sort()).toEqual(['extra', 'grok', 'xai']);
  });

  it('registers a grandfathered xai orphan without opening general reserved-name creation', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(
      path.join(ccsDir, 'xai.settings.json'),
      JSON.stringify(
        { env: { ANTHROPIC_BASE_URL: 'https://api.example.com', ANTHROPIC_AUTH_TOKEN: 'token' } },
        null,
        2
      ) + '\n'
    );
    fs.writeFileSync(
      path.join(ccsDir, 'gemini.settings.json'),
      JSON.stringify(
        { env: { ANTHROPIC_BASE_URL: 'https://api.example.com', ANTHROPIC_AUTH_TOKEN: 'token' } },
        null,
        2
      ) + '\n'
    );
    fs.writeFileSync(
      path.join(ccsDir, 'config.json'),
      JSON.stringify({ profiles: {} }, null, 2) + '\n'
    );

    const result = await runInScopedCcsDir(() =>
      registerApiProfileOrphans({ names: ['xai', 'gemini'] })
    );
    const config = await runInScopedCcsDir(() => loadConfigSafe());

    expect(result.registered).toEqual(['xai']);
    expect(result.skipped).toEqual([]);
    expect(config.profiles.xai).toBe('~/.ccs/xai.settings.json');
    expect(config.profiles.gemini).toBeUndefined();
  });

  it('treats explicit empty names list as no-op during orphan registration', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    fs.writeFileSync(
      path.join(ccsDir, 'lonely.settings.json'),
      JSON.stringify(
        { env: { ANTHROPIC_BASE_URL: 'https://api.example.com', ANTHROPIC_AUTH_TOKEN: 'token' } },
        null,
        2
      ) + '\n'
    );
    fs.writeFileSync(
      path.join(ccsDir, 'config.json'),
      JSON.stringify({ profiles: {} }, null, 2) + '\n'
    );

    const result = await runInScopedCcsDir(() => registerApiProfileOrphans({ names: [] }));
    expect(result.registered).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it('does not register orphan profiles when local WebSearch tool setup fails', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    fs.writeFileSync(
      path.join(ccsDir, 'extra.settings.json'),
      JSON.stringify(
        { env: { ANTHROPIC_BASE_URL: 'https://api.example.com', ANTHROPIC_AUTH_TOKEN: 'token' } },
        null,
        2
      ) + '\n'
    );
    fs.writeFileSync(
      path.join(ccsDir, 'config.json'),
      JSON.stringify({ profiles: {} }, null, 2) + '\n'
    );

    const copyFileSpy = spyOn(fs, 'copyFileSync').mockImplementation(() => {
      throw new Error('copy failed');
    });

    const result = await runInScopedCcsDir(() => registerApiProfileOrphans({ names: ['extra'] }));
    const config = await runInScopedCcsDir(() => loadConfigSafe());

    expect(copyFileSpy).toHaveBeenCalled();
    expect(result.registered).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toContain('could not prepare the local WebSearch tool');
    expect(config.profiles.extra).toBeUndefined();
  });

  it('keeps orphan registration non-fatal when WebSearch is disabled', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    fs.writeFileSync(
      path.join(ccsDir, 'extra.settings.json'),
      JSON.stringify(
        { env: { ANTHROPIC_BASE_URL: 'https://api.example.com', ANTHROPIC_AUTH_TOKEN: 'token' } },
        null,
        2
      ) + '\n'
    );
    fs.writeFileSync(
      path.join(ccsDir, 'config.json'),
      JSON.stringify({ profiles: {} }, null, 2) + '\n'
    );
    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      'version: 12\nwebsearch:\n  enabled: false\n',
      'utf8'
    );

    const originalCopyFileSync = fs.copyFileSync.bind(fs);
    const copyFileSpy = spyOn(fs, 'copyFileSync').mockImplementation((source, destination) => {
      const sourcePath = String(source);
      const destinationPath = String(destination);
      if (sourcePath.includes('websearch') || destinationPath.includes('websearch')) {
        throw new Error('websearch copy should not run when WebSearch is disabled');
      }
      return originalCopyFileSync(source, destination);
    });

    const result = await runInScopedCcsDir(() => registerApiProfileOrphans({ names: ['extra'] }));

    expect(copyFileSpy).toHaveBeenCalled();
    expect(result.registered).toEqual(['extra']);
    expect(result.skipped).toEqual([]);
    expect(fs.existsSync(path.join(ccsDir, 'hooks', 'websearch-transformer.cjs'))).toBe(false);
  });

  it('registers malformed orphan settings when force bypasses validation', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    const malformedPath = path.join(ccsDir, 'bad.settings.json');
    fs.writeFileSync(malformedPath, '{ invalid json', 'utf8');
    fs.writeFileSync(
      path.join(ccsDir, 'config.json'),
      JSON.stringify({ profiles: {} }, null, 2) + '\n'
    );

    const result = await runInScopedCcsDir(() =>
      registerApiProfileOrphans({ names: ['bad'], force: true })
    );
    const config = await runInScopedCcsDir(() => loadConfigSafe());

    expect(result.registered).toEqual(['bad']);
    expect(result.skipped).toEqual([]);
    expect(config.profiles.bad).toBe('~/.ccs/bad.settings.json');
    expect(fs.existsSync(path.join(ccsDir, 'hooks', 'websearch-transformer.cjs'))).toBe(false);
    expect(fs.readFileSync(malformedPath, 'utf8')).toBe('{ invalid json');
  });

  it('redacts all sensitive env values during export when includeSecrets=false', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    fs.writeFileSync(
      path.join(ccsDir, 'config.json'),
      JSON.stringify({ profiles: { glm: '~/.ccs/glm.settings.json' } }, null, 2) + '\n'
    );
    fs.writeFileSync(
      path.join(ccsDir, 'glm.settings.json'),
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'https://api.example.com',
            ANTHROPIC_AUTH_TOKEN: 'token-1',
            OPENROUTER_API_KEY: 'token-2',
          },
        },
        null,
        2
      ) + '\n'
    );

    const result = await runInScopedCcsDir(() => exportApiProfile('glm', false));
    expect(result.success).toBe(true);
    expect(result.bundle?.settings).toBeDefined();

    const env = (result.bundle?.settings.env as Record<string, unknown>) || {};
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe('__CCS_REDACTED__');
    expect(env.OPENROUTER_API_KEY).toBe('__CCS_REDACTED__');
  });

  it('rejects invalid source profile names in copy flow', async () => {
    const result = await runInScopedCcsDir(() => copyApiProfile('../escape', 'safe-name'));
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid source profile name');
  });

  it('copies and exports grandfathered sources but rejects reserved destinations', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(
      path.join(ccsDir, 'config.json'),
      JSON.stringify({ profiles: { xai: '~/.ccs/xai.settings.json' } }, null, 2) + '\n'
    );
    fs.writeFileSync(
      path.join(ccsDir, 'xai.settings.json'),
      JSON.stringify(
        { env: { ANTHROPIC_BASE_URL: 'https://api.example.com', ANTHROPIC_AUTH_TOKEN: 'token' } },
        null,
        2
      ) + '\n'
    );

    const exported = await runInScopedCcsDir(() => exportApiProfile('xai'));
    const copied = await runInScopedCcsDir(() => copyApiProfile('xai', 'xai-backup'));
    const rejectedDestination = await runInScopedCcsDir(() => copyApiProfile('xai', 'GROK'));

    expect(exported.success).toBe(true);
    expect(exported.bundle?.profile.name).toBe('xai');
    expect(copied.success).toBe(true);
    expect(fs.existsSync(path.join(ccsDir, 'xai-backup.settings.json'))).toBe(true);
    expect(rejectedDestination.success).toBe(false);
    expect(rejectedDestination.error).toContain('reserved name');
    expect(fs.existsSync(path.join(ccsDir, 'GROK.settings.json'))).toBe(false);
  });

  it('allows force copy only onto an exact existing grandfathered destination', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(
      path.join(ccsDir, 'config.json'),
      JSON.stringify(
        {
          profiles: {
            source: '~/.ccs/source.settings.json',
            xai: '~/.ccs/xai.settings.json',
          },
        },
        null,
        2
      ) + '\n'
    );
    fs.writeFileSync(
      path.join(ccsDir, 'source.settings.json'),
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'https://source.example.com',
            ANTHROPIC_AUTH_TOKEN: 'source-token',
          },
        },
        null,
        2
      ) + '\n'
    );
    fs.writeFileSync(
      path.join(ccsDir, 'xai.settings.json'),
      JSON.stringify(
        { env: { ANTHROPIC_BASE_URL: 'https://old.example.com', ANTHROPIC_AUTH_TOKEN: 'old' } },
        null,
        2
      ) + '\n'
    );

    const nonForced = await runInScopedCcsDir(() => copyApiProfile('source', 'xai'));
    const forced = await runInScopedCcsDir(() => copyApiProfile('source', 'xai', { force: true }));
    const absentForced = await runInScopedCcsDir(() =>
      copyApiProfile('source', 'grok', { force: true })
    );

    expect(nonForced.success).toBe(false);
    expect(nonForced.error).toContain('reserved name');
    expect(forced.success).toBe(true);
    expect(absentForced.success).toBe(false);
    expect(absentForced.error).toContain('reserved name');
    expect(fs.existsSync(path.join(ccsDir, 'grok.settings.json'))).toBe(false);

    const copiedSettings = JSON.parse(
      fs.readFileSync(path.join(ccsDir, 'xai.settings.json'), 'utf8')
    ) as {
      env: Record<string, string>;
    };
    expect(copiedSettings.env.ANTHROPIC_BASE_URL).toBe('https://source.example.com');
    expect(copiedSettings.env.ANTHROPIC_AUTH_TOKEN).toBe('source-token');
  });

  it('rejects an absent reserved name even when profile creation is forced', async () => {
    const result = await runInScopedCcsDir(() =>
      createApiProfile(
        'XAI',
        'https://api.example.com',
        'token',
        {
          default: 'model',
          opus: 'model',
          sonnet: 'model',
          haiku: 'model',
        },
        'claude',
        undefined,
        undefined,
        { force: true }
      )
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('reserved name');
    expect(fs.existsSync(path.join(getScopedCcsDir(), 'XAI.settings.json'))).toBe(false);
  });

  it('allows force to repair an exact existing xai API profile', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(
      path.join(ccsDir, 'config.json'),
      JSON.stringify({ profiles: { xai: '~/.ccs/xai.settings.json' } }, null, 2) + '\n'
    );
    fs.writeFileSync(
      path.join(ccsDir, 'xai.settings.json'),
      JSON.stringify(
        { env: { ANTHROPIC_BASE_URL: 'https://old.example.com', ANTHROPIC_AUTH_TOKEN: 'old' } },
        null,
        2
      ) + '\n'
    );

    const nonForced = await runInScopedCcsDir(() =>
      createApiProfile('xai', 'https://new.example.com', 'new-token', {
        default: 'model',
        opus: 'model',
        sonnet: 'model',
        haiku: 'model',
      })
    );
    const forced = await runInScopedCcsDir(() =>
      createApiProfile(
        'xai',
        'https://new.example.com',
        'new-token',
        {
          default: 'model',
          opus: 'model',
          sonnet: 'model',
          haiku: 'model',
        },
        'claude',
        undefined,
        undefined,
        { force: true }
      )
    );

    expect(nonForced.success).toBe(false);
    expect(nonForced.error).toContain('reserved name');
    expect(forced.success).toBe(true);
    const settings = JSON.parse(
      fs.readFileSync(path.join(ccsDir, 'xai.settings.json'), 'utf8')
    ) as {
      env: Record<string, string>;
    };
    expect(settings.env.ANTHROPIC_BASE_URL).toBe('https://new.example.com');
    expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBe('new-token');
  });

  it('rolls back copied settings when local WebSearch tool setup fails', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(
      path.join(ccsDir, 'config.json'),
      JSON.stringify({ profiles: { source: '~/.ccs/source.settings.json' } }, null, 2) + '\n'
    );
    fs.writeFileSync(
      path.join(ccsDir, 'source.settings.json'),
      JSON.stringify(
        { env: { ANTHROPIC_BASE_URL: 'https://api.example.com', ANTHROPIC_AUTH_TOKEN: 'token' } },
        null,
        2
      ) + '\n'
    );

    const copyFileSpy = spyOn(fs, 'copyFileSync').mockImplementation(() => {
      throw new Error('copy failed');
    });

    const result = await runInScopedCcsDir(() => copyApiProfile('source', 'copy-dest'));

    expect(result.success).toBe(false);
    expect(result.error).toContain('could not prepare the local WebSearch tool');
    expect(copyFileSpy).toHaveBeenCalled();
    expect(fs.existsSync(path.join(ccsDir, 'copy-dest.settings.json'))).toBe(false);
  });

  it('rejects import bundle with invalid profile target', async () => {
    const result = await runInScopedCcsDir(() =>
      importApiProfileBundle({
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        profile: { name: 'glm', target: 'invalid-target' },
        settings: {
          env: {
            ANTHROPIC_BASE_URL: 'https://api.example.com',
            ANTHROPIC_AUTH_TOKEN: 'token',
          },
        },
      })
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid bundle profile target');
  });

  it('allows force import only for an exact existing grandfathered profile', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(
      path.join(ccsDir, 'config.json'),
      JSON.stringify({ profiles: { xai: '~/.ccs/xai.settings.json' } }, null, 2) + '\n'
    );
    fs.writeFileSync(
      path.join(ccsDir, 'xai.settings.json'),
      JSON.stringify(
        { env: { ANTHROPIC_BASE_URL: 'https://old.example.com', ANTHROPIC_AUTH_TOKEN: 'old' } },
        null,
        2
      ) + '\n'
    );

    const bundle = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      profile: { name: 'xai', target: 'claude' },
      settings: {
        env: {
          ANTHROPIC_BASE_URL: 'https://repaired.example.com',
          ANTHROPIC_AUTH_TOKEN: 'repaired-token',
        },
      },
    };

    const nonForced = await runInScopedCcsDir(() => importApiProfileBundle(bundle));
    const forced = await runInScopedCcsDir(() => importApiProfileBundle(bundle, { force: true }));
    const absentForced = await runInScopedCcsDir(() =>
      importApiProfileBundle(
        {
          ...bundle,
          profile: { ...bundle.profile, name: 'grok' },
        },
        { force: true }
      )
    );

    expect(nonForced.success).toBe(false);
    expect(nonForced.error).toContain('reserved name');
    expect(forced.success).toBe(true);
    expect(absentForced.success).toBe(false);
    expect(absentForced.error).toContain('reserved name');
    expect(fs.existsSync(path.join(ccsDir, 'grok.settings.json'))).toBe(false);

    const settings = JSON.parse(
      fs.readFileSync(path.join(ccsDir, 'xai.settings.json'), 'utf8')
    ) as {
      env: Record<string, string>;
    };
    expect(settings.env.ANTHROPIC_BASE_URL).toBe('https://repaired.example.com');
    expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBe('repaired-token');
  });

  it('rolls back imported settings when local WebSearch tool setup fails', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(
      path.join(ccsDir, 'config.json'),
      JSON.stringify({ profiles: {} }, null, 2) + '\n'
    );

    const copyFileSpy = spyOn(fs, 'copyFileSync').mockImplementation(() => {
      throw new Error('copy failed');
    });

    const result = await runInScopedCcsDir(() =>
      importApiProfileBundle({
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        profile: { name: 'import-failure', target: 'claude' },
        settings: {
          env: {
            ANTHROPIC_BASE_URL: 'https://api.example.com',
            ANTHROPIC_AUTH_TOKEN: 'token',
          },
        },
      })
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('could not prepare the local WebSearch tool');
    expect(copyFileSpy).toHaveBeenCalled();
    expect(fs.existsSync(path.join(ccsDir, 'import-failure.settings.json'))).toBe(false);
  });

  it('clears and warns for all redacted sensitive env keys on import', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(
      path.join(ccsDir, 'config.json'),
      JSON.stringify({ profiles: {} }, null, 2) + '\n'
    );

    const result = await runInScopedCcsDir(() =>
      importApiProfileBundle({
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        profile: { name: 'redacted-import', target: 'claude' },
        settings: {
          env: {
            ANTHROPIC_BASE_URL: 'https://api.example.com',
            ANTHROPIC_AUTH_TOKEN: '__CCS_REDACTED__',
            OPENROUTER_API_KEY: '__CCS_REDACTED__',
          },
        },
      })
    );

    expect(result.success).toBe(true);
    expect(result.warnings?.length).toBeGreaterThan(0);

    const settingsPath = path.join(ccsDir, 'redacted-import.settings.json');
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
      env: Record<string, string>;
    };
    expect(parsed.env.ANTHROPIC_AUTH_TOKEN).toBe('');
    expect(parsed.env.OPENROUTER_API_KEY).toBe('');
  });
});
