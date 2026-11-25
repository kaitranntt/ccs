/**
 * Unit tests for single-variant provider/model update behavior.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { updateVariant, validateProviderBackend } from '../variant-service';
import { loadOrCreateUnifiedConfig } from '../../../config/unified-config-loader';

describe('updateVariant - provider/model consistency', () => {
  let tmpDir: string;
  let originalCcsDir: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-variant-update-test-'));
    originalCcsDir = process.env.CCS_DIR;
    process.env.CCS_DIR = tmpDir;

    const settingsPath = path.join(tmpDir, 'gemini-demo.settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'http://127.0.0.1:8318/api/provider/gemini',
            ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
            ANTHROPIC_MODEL: 'gemini-2.5-pro',
            ANTHROPIC_DEFAULT_OPUS_MODEL: 'gemini-2.5-pro',
            ANTHROPIC_DEFAULT_SONNET_MODEL: 'gemini-2.5-pro',
            ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gemini-2.5-flash',
            CUSTOM_FLAG: 'keep-me',
          },
          hooks: { PreToolUse: [{ matcher: 'WebSearch', hooks: [] }] },
        },
        null,
        2
      ),
      'utf-8'
    );

    fs.writeFileSync(
      path.join(tmpDir, 'config.yaml'),
      `version: 2
accounts: {}
profiles: {}
preferences:
  theme: system
  telemetry: false
  auto_update: true
cliproxy:
  backend: plus
  oauth_accounts: {}
  providers:
    - gemini
    - codex
    - agy
  variants:
    demo:
      provider: gemini
      settings: ${settingsPath}
      port: 8318
`,
      'utf-8'
    );
  });

  afterEach(() => {
    if (originalCcsDir !== undefined) {
      process.env.CCS_DIR = originalCcsDir;
    } else {
      delete process.env.CCS_DIR;
    }

    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function setConfiguredBackend(backend: 'original' | 'plus'): void {
    const configPath = path.join(tmpDir, 'config.yaml');
    const current = fs.readFileSync(configPath, 'utf-8');
    fs.writeFileSync(
      configPath,
      current.replace(/backend: (original|plus)/, `backend: ${backend}`)
    );
  }

  it('rejects provider change without model update', () => {
    const result = updateVariant('demo', { provider: 'codex' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Changing provider requires model update');
  });

  it('rejects denylisted AGY 4.5 model updates', () => {
    const result = updateVariant('demo', {
      provider: 'agy',
      model: 'claude-sonnet-4.5',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('denylist');
  });

  it('reports plus-only providers as requiring the optional plus backend', () => {
    setConfiguredBackend('original');

    const error = validateProviderBackend('ghcp');
    expect(error).toContain('`backend: plus`');
    expect(error).toContain('kaitranntt/CLIProxyAPIPlus');
  });

  it('leaves the settings file unchanged when a plus-only provider update is rejected', () => {
    setConfiguredBackend('original');

    const settingsPath = path.join(tmpDir, 'gemini-demo.settings.json');
    const before = fs.readFileSync(settingsPath, 'utf-8');

    const result = updateVariant('demo', {
      provider: 'ghcp',
      model: 'gpt-5.4-mini',
    });

    expect(result.success).toBe(false);
    expect(fs.readFileSync(settingsPath, 'utf-8')).toBe(before);
  });

  it('updates provider and regenerates provider-specific core env in same settings file', () => {
    const result = updateVariant('demo', {
      provider: 'codex',
      model: 'gpt-5.1-codex-mini',
    });

    expect(result.success).toBe(true);
    expect(result.variant?.provider).toBe('codex');
    expect(result.variant?.model).toBe('gpt-5.4-mini');

    const settingsPath = path.join(tmpDir, 'gemini-demo.settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
      env: Record<string, string>;
      hooks: { PreToolUse: unknown[] };
    };

    expect(settings.env.ANTHROPIC_BASE_URL).toContain('/api/provider/codex');
    expect(settings.env.ANTHROPIC_MODEL).toBe('gpt-5.4-mini');
    expect(settings.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('gpt-5.4-mini');
    expect(settings.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('gpt-5.4-mini');
    expect(settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('gpt-5.4-mini');
    expect(settings.env.CUSTOM_FLAG).toBe('keep-me');
    expect(settings.hooks.PreToolUse.length).toBe(1);

    const config = loadOrCreateUnifiedConfig();
    const demoVariant = config.cliproxy?.variants?.demo as { provider?: string } | undefined;
    expect(demoVariant?.provider).toBe('codex');
  });

  it('preserves codex sonnet alias on model-only updates', () => {
    const toCodex = updateVariant('demo', {
      provider: 'codex',
      model: 'gpt-5.3-codex',
    });
    expect(toCodex.success).toBe(true);

    const settingsPath = path.join(tmpDir, 'gemini-demo.settings.json');
    let settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
      env: Record<string, string>;
    };
    expect(settings.env.ANTHROPIC_MODEL).toBe('gpt-5.3-codex');
    expect(settings.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('gpt-5.3-codex');
    expect(settings.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('gpt-5.3-codex');
    expect(settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('gpt-5.4-mini');

    const modelOnly = updateVariant('demo', { model: 'gpt-5.3-codex' });
    expect(modelOnly.success).toBe(true);

    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
      env: Record<string, string>;
    };
    expect(settings.env.ANTHROPIC_MODEL).toBe('gpt-5.3-codex');
    expect(settings.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('gpt-5.3-codex');
    expect(settings.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('gpt-5.3-codex');
    expect(settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('gpt-5.4-mini');
  });
});
