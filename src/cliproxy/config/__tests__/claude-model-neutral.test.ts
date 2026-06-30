/**
 * Gap 1: claude provider is model-neutral (no ANTHROPIC_MODEL pins in env output).
 * Snapshot test proving:
 *   - getClaudeEnvVars('claude') emits no model env vars
 *   - getClaudeEnvVars('gemini') still emits model env vars (no spillover)
 *   - ensureProviderSettings does not write model pins for claude
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  getClaudeEnvVars,
  ensureProviderSettings,
  getEffectiveEnvVars,
  getRemoteEnvVars,
} from '../env-builder';
import { clearConfigCache } from '../base-config-loader';

const MODEL_KEYS = [
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
] as const;

describe('claude provider model-neutral passthrough (Gap 1)', () => {
  let tempHome: string;
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    originalCcsHome = process.env.CCS_HOME;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-claude-neutral-'));
    process.env.CCS_HOME = tempHome;
    clearConfigCache();
  });

  afterEach(() => {
    process.env.CCS_HOME = originalCcsHome;
    fs.rmSync(tempHome, { recursive: true, force: true });
    clearConfigCache();
  });

  it('emits no model env vars for the claude provider', () => {
    const env = getClaudeEnvVars('claude');

    for (const key of MODEL_KEYS) {
      expect(env[key]).toBeUndefined();
    }
  });

  it('sets root ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN for claude', () => {
    const env = getClaudeEnvVars('claude');

    expect(env.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:8317');
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeDefined();
  });

  it('still emits model env vars for gemini provider (no spillover)', () => {
    const env = getClaudeEnvVars('gemini');

    for (const key of MODEL_KEYS) {
      expect(typeof env[key]).toBe('string');
      expect((env[key] as string).length).toBeGreaterThan(0);
    }
  });

  it('ensureProviderSettings does not write model pins for claude', () => {
    process.env.CCS_HOME = tempHome;
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    ensureProviderSettings('claude');

    // Non-cursor providers use the legacy top-level path: ~/.ccs/claude.settings.json
    const settingsPath = path.join(ccsDir, 'claude.settings.json');
    expect(fs.existsSync(settingsPath)).toBe(true);

    const written = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
      env: Record<string, string | undefined>;
    };

    for (const key of MODEL_KEYS) {
      // Model keys must not be present (or must be undefined/empty)
      const value = written.env[key];
      expect(!value || value.trim().length === 0).toBe(true);
    }

    // Transport keys must be present
    expect(written.env.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:8317');
    expect(written.env.ANTHROPIC_AUTH_TOKEN).toBeDefined();
  });

  it('normalizes stale claude provider-scoped base URL to CLIProxy root at read level', () => {
    process.env.CCS_HOME = tempHome;
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    const settingsPath = path.join(ccsDir, 'claude.settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/claude',
          ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
        },
      }),
      'utf-8'
    );

    const env = getEffectiveEnvVars('claude', 8317, settingsPath);

    expect(env.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:8317');
  });

  it('repairs stale claude provider-scoped base URL in stored default settings', () => {
    process.env.CCS_HOME = tempHome;
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    const settingsPath = path.join(ccsDir, 'claude.settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/claude',
          ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
        },
      }),
      'utf-8'
    );

    ensureProviderSettings('claude');

    const repaired = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
      env: Record<string, string | undefined>;
    };
    expect(repaired.env.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:8317');
  });

  // ── Upgrade-path: existing claude.settings.json with stale default model pins ──

  it('strips stale default model pins from existing claude.settings.json on ensureProviderSettings', () => {
    process.env.CCS_HOME = tempHome;
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    // Simulate a user who ran `ccs claude` before the model-neutral change.
    // These are the exact default values that were auto-written by older CCS.
    const stalePins = {
      ANTHROPIC_MODEL: 'claude-sonnet-4-6',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-7',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
    };
    const settingsPath = path.join(ccsDir, 'claude.settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317',
          ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
          ...stalePins,
        },
      }),
      'utf-8'
    );

    ensureProviderSettings('claude');

    const repaired = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
      env: Record<string, string | undefined>;
    };

    // All stale pins must be removed
    for (const key of MODEL_KEYS) {
      const value = repaired.env[key];
      expect(!value || value.trim().length === 0).toBe(true);
    }

    // Transport keys must still be present
    expect(repaired.env.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:8317');
    expect(repaired.env.ANTHROPIC_AUTH_TOKEN).toBeDefined();
  });

  it('preserves user-customised model pin that differs from the stale default', () => {
    process.env.CCS_HOME = tempHome;
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    const settingsPath = path.join(ccsDir, 'claude.settings.json');
    // User has customised ANTHROPIC_MODEL to a non-default value
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317',
          ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
          ANTHROPIC_MODEL: 'claude-opus-4-7', // customised — not the stale sonnet default
        },
      }),
      'utf-8'
    );

    ensureProviderSettings('claude');

    const result = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
      env: Record<string, string | undefined>;
    };

    // Custom value must be preserved
    expect(result.env.ANTHROPIC_MODEL).toBe('claude-opus-4-7');
  });

  // ── One-shot migration guard (launch N+1) ─────────────────────────────────────

  it('stale-pin migration runs at most once (marker prevents re-strip on launch N+1)', () => {
    process.env.CCS_HOME = tempHome;
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    // Pre-place the migration marker so migration is considered done.
    const markerDir = path.join(ccsDir, 'cliproxy');
    fs.mkdirSync(markerDir, { recursive: true });
    fs.writeFileSync(path.join(markerDir, '.claude-model-migrated'), new Date().toISOString());

    // Write a settings file that contains stale default pins.
    const stalePins = {
      ANTHROPIC_MODEL: 'claude-sonnet-4-6',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-7',
    };
    const settingsPath = path.join(ccsDir, 'claude.settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317',
          ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
          ...stalePins,
        },
      }),
      'utf-8'
    );

    ensureProviderSettings('claude');

    const result = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
      env: Record<string, string | undefined>;
    };

    // Migration already marked done — stale pins must NOT be stripped again.
    // This proves a user re-pin that equals a stale default value survives on launch N+1.
    expect(result.env.ANTHROPIC_MODEL).toBe('claude-sonnet-4-6');
    expect(result.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('claude-opus-4-7');
  });

  it('settings file without ANTHROPIC_MODEL triggers no rewrite after migration marker set', () => {
    process.env.CCS_HOME = tempHome;
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    // Pre-place the migration marker.
    const markerDir = path.join(ccsDir, 'cliproxy');
    fs.mkdirSync(markerDir, { recursive: true });
    fs.writeFileSync(path.join(markerDir, '.claude-model-migrated'), new Date().toISOString());

    const settingsPath = path.join(ccsDir, 'claude.settings.json');
    const originalContent = JSON.stringify(
      {
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317',
          ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
        },
      },
      null,
      2
    );
    fs.writeFileSync(settingsPath, originalContent + '\n', 'utf-8');
    const statBefore = fs.statSync(settingsPath);

    ensureProviderSettings('claude');

    const statAfter = fs.statSync(settingsPath);
    // mtime should not change — no rewrite triggered
    expect(statAfter.mtimeMs).toBe(statBefore.mtimeMs);

    const result = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
      env: Record<string, string | undefined>;
    };
    // ANTHROPIC_MODEL must still be absent
    expect(result.env.ANTHROPIC_MODEL).toBeUndefined();
  });

  // ── Historical-default set coverage ──────────────────────────────────────────

  it('strips gen-2 pins (sonnet-4-5-20250929 / opus-4-5-20251101) on migration', () => {
    process.env.CCS_HOME = tempHome;
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    const settingsPath = path.join(ccsDir, 'claude.settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317',
          ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
          ANTHROPIC_MODEL: 'claude-sonnet-4-5-20250929',
          ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-5-20251101',
          ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-5-20250929',
          ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
        },
      }),
      'utf-8'
    );

    ensureProviderSettings('claude');

    const result = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
      env: Record<string, string | undefined>;
    };

    for (const key of MODEL_KEYS) {
      const value = result.env[key];
      expect(!value || value.trim().length === 0).toBe(true);
    }
  });

  it('strips gen-3 mixed pin (opus-4-6) on migration', () => {
    process.env.CCS_HOME = tempHome;
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    const settingsPath = path.join(ccsDir, 'claude.settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317',
          ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
          ANTHROPIC_MODEL: 'claude-sonnet-4-6',
          ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6',
          ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6',
          ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-3-5-20241022',
        },
      }),
      'utf-8'
    );

    ensureProviderSettings('claude');

    const result = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
      env: Record<string, string | undefined>;
    };

    for (const key of MODEL_KEYS) {
      const value = result.env[key];
      expect(!value || value.trim().length === 0).toBe(true);
    }
  });

  it('preserves an explicit user pin to a value not in any stale-defaults set (e.g. claude-opus-4-8)', () => {
    process.env.CCS_HOME = tempHome;
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    const settingsPath = path.join(ccsDir, 'claude.settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317',
          ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
          ANTHROPIC_MODEL: 'claude-opus-4-8',
        },
      }),
      'utf-8'
    );

    ensureProviderSettings('claude');

    const result = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
      env: Record<string, string | undefined>;
    };

    // claude-opus-4-8 is not in any stale-defaults set; must survive migration
    expect(result.env.ANTHROPIC_MODEL).toBe('claude-opus-4-8');
  });

  // ── Fresh-file migration marker and tier-pin survival ─────────────────────────

  it('marks migration done on fresh-file creation so tier pins written by ccs claude --config survive', () => {
    process.env.CCS_HOME = tempHome;
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    const settingsPath = path.join(ccsDir, 'claude.settings.json');
    const markerPath = path.join(ccsDir, 'cliproxy', '.claude-model-migrated');

    // Step 1: fresh ensureProviderSettings creates the file and the marker.
    expect(fs.existsSync(settingsPath)).toBe(false);
    ensureProviderSettings('claude');
    expect(fs.existsSync(settingsPath)).toBe(true);
    expect(fs.existsSync(markerPath)).toBe(true);

    // Step 2: simulate 'ccs claude --config' pinning all four tier models.
    const tierPins = {
      ANTHROPIC_MODEL: 'claude-sonnet-4-6',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-sonnet-4-6',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-sonnet-4-6',
    };
    const existing = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
      env: Record<string, string>;
    };
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({ ...existing, env: { ...existing.env, ...tierPins } }, null, 2) + '\n',
      'utf-8'
    );

    // Step 3: second ensureProviderSettings must NOT strip the user-written pins
    // because the migration marker already exists.
    ensureProviderSettings('claude');

    const result = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
      env: Record<string, string | undefined>;
    };
    expect(result.env.ANTHROPIC_MODEL).toBe('claude-sonnet-4-6');
    expect(result.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('claude-sonnet-4-6');
    expect(result.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('claude-sonnet-4-6');
    expect(result.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('claude-sonnet-4-6');
  });

  // ── Upgrader --config ordering: migrate-first, then re-pin survives ───────────
  // Models the `ccs claude --config` flow on an UPGRADER: the executor runs
  // ensureProviderSettings BEFORE configureProviderModel writes the user's pick.
  // Step 1 (ensureProviderSettings) strips the old auto-pins and sets the marker;
  // Step 2 (the user's --config write) lands a fresh pin; Step 3 (next plain
  // launch) must NOT strip it because the marker is already set.
  it('upgrader --config: ensureProviderSettings runs first, so a re-pin equal to a stale default survives the next launch', () => {
    process.env.CCS_HOME = tempHome;
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    const settingsPath = path.join(ccsDir, 'claude.settings.json');
    const markerPath = path.join(ccsDir, 'cliproxy', '.claude-model-migrated');

    // Pre-existing upgrader file with OLD auto-written default pins, no marker.
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317',
          ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
          ANTHROPIC_MODEL: 'claude-sonnet-4-5-20250929',
          ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-5-20251101',
          ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-5-20250929',
          ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
        },
      }),
      'utf-8'
    );
    expect(fs.existsSync(markerPath)).toBe(false);

    // Step 1: executor runs ensureProviderSettings BEFORE the --config write.
    // This strips the old auto-pins and sets the migration marker.
    ensureProviderSettings('claude');
    expect(fs.existsSync(markerPath)).toBe(true);
    const afterMigrate = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
      env: Record<string, string | undefined>;
    };
    for (const key of MODEL_KEYS) {
      const value = afterMigrate.env[key];
      expect(!value || value.trim().length === 0).toBe(true);
    }

    // Step 2: configureProviderModel writes the user's deliberate pick — and the
    // pick happens to equal a current catalog default that is in the stale set.
    const userPin = {
      ANTHROPIC_MODEL: 'claude-sonnet-4-6',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-sonnet-4-6',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-sonnet-4-6',
    };
    const current = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
      env: Record<string, string>;
    };
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({ ...current, env: { ...current.env, ...userPin } }, null, 2) + '\n',
      'utf-8'
    );

    // Step 3: next plain `ccs claude` launch must NOT strip the just-written pin
    // because the marker was already set in Step 1.
    ensureProviderSettings('claude');
    const result = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
      env: Record<string, string | undefined>;
    };
    expect(result.env.ANTHROPIC_MODEL).toBe('claude-sonnet-4-6');
    expect(result.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('claude-sonnet-4-6');
    expect(result.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('claude-sonnet-4-6');
    expect(result.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('claude-sonnet-4-6');
  });

  // ── Remote read path: stale-pin filter without file mutation ──────────────────

  it('getRemoteEnvVars (claude): drops stale default model pins from the settings file at read level', () => {
    process.env.CCS_HOME = tempHome;
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    const settingsPath = path.join(ccsDir, 'claude.settings.json');
    const originalContent =
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317',
          ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
          ANTHROPIC_MODEL: 'claude-sonnet-4-6',
          ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-7',
          ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6',
          ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
        },
      }) + '\n';
    fs.writeFileSync(settingsPath, originalContent, 'utf-8');

    const env = getRemoteEnvVars('claude', {
      host: 'example.com',
      port: 8317,
      protocol: 'http',
    });

    // Stale defaults must NOT leak into the remote env.
    for (const key of MODEL_KEYS) {
      expect(env[key]).toBeUndefined();
    }
    // Transport keys are always set from the remote config.
    expect(env.ANTHROPIC_BASE_URL).toContain('example.com');
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeDefined();

    // Read-level only: the settings file on disk is untouched.
    expect(fs.readFileSync(settingsPath, 'utf-8')).toBe(originalContent);
  });

  it('getRemoteEnvVars (claude): preserves a user-custom model pin not in any stale set', () => {
    process.env.CCS_HOME = tempHome;
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    const settingsPath = path.join(ccsDir, 'claude.settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317',
          ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
          ANTHROPIC_MODEL: 'claude-opus-4-8', // custom — not a historical default
        },
      }),
      'utf-8'
    );

    const env = getRemoteEnvVars('claude', {
      host: 'example.com',
      port: 8317,
      protocol: 'http',
    });

    // Custom pin survives the remote read path.
    expect(env.ANTHROPIC_MODEL).toBe('claude-opus-4-8');
  });

  it('getRemoteEnvVars (claude): Priority 1 explicit custom settings path is NOT stale-filtered', () => {
    process.env.CCS_HOME = tempHome;
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    // An explicitly passed settings file is the user's deliberate choice and
    // must be honored verbatim — even when it carries a value equal to a
    // historical default.
    const customPath = path.join(ccsDir, 'custom-claude.settings.json');
    fs.writeFileSync(
      customPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317',
          ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
          ANTHROPIC_MODEL: 'claude-sonnet-4-6', // equals a stale default, but explicit
        },
      }),
      'utf-8'
    );

    const env = getRemoteEnvVars(
      'claude',
      { host: 'example.com', port: 8317, protocol: 'http' },
      customPath
    );

    // Priority 1 untouched: the explicit pin survives.
    expect(env.ANTHROPIC_MODEL).toBe('claude-sonnet-4-6');
  });

  it('getRemoteEnvVars (claude): migration marker set means pins are user-intentional and NOT filtered', () => {
    process.env.CCS_HOME = tempHome;
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    // Marker present: the file was already cleaned once, so any pin that
    // exists now was put there deliberately (e.g. ccs claude --config picked
    // a value that happens to equal a historical default).
    const markerDir = path.join(ccsDir, 'cliproxy');
    fs.mkdirSync(markerDir, { recursive: true });
    fs.writeFileSync(path.join(markerDir, '.claude-model-migrated'), new Date().toISOString());

    const settingsPath = path.join(ccsDir, 'claude.settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317',
          ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
          ANTHROPIC_MODEL: 'claude-sonnet-4-6', // equals a stale default, but post-migration = explicit
        },
      }),
      'utf-8'
    );

    const env = getRemoteEnvVars('claude', {
      host: 'example.com',
      port: 8317,
      protocol: 'http',
    });

    expect(env.ANTHROPIC_MODEL).toBe('claude-sonnet-4-6');
  });
});
