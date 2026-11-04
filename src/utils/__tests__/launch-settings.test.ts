import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  buildUnifiedLaunchSettings,
  createUnifiedLaunchSettings,
  LAUNCH_ROUTING_ENV_KEYS,
} from '../launch-settings';
import { createOpenAICompatLaunchSettings } from '../openai-compat-launch-settings';
import { runWithScopedCcsHome } from '../config-manager';
import type { Settings } from '../../types/config';

let tmpDir: string;
let settingsPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-unified-launch-settings-test-'));
  settingsPath = path.join(tmpDir, 'test.settings.json');
});

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

function writeSettings(content: unknown): void {
  fs.writeFileSync(settingsPath, JSON.stringify(content, null, 2), 'utf8');
}

describe('buildUnifiedLaunchSettings', () => {
  it('overlays routing env keys while preserving other fields', () => {
    const initial: Settings = {
      permissions: { allow: ['run'] },
      env: {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/codex',
        CUSTOM_VAR: 'keep-me',
      },
    };

    const { settings, changed } = buildUnifiedLaunchSettings(initial, {
      overlayEnv: {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:50118/api/provider/codex',
      },
    });

    expect(changed).toBe(true);
    expect(settings.permissions).toEqual({ allow: ['run'] });
    expect(settings.env?.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:50118/api/provider/codex');
    expect(settings.env?.CUSTOM_VAR).toBe('keep-me');
  });

  it('guarantees forced-absent stripKeys are removed even if present in initial settings', () => {
    const initial: Settings = {
      env: {
        ANTHROPIC_API_KEY: 'sk-ant-persisted-secret',
        CUSTOM_VAR: 'keep-me',
      },
    };

    const { settings, changed } = buildUnifiedLaunchSettings(initial, {
      stripKeys: ['ANTHROPIC_API_KEY'],
    });

    expect(changed).toBe(true);
    expect(settings.env?.ANTHROPIC_API_KEY).toBeUndefined();
    expect(settings.env?.CUSTOM_VAR).toBe('keep-me');
  });
  it('strips all Anthropic routing keys when stripAnthropicRouting is true', () => {
    const initial: Settings = {
      env: {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317',
        ANTHROPIC_AUTH_TOKEN: 'token-val',
        CUSTOM_APP_ENV: 'present',
      },
    };

    const { settings, changed } = buildUnifiedLaunchSettings(initial, {
      stripAnthropicRouting: true,
    });

    expect(changed).toBe(true);
    expect(settings.env?.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(settings.env?.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(settings.env?.CUSTOM_APP_ENV).toBe('present');
  });
});

describe('createUnifiedLaunchSettings', () => {
  it('writes ephemeral 0o600 file in 0o700 directory and cleans up on demand', () => {
    writeSettings({ env: { ANTHROPIC_BASE_URL: 'http://old' } });

    const result = createUnifiedLaunchSettings(settingsPath, undefined, {
      overlayEnv: { ANTHROPIC_BASE_URL: 'http://new' },
    });

    expect(result.changed).toBe(true);
    expect(result.settingsPath).not.toBe(settingsPath);
    expect(fs.existsSync(result.settingsPath)).toBe(true);

    // Verify directory permissions
    const dirStat = fs.statSync(path.dirname(result.settingsPath));
    expect(dirStat.mode & 0o777).toBe(0o700);

    // Verify file permissions
    const fileStat = fs.statSync(result.settingsPath);
    expect(fileStat.mode & 0o777).toBe(0o600);

    // Run cleanup
    result.cleanup();
    expect(fs.existsSync(result.settingsPath)).toBe(false);
  });

  it('supports durable mode in scoped ~/.ccs/cache/isolated-settings/ without unlinking on cleanup', async () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-durable-home-'));
    try {
      await runWithScopedCcsHome(fakeHome, async () => {
        writeSettings({ env: { ANTHROPIC_API_KEY: 'secret' } });

        const result = createUnifiedLaunchSettings(settingsPath, undefined, {
          stripKeys: ['ANTHROPIC_API_KEY'],
          durable: true,
        });

        expect(result.settingsPath).toContain(
          path.join(fakeHome, '.ccs', 'cache', 'isolated-settings')
        );
        expect(fs.existsSync(result.settingsPath)).toBe(true);

        const content = JSON.parse(fs.readFileSync(result.settingsPath, 'utf8'));
        expect(content.env?.ANTHROPIC_API_KEY).toBeUndefined();

        // Cleanup in durable mode is a no-op to allow daemon respawns
        result.cleanup();
        expect(fs.existsSync(result.settingsPath)).toBe(true);
      });
    } finally {
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });
});

describe('createOpenAICompatLaunchSettings regression parity', () => {
  it('strips ANTHROPIC_API_KEY and routing env to prevent proxy auth bypass', () => {
    const settings: Settings = {
      env: {
        ANTHROPIC_API_KEY: 'sk-ant-test-key-should-be-stripped',
        ANTHROPIC_BASE_URL: 'http://should-be-stripped',
        USER_DEFINED: 'user-val',
      },
    };

    const res = createOpenAICompatLaunchSettings(settingsPath, settings);
    try {
      const written = JSON.parse(fs.readFileSync(res.settingsPath, 'utf8'));
      expect(written.env?.ANTHROPIC_API_KEY).toBeUndefined();
      expect(written.env?.ANTHROPIC_BASE_URL).toBeUndefined();
      expect(written.env?.USER_DEFINED).toBe('user-val');
    } finally {
      res.cleanup();
    }
  });
});
