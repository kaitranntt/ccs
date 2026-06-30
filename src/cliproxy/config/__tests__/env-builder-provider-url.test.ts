import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ensureProviderSettings, getEffectiveEnvVars } from '../env-builder';
import { invalidateConfigCache } from '../../../config/config-loader-facade';
import { clearConfigCache } from '../base-config-loader';

interface EnvSettings {
  ANTHROPIC_BASE_URL: string;
  ANTHROPIC_AUTH_TOKEN: string;
  ANTHROPIC_MODEL: string;
  ANTHROPIC_DEFAULT_OPUS_MODEL: string;
  ANTHROPIC_DEFAULT_SONNET_MODEL: string;
  ANTHROPIC_DEFAULT_HAIKU_MODEL: string;
}

function writeSettings(
  settingsPath: string,
  env: EnvSettings,
  extras?: Record<string, unknown>
): void {
  fs.writeFileSync(settingsPath, JSON.stringify({ env, ...(extras || {}) }, null, 2));
}

describe('getEffectiveEnvVars local provider URL normalization', () => {
  let tempHome: string;
  let settingsPath: string;
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    originalCcsHome = process.env.CCS_HOME;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-env-url-'));
    settingsPath = path.join(tempHome, 'codex.settings.json');
    process.env.CCS_HOME = tempHome;
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
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  function writeBackendConfig(backend: 'original' | 'plus'): void {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      ['version: 1', 'cliproxy:', `  backend: ${backend}`, ''].join('\n'),
      'utf8'
    );
    invalidateConfigCache();
    clearConfigCache();
  }

  it('keeps local root URL for the original backend without stripping codex effort suffixes', () => {
    writeSettings(settingsPath, {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317',
      ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
      ANTHROPIC_MODEL: 'gpt-5.3-codex-xhigh',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-5.3-codex-xhigh',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-5.3-codex-high',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gpt-5.4-mini-medium',
    });

    const env = getEffectiveEnvVars('codex', 8317, settingsPath);
    expect(env.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:8317');
    expect(env.ANTHROPIC_MODEL).toBe('gpt-5.3-codex-xhigh');
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('gpt-5.3-codex-xhigh');
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('gpt-5.3-codex-high');
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('gpt-5.4-mini-medium');

    const persisted = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
      env: Record<string, string>;
    };
    expect(persisted.env.ANTHROPIC_MODEL).toBe('gpt-5.3-codex-xhigh');
    expect(persisted.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('gpt-5.3-codex-xhigh');
    expect(persisted.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('gpt-5.3-codex-high');
    expect(persisted.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('gpt-5.4-mini-medium');
  });

  it('rewrites local root URL to provider endpoint for the plus backend', () => {
    writeBackendConfig('plus');
    writeSettings(settingsPath, {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317',
      ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
      ANTHROPIC_MODEL: 'gpt-5.3-codex-xhigh',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-5.3-codex-xhigh',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-5.3-codex-high',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gpt-5.4-mini-medium',
    });

    const env = getEffectiveEnvVars('codex', 8317, settingsPath);
    expect(env.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:8317/api/provider/codex');
  });

  it('rewrites wrong local provider path to root for the original backend', () => {
    writeSettings(settingsPath, {
      ANTHROPIC_BASE_URL: 'http://localhost:8317/api/provider/my-codex-variant?debug=1',
      ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
      ANTHROPIC_MODEL: 'gpt-5.3-codex-xhigh',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-5.3-codex-xhigh',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-5.3-codex-high',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gpt-5.4-mini-medium',
    });

    const env = getEffectiveEnvVars('codex', 8317, settingsPath);
    expect(env.ANTHROPIC_BASE_URL).toBe('http://localhost:8317');
  });

  it('rewrites wrong local provider path to the requested provider for the plus backend', () => {
    writeBackendConfig('plus');
    writeSettings(settingsPath, {
      ANTHROPIC_BASE_URL: 'http://localhost:8317/api/provider/my-codex-variant?debug=1',
      ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
      ANTHROPIC_MODEL: 'gpt-5.3-codex-xhigh',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-5.3-codex-xhigh',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-5.3-codex-high',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gpt-5.4-mini-medium',
    });

    const env = getEffectiveEnvVars('codex', 8317, settingsPath);
    expect(env.ANTHROPIC_BASE_URL).toBe('http://localhost:8317/api/provider/codex');
  });

  it('does not rewrite localhost URLs targeting non-cliproxy ports', () => {
    writeSettings(settingsPath, {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:11434',
      ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
      ANTHROPIC_MODEL: 'gpt-5.3-codex-xhigh',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-5.3-codex-xhigh',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-5.3-codex-high',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gpt-5-mini-medium',
    });

    const env = getEffectiveEnvVars('codex', 8317, settingsPath);
    expect(env.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:11434');
  });

  it('normalizes dotted Claude major.minor IDs for agy provider settings', () => {
    writeSettings(settingsPath, {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/agy',
      ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
      ANTHROPIC_MODEL: 'claude-sonnet-4.6-thinking',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4.6-thinking',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4.6-thinking',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4.5',
    });

    const env = getEffectiveEnvVars('agy', 8317, settingsPath);
    expect(env.ANTHROPIC_MODEL).toBe('claude-sonnet-4-6');
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('claude-opus-4-6-thinking');
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('claude-sonnet-4-6');
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('claude-haiku-4-5');

    const persisted = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
      env: Record<string, string>;
    };
    expect(persisted.env.ANTHROPIC_MODEL).toBe('claude-sonnet-4-6');
    expect(persisted.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('claude-opus-4-6-thinking');
    expect(persisted.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('claude-sonnet-4-6');
  });

  it('migrates denylisted AGY 4.5 model IDs to supported 4.6 fallbacks', () => {
    writeSettings(
      settingsPath,
      {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/agy',
        ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
        ANTHROPIC_MODEL: 'claude-opus-4.5',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-5-thinking',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4.5-thinking',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-sonnet-4-5',
      },
      {
        presets: [
          {
            name: 'legacy-45',
            default: 'claude-opus-4.5',
            opus: 'claude-opus-4-5-thinking',
            sonnet: 'claude-sonnet-4.5-thinking',
            haiku: 'claude-sonnet-4-5',
          },
        ],
      }
    );

    const env = getEffectiveEnvVars('agy', 8317, settingsPath);
    expect(env.ANTHROPIC_MODEL).toBe('claude-opus-4-6-thinking');
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('claude-opus-4-6-thinking');
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('claude-sonnet-4-6');
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('claude-sonnet-4-6');

    const persisted = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
      env: Record<string, string>;
      presets?: Array<Record<string, string>>;
    };
    expect(persisted.env.ANTHROPIC_MODEL).toBe('claude-opus-4-6-thinking');
    expect(persisted.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('claude-opus-4-6-thinking');
    expect(persisted.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('claude-sonnet-4-6');
    expect(persisted.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('claude-sonnet-4-6');
    expect(persisted.presets?.[0]?.default).toBe('claude-opus-4-6-thinking');
    expect(persisted.presets?.[0]?.opus).toBe('claude-opus-4-6-thinking');
    expect(persisted.presets?.[0]?.sonnet).toBe('claude-sonnet-4-6');
    expect(persisted.presets?.[0]?.haiku).toBe('claude-sonnet-4-6');
  });

  it('preserves codex preset effort suffixes while loading provider env vars', () => {
    writeSettings(
      settingsPath,
      {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/codex',
        ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
        ANTHROPIC_MODEL: 'gpt-5.3-codex-xhigh',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-5.3-codex-xhigh',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-5.3-codex-high',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gpt-5-mini-medium',
      },
      {
        presets: [
          {
            name: 'legacy-codex',
            default: 'gpt-5.3-codex-xhigh',
            opus: 'gpt-5.3-codex-xhigh',
            sonnet: 'gpt-5.3-codex-high',
            haiku: 'gpt-5-mini-medium',
          },
        ],
      }
    );

    getEffectiveEnvVars('codex', 8317, settingsPath);

    const persisted = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
      presets: Array<Record<string, string>>;
    };
    expect(persisted.presets[0]?.default).toBe('gpt-5.3-codex-xhigh');
    expect(persisted.presets[0]?.opus).toBe('gpt-5.3-codex-xhigh');
    expect(persisted.presets[0]?.sonnet).toBe('gpt-5.3-codex-high');
    expect(persisted.presets[0]?.haiku).toBe('gpt-5-mini-medium');
  });

  it('migrates iflow placeholder model IDs to a supported default', () => {
    const iflowSettingsPath = path.join(tempHome, 'iflow.settings.json');
    writeSettings(
      iflowSettingsPath,
      {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/iflow',
        ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
        ANTHROPIC_MODEL: 'iflow-default',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'iflow-default',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'iflow-default',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'iflow-default',
      },
      {
        presets: [
          {
            name: 'legacy-iflow',
            default: 'iflow-default',
            opus: 'iflow-default',
            sonnet: 'iflow-default',
            haiku: 'iflow-default',
          },
        ],
      }
    );

    const env = getEffectiveEnvVars('iflow', 8317, iflowSettingsPath);
    expect(env.ANTHROPIC_MODEL).toBe('qwen3-coder-plus');
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('qwen3-coder-plus');
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('qwen3-coder-plus');
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('qwen3-coder-plus');

    const persisted = JSON.parse(fs.readFileSync(iflowSettingsPath, 'utf-8')) as {
      env: Record<string, string>;
      presets: Array<Record<string, string>>;
    };
    expect(persisted.env.ANTHROPIC_MODEL).toBe('qwen3-coder-plus');
    expect(persisted.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('qwen3-coder-plus');
    expect(persisted.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('qwen3-coder-plus');
    expect(persisted.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('qwen3-coder-plus');
    expect(persisted.presets[0]?.default).toBe('qwen3-coder-plus');
    expect(persisted.presets[0]?.opus).toBe('qwen3-coder-plus');
    expect(persisted.presets[0]?.sonnet).toBe('qwen3-coder-plus');
    expect(persisted.presets[0]?.haiku).toBe('qwen3-coder-plus');
  });

  it('migrates stale iflow model aliases (including kimi-k2.5) to supported IDs', () => {
    const iflowSettingsPath = path.join(tempHome, 'iflow.settings.json');
    writeSettings(
      iflowSettingsPath,
      {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/iflow',
        ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
        ANTHROPIC_MODEL: 'kimi-k2.5',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'iflow-default',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'deepseek-v3.2-chat',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'glm-4.7',
      },
      {
        presets: [
          {
            name: 'legacy-iflow',
            default: 'kimi-k2.5',
            opus: 'iflow-default',
            sonnet: 'deepseek-v3.2-chat',
            haiku: 'minimax-m2.5',
          },
        ],
      }
    );

    const env = getEffectiveEnvVars('iflow', 8317, iflowSettingsPath);
    expect(env.ANTHROPIC_MODEL).toBe('kimi-k2');
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('qwen3-coder-plus');
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('deepseek-v3.2');
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('glm-4.6');

    const persisted = JSON.parse(fs.readFileSync(iflowSettingsPath, 'utf-8')) as {
      env: Record<string, string>;
      presets: Array<Record<string, string>>;
    };
    expect(persisted.env.ANTHROPIC_MODEL).toBe('kimi-k2');
    expect(persisted.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('qwen3-coder-plus');
    expect(persisted.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('deepseek-v3.2');
    expect(persisted.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('glm-4.6');
    expect(persisted.presets[0]?.default).toBe('kimi-k2');
    expect(persisted.presets[0]?.opus).toBe('qwen3-coder-plus');
    expect(persisted.presets[0]?.sonnet).toBe('deepseek-v3.2');
    expect(persisted.presets[0]?.haiku).toBe('qwen3-coder-plus');
  });

  it('repairs existing provider settings files that are missing env keys', () => {
    const agySettingsPath = path.join(tempHome, '.ccs', 'agy.settings.json');
    fs.mkdirSync(path.dirname(agySettingsPath), { recursive: true });
    fs.writeFileSync(
      agySettingsPath,
      JSON.stringify(
        {
          hooks: {
            PreToolUse: [{ matcher: 'WebSearch', hooks: [] }],
          },
        },
        null,
        2
      )
    );

    ensureProviderSettings('agy');

    const repaired = JSON.parse(fs.readFileSync(agySettingsPath, 'utf-8')) as {
      env?: Record<string, string>;
      hooks?: Record<string, unknown>;
    };
    expect(repaired.hooks?.PreToolUse).toBeDefined();
    expect(repaired.env?.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:8317');
    expect(repaired.env?.ANTHROPIC_MODEL).toBeDefined();
    expect(repaired.env?.ANTHROPIC_DEFAULT_OPUS_MODEL).toBeDefined();
    expect(repaired.env?.ANTHROPIC_DEFAULT_SONNET_MODEL).toBeDefined();
    expect(repaired.env?.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBeDefined();
  });

  it('imports legacy cursor settings into the dedicated provider path without reusing legacy transport auth', () => {
    writeBackendConfig('plus');
    const legacySettingsPath = path.join(tempHome, '.ccs', 'cursor.settings.json');
    const providerSettingsPath = path.join(
      tempHome,
      '.ccs',
      'cliproxy',
      'providers',
      'cursor.settings.json'
    );
    fs.mkdirSync(path.dirname(legacySettingsPath), { recursive: true });
    fs.writeFileSync(
      legacySettingsPath,
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'http://127.0.0.1:20129',
            ANTHROPIC_AUTH_TOKEN: 'cursor-managed',
            ANTHROPIC_API_KEY: 'legacy-cursor-api-key',
            ANTHROPIC_MODEL: 'claude-4-sonnet',
            ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-4-opus',
            ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-4-sonnet',
            ANTHROPIC_DEFAULT_HAIKU_MODEL: 'cursor-small',
            ANTHROPIC_SMALL_FAST_MODEL: 'cursor-small',
            DISABLE_TELEMETRY: '1',
          },
          hooks: {
            PreToolUse: [{ matcher: 'Read', hooks: [] }],
          },
        },
        null,
        2
      )
    );

    const env = getEffectiveEnvVars('cursor');

    expect(env.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:8317/api/provider/cursor');
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe('ccs-internal-managed');
    expect(env.ANTHROPIC_MODEL).toBe('claude-4-sonnet');
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('claude-4-opus');
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('cursor-small');
    expect(env.ANTHROPIC_SMALL_FAST_MODEL).toBe('cursor-small');
    expect(env.DISABLE_TELEMETRY).toBe('1');
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();

    const migrated = JSON.parse(fs.readFileSync(providerSettingsPath, 'utf-8')) as {
      env: Record<string, string>;
      hooks?: Record<string, unknown>;
    };
    expect(migrated.env.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:8317/api/provider/cursor');
    expect(migrated.env.ANTHROPIC_AUTH_TOKEN).toBe('ccs-internal-managed');
    expect(migrated.env.ANTHROPIC_MODEL).toBe('claude-4-sonnet');
    expect(migrated.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('claude-4-opus');
    expect(migrated.env.ANTHROPIC_SMALL_FAST_MODEL).toBe('cursor-small');
    expect(migrated.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(migrated.hooks?.PreToolUse).toBeDefined();
  });

  it('migrates deprecated agy sonnet 4.6 thinking IDs during ensureProviderSettings', () => {
    const agySettingsPath = path.join(tempHome, '.ccs', 'agy.settings.json');
    fs.mkdirSync(path.dirname(agySettingsPath), { recursive: true });
    fs.writeFileSync(
      agySettingsPath,
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/agy',
            ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
            ANTHROPIC_MODEL: 'claude-sonnet-4-6-thinking(8192)',
            ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6-thinking',
            ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4.6-thinking',
            ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-sonnet-4-5',
          },
          presets: [
            {
              name: 'legacy',
              default: 'claude-sonnet-4-6-thinking',
              opus: 'claude-opus-4.6-thinking',
              sonnet: 'claude-sonnet-4.6-thinking',
              haiku: 'claude-sonnet-4-5',
            },
          ],
        },
        null,
        2
      )
    );

    ensureProviderSettings('agy');

    const repaired = JSON.parse(fs.readFileSync(agySettingsPath, 'utf-8')) as {
      env?: Record<string, string>;
      presets?: Array<Record<string, string>>;
    };
    expect(repaired.env?.ANTHROPIC_MODEL).toBe('claude-sonnet-4-6(8192)');
    expect(repaired.env?.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('claude-opus-4-6-thinking');
    expect(repaired.env?.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('claude-sonnet-4-6');
    expect(repaired.env?.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('claude-sonnet-4-6');
    expect(repaired.presets?.[0]?.default).toBe('claude-sonnet-4-6');
    expect(repaired.presets?.[0]?.opus).toBe('claude-opus-4-6-thinking');
    expect(repaired.presets?.[0]?.sonnet).toBe('claude-sonnet-4-6');
    expect(repaired.presets?.[0]?.haiku).toBe('claude-sonnet-4-6');
  });

  it('preserves codex effort-suffixed IDs during ensureProviderSettings', () => {
    const codexSettingsPath = path.join(tempHome, '.ccs', 'codex.settings.json');
    fs.mkdirSync(path.dirname(codexSettingsPath), { recursive: true });
    fs.writeFileSync(
      codexSettingsPath,
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/codex',
            ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
            ANTHROPIC_MODEL: ' gpt-5.3-codex-xhigh ',
            ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-5.3-codex-xhigh',
            ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-5.3-codex-high',
            ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gpt-5.4-mini-medium',
          },
          presets: [
            {
              name: 'legacy',
              default: 'gpt-5.3-codex-xhigh',
              opus: 'gpt-5.3-codex-xhigh',
              sonnet: 'gpt-5.3-codex-high',
              haiku: 'gpt-5.4-mini-medium',
            },
          ],
        },
        null,
        2
      )
    );

    ensureProviderSettings('codex');

    const repaired = JSON.parse(fs.readFileSync(codexSettingsPath, 'utf-8')) as {
      env?: Record<string, string>;
      presets?: Array<Record<string, string>>;
    };
    expect(repaired.env?.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:8317');
    expect(repaired.env?.ANTHROPIC_MODEL).toBe('gpt-5.3-codex-xhigh');
    expect(repaired.env?.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('gpt-5.3-codex-xhigh');
    expect(repaired.env?.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('gpt-5.3-codex-high');
    expect(repaired.env?.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('gpt-5.4-mini-medium');
    expect(repaired.presets?.[0]?.default).toBe('gpt-5.3-codex-xhigh');
    expect(repaired.presets?.[0]?.opus).toBe('gpt-5.3-codex-xhigh');
    expect(repaired.presets?.[0]?.sonnet).toBe('gpt-5.3-codex-high');
    expect(repaired.presets?.[0]?.haiku).toBe('gpt-5.4-mini-medium');
  });

  it('recovers malformed provider settings files by writing defaults and backup copy', () => {
    const agySettingsPath = path.join(tempHome, '.ccs', 'agy.settings.json');
    fs.mkdirSync(path.dirname(agySettingsPath), { recursive: true });
    fs.writeFileSync(agySettingsPath, '{"env": {"ANTHROPIC_MODEL": "claude-sonnet-4-6-thinking",}');

    ensureProviderSettings('agy');

    const repaired = JSON.parse(fs.readFileSync(agySettingsPath, 'utf-8')) as {
      env?: Record<string, string>;
    };
    expect(repaired.env?.ANTHROPIC_MODEL).toBeDefined();

    const backups = fs
      .readdirSync(path.dirname(agySettingsPath))
      .filter((file) => file.startsWith('agy.settings.json.corrupt-'));
    expect(backups.length).toBe(1);
  });
});
