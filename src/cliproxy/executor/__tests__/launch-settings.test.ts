/**
 * Unit tests for launch-settings.ts
 *
 * Verifies that the runtime settings overlay keeps the resolved proxy-chain
 * `ANTHROPIC_BASE_URL` (and related routing keys) authoritative when Claude is
 * launched with `--settings`, instead of the persisted CLIProxy-direct URL.
 *
 * The overlay is written to an isolated os.tmpdir() directory, so these tests
 * never touch the real ~/.ccs.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildLaunchSettingsOverlay, prepareLaunchSettings } from '../launch-settings';

let tmpDir: string;
let settingsPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-launch-settings-test-'));
  settingsPath = path.join(tmpDir, 'codex.settings.json');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writePersisted(settings: unknown): void {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

describe('buildLaunchSettingsOverlay', () => {
  it('overlays routing env keys from the resolved environment', () => {
    writePersisted({
      env: {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/codex',
        ANTHROPIC_MODEL: 'gpt-5.5',
        ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
      },
    });

    const { settings, changed } = buildLaunchSettingsOverlay(settingsPath, {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:50118/api/provider/codex',
      ANTHROPIC_MODEL: 'gpt-5.5-high',
    } as NodeJS.ProcessEnv);

    expect(changed).toBe(true);
    const env = settings.env as Record<string, string>;
    expect(env.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:50118/api/provider/codex');
    expect(env.ANTHROPIC_MODEL).toBe('gpt-5.5-high');
    // Untouched keys are preserved.
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe('ccs-internal-managed');
  });

  it('preserves non-env settings (permissions, hooks, etc.)', () => {
    writePersisted({
      env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/codex' },
      permissions: { allow: ['Bash'] },
      statusLine: { type: 'command' },
    });

    const { settings } = buildLaunchSettingsOverlay(settingsPath, {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:60000/api/provider/codex',
    } as NodeJS.ProcessEnv);

    expect(settings.permissions).toEqual({ allow: ['Bash'] });
    expect(settings.statusLine).toEqual({ type: 'command' });
  });

  it('reports changed=false when resolved env matches persisted values', () => {
    writePersisted({
      env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/codex' },
    });

    const { changed } = buildLaunchSettingsOverlay(settingsPath, {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/codex',
    } as NodeJS.ProcessEnv);

    expect(changed).toBe(false);
  });

  it('falls back to an env-only overlay when the settings file is missing', () => {
    const { settings, changed } = buildLaunchSettingsOverlay(settingsPath, {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:50118/api/provider/codex',
    } as NodeJS.ProcessEnv);

    expect(changed).toBe(true);
    expect((settings.env as Record<string, string>).ANTHROPIC_BASE_URL).toBe(
      'http://127.0.0.1:50118/api/provider/codex'
    );
  });

  it('falls back to an env-only overlay when the settings file is corrupt', () => {
    fs.writeFileSync(settingsPath, '{ not valid json');
    const { settings, changed } = buildLaunchSettingsOverlay(settingsPath, {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:50118/api/provider/codex',
    } as NodeJS.ProcessEnv);
    expect(changed).toBe(true);
    expect((settings.env as Record<string, string>).ANTHROPIC_BASE_URL).toBe(
      'http://127.0.0.1:50118/api/provider/codex'
    );
  });
});

describe('prepareLaunchSettings', () => {
  it('writes a runtime overlay file and cleans it up when routing changes', () => {
    writePersisted({
      env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/codex' },
    });

    const result = prepareLaunchSettings(settingsPath, {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:50118/api/provider/codex',
    } as NodeJS.ProcessEnv);

    expect(result.settingsPath).not.toBe(settingsPath);
    expect(fs.existsSync(result.settingsPath)).toBe(true);

    const written = JSON.parse(fs.readFileSync(result.settingsPath, 'utf8'));
    expect(written.env.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:50118/api/provider/codex');

    result.cleanup();
    expect(fs.existsSync(result.settingsPath)).toBe(false);
  });

  it('returns the original path and a no-op cleanup when nothing changes', () => {
    writePersisted({
      env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/codex' },
    });

    const result = prepareLaunchSettings(settingsPath, {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/codex',
    } as NodeJS.ProcessEnv);

    expect(result.settingsPath).toBe(settingsPath);
    // Cleanup must not remove the persisted settings file.
    result.cleanup();
    expect(fs.existsSync(settingsPath)).toBe(true);
  });

  it('writes the overlay with 0600 file mode inside a 0700 dir (POSIX)', () => {
    if (process.platform === 'win32') return; // chmod modes are not enforced on Windows
    writePersisted({
      env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/codex' },
    });
    const result = prepareLaunchSettings(settingsPath, {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:50118/api/provider/codex',
    } as NodeJS.ProcessEnv);
    try {
      expect(fs.statSync(result.settingsPath).mode & 0o777).toBe(0o600);
      expect(fs.statSync(path.dirname(result.settingsPath)).mode & 0o777).toBe(0o700);
    } finally {
      result.cleanup();
    }
  });
});
