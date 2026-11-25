/**
 * Cursor Settings Routes Tests
 * Tests for Cursor configuration API endpoints.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Setup test environment BEFORE any imports
const TEST_CCS_DIR = path.join(os.tmpdir(), `ccs-test-cursor-settings-${Date.now()}`);
process.env.CCS_HOME = TEST_CCS_DIR;

// Import after setting env var
import type { CursorConfig } from '../../../src/config/unified-config-types';
import {
  loadOrCreateUnifiedConfig,
  saveUnifiedConfig,
} from '../../../src/config/unified-config-loader';
import { getCcsDir } from '../../../src/utils/config-manager';

describe('Cursor Settings Routes Logic', () => {
  beforeEach(() => {
    // Ensure test directory exists
    const ccsDir = getCcsDir();
    if (!fs.existsSync(ccsDir)) {
      fs.mkdirSync(ccsDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_CCS_DIR)) {
      fs.rmSync(TEST_CCS_DIR, { recursive: true, force: true });
    }
  });

  describe('PUT /settings validation logic', () => {
    it('validates null body', () => {
      const updates = null;
      const isValid = !!(updates && typeof updates === 'object' && !Array.isArray(updates));
      expect(isValid).toBe(false);
    });

    it('validates non-object body', () => {
      const updates = 'string';
      const isValid = !!(updates && typeof updates === 'object' && !Array.isArray(updates));
      expect(isValid).toBe(false);
    });

    it('validates array body', () => {
      const updates = [1, 2, 3];
      const isValid = !!(updates && typeof updates === 'object' && !Array.isArray(updates));
      expect(isValid).toBe(false);
    });

    it('validates valid object', () => {
      const updates: Partial<CursorConfig> = { port: 4000 };
      const isValid = !!(updates && typeof updates === 'object' && !Array.isArray(updates));
      expect(isValid).toBe(true);
    });

    it('validates integer port', () => {
      const port = 4000;
      const isInteger = typeof port === 'number' && Number.isInteger(port);
      expect(isInteger).toBe(true);
    });

    it('rejects non-integer port', () => {
      const port = 3.14;
      const isInteger = typeof port === 'number' && Number.isInteger(port);
      expect(isInteger).toBe(false);
    });

    it('validates port range (valid)', () => {
      const port = 3000;
      const inRange = port >= 1 && port <= 65535;
      expect(inRange).toBe(true);
    });

    it('validates port range (below)', () => {
      const port = 0;
      const inRange = port >= 1 && port <= 65535;
      expect(inRange).toBe(false);
    });

    it('validates port range (above)', () => {
      const port = 65536;
      const inRange = port >= 1 && port <= 65535;
      expect(inRange).toBe(false);
    });

    it('validates boolean auto_start', () => {
      const auto_start = true;
      const isBoolean = typeof auto_start === 'boolean';
      expect(isBoolean).toBe(true);
    });

    it('rejects non-boolean auto_start', () => {
      const auto_start = 'yes';
      const isBoolean = typeof auto_start === 'boolean';
      expect(isBoolean).toBe(false);
    });

    it('validates boolean ghost_mode', () => {
      const ghost_mode = false;
      const isBoolean = typeof ghost_mode === 'boolean';
      expect(isBoolean).toBe(true);
    });

    it('rejects non-boolean ghost_mode', () => {
      const ghost_mode = 1;
      const isBoolean = typeof ghost_mode === 'boolean';
      expect(isBoolean).toBe(false);
    });
  });

  describe('PUT /settings whitelist merge pattern', () => {
    it('merges known fields only (ignores unknown)', () => {
      const config = loadOrCreateUnifiedConfig();
      const updates: Partial<CursorConfig> & Record<string, unknown> = {
        port: 5000,
        malicious_key: 'should be ignored',
        another_unknown: true,
      };

      // Simulate the whitelist merge from the route
      const cursorConfig: CursorConfig = {
        enabled: updates.enabled ?? config.cursor?.enabled ?? false,
        port: updates.port ?? config.cursor?.port ?? 3000,
        auto_start: updates.auto_start ?? config.cursor?.auto_start ?? false,
        ghost_mode: updates.ghost_mode ?? config.cursor?.ghost_mode ?? false,
        model: updates.model ?? config.cursor?.model ?? 'gpt-5.3-codex',
        opus_model:
          updates.opus_model !== undefined ? updates.opus_model : config.cursor?.opus_model,
        sonnet_model:
          updates.sonnet_model !== undefined ? updates.sonnet_model : config.cursor?.sonnet_model,
        haiku_model:
          updates.haiku_model !== undefined ? updates.haiku_model : config.cursor?.haiku_model,
      };

      expect(cursorConfig.port).toBe(5000);
      expect(cursorConfig).not.toHaveProperty('malicious_key');
      expect(cursorConfig).not.toHaveProperty('another_unknown');
    });

    it('updates port only', () => {
      const config = loadOrCreateUnifiedConfig();
      config.cursor = {
        enabled: false,
        port: 3000,
        auto_start: false,
        ghost_mode: false,
        model: 'gpt-5.3-codex',
      };
      saveUnifiedConfig(config);

      const updates: Partial<CursorConfig> = { port: 4000 };
      const cursorConfig: CursorConfig = {
        enabled: updates.enabled ?? config.cursor?.enabled ?? false,
        port: updates.port ?? config.cursor?.port ?? 3000,
        auto_start: updates.auto_start ?? config.cursor?.auto_start ?? false,
        ghost_mode: updates.ghost_mode ?? config.cursor?.ghost_mode ?? false,
        model: updates.model ?? config.cursor?.model ?? 'gpt-5.3-codex',
        opus_model:
          updates.opus_model !== undefined ? updates.opus_model : config.cursor?.opus_model,
        sonnet_model:
          updates.sonnet_model !== undefined ? updates.sonnet_model : config.cursor?.sonnet_model,
        haiku_model:
          updates.haiku_model !== undefined ? updates.haiku_model : config.cursor?.haiku_model,
      };

      expect(cursorConfig.port).toBe(4000);
      expect(cursorConfig.auto_start).toBe(false);
      expect(cursorConfig.ghost_mode).toBe(false);
    });

    it('updates auto_start only', () => {
      const config = loadOrCreateUnifiedConfig();
      config.cursor = {
        enabled: false,
        port: 3000,
        auto_start: false,
        ghost_mode: false,
        model: 'gpt-5.3-codex',
      };
      saveUnifiedConfig(config);

      const updates: Partial<CursorConfig> = { auto_start: true };
      const cursorConfig: CursorConfig = {
        enabled: updates.enabled ?? config.cursor?.enabled ?? false,
        port: updates.port ?? config.cursor?.port ?? 3000,
        auto_start: updates.auto_start ?? config.cursor?.auto_start ?? false,
        ghost_mode: updates.ghost_mode ?? config.cursor?.ghost_mode ?? false,
        model: updates.model ?? config.cursor?.model ?? 'gpt-5.3-codex',
        opus_model:
          updates.opus_model !== undefined ? updates.opus_model : config.cursor?.opus_model,
        sonnet_model:
          updates.sonnet_model !== undefined ? updates.sonnet_model : config.cursor?.sonnet_model,
        haiku_model:
          updates.haiku_model !== undefined ? updates.haiku_model : config.cursor?.haiku_model,
      };

      expect(cursorConfig.port).toBe(3000);
      expect(cursorConfig.auto_start).toBe(true);
      expect(cursorConfig.ghost_mode).toBe(false);
    });

    it('updates ghost_mode only', () => {
      const config = loadOrCreateUnifiedConfig();
      config.cursor = {
        enabled: false,
        port: 3000,
        auto_start: false,
        ghost_mode: false,
        model: 'gpt-5.3-codex',
      };
      saveUnifiedConfig(config);

      const updates: Partial<CursorConfig> = { ghost_mode: true };
      const cursorConfig: CursorConfig = {
        enabled: updates.enabled ?? config.cursor?.enabled ?? false,
        port: updates.port ?? config.cursor?.port ?? 3000,
        auto_start: updates.auto_start ?? config.cursor?.auto_start ?? false,
        ghost_mode: updates.ghost_mode ?? config.cursor?.ghost_mode ?? false,
        model: updates.model ?? config.cursor?.model ?? 'gpt-5.3-codex',
        opus_model:
          updates.opus_model !== undefined ? updates.opus_model : config.cursor?.opus_model,
        sonnet_model:
          updates.sonnet_model !== undefined ? updates.sonnet_model : config.cursor?.sonnet_model,
        haiku_model:
          updates.haiku_model !== undefined ? updates.haiku_model : config.cursor?.haiku_model,
      };

      expect(cursorConfig.port).toBe(3000);
      expect(cursorConfig.auto_start).toBe(false);
      expect(cursorConfig.ghost_mode).toBe(true);
    });
  });

  describe('GET /settings/raw logic', () => {
    it('returns defaults when file does not exist', () => {
      const settingsPath = path.join(getCcsDir(), 'cursor.settings.json');
      const exists = fs.existsSync(settingsPath);

      expect(exists).toBe(false);

      const config = loadOrCreateUnifiedConfig();
      const cursorPort = config.cursor?.port ?? 3000;
      const defaultSettings = {
        env: {
          ANTHROPIC_BASE_URL: `http://127.0.0.1:${cursorPort}`,
          ANTHROPIC_AUTH_TOKEN: 'cursor-managed',
          ANTHROPIC_MODEL: 'gpt-5.3-codex',
          ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-5.3-codex',
          ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-5.3-codex',
          ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gpt-5.3-codex',
        },
      };

      expect(defaultSettings.env.ANTHROPIC_BASE_URL).toContain('http://127.0.0.1:');
      expect(defaultSettings.env.ANTHROPIC_AUTH_TOKEN).toBe('cursor-managed');
      expect(defaultSettings.env.ANTHROPIC_MODEL).toBe('gpt-5.3-codex');
    });

    it('reads existing file', () => {
      const settingsPath = path.join(getCcsDir(), 'cursor.settings.json');
      const testSettings = {
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:4000',
          ANTHROPIC_AUTH_TOKEN: 'test-token',
        },
      };

      fs.writeFileSync(settingsPath, JSON.stringify(testSettings, null, 2));
      const exists = fs.existsSync(settingsPath);

      expect(exists).toBe(true);

      const content = fs.readFileSync(settingsPath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed).toEqual(testSettings);
    });
  });

  describe('PUT /settings/raw validation logic', () => {
    it('validates missing settings field', () => {
      const body: { expectedMtime: number; settings?: unknown } = { expectedMtime: Date.now() };
      const isValid = !!(body.settings && typeof body.settings === 'object');
      expect(isValid).toBe(false);
    });

    it('validates non-object settings', () => {
      const body = { settings: 'not an object' };
      const isValid = !!(body.settings && typeof body.settings === 'object');
      expect(isValid).toBe(false);
    });

    it('validates valid settings', () => {
      const body = { settings: { env: { test: 'value' } } };
      const isValid = !!(body.settings && typeof body.settings === 'object');
      expect(isValid).toBe(true);
    });

    it('writes settings file atomically', () => {
      const settingsPath = path.join(getCcsDir(), 'cursor.settings.json');
      const testSettings = {
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:5000',
          ANTHROPIC_AUTH_TOKEN: 'new-token',
        },
      };

      // Simulate atomic write
      const tempPath = settingsPath + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(testSettings, null, 2) + '\n');
      fs.renameSync(tempPath, settingsPath);

      const exists = fs.existsSync(settingsPath);
      expect(exists).toBe(true);

      const written = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(written).toEqual(testSettings);
    });

    it('detects mtime conflict', () => {
      const settingsPath = path.join(getCcsDir(), 'cursor.settings.json');
      const initialSettings = { env: { test: 'initial' } };

      fs.writeFileSync(settingsPath, JSON.stringify(initialSettings));
      const stat = fs.statSync(settingsPath);

      const expectedMtime = stat.mtimeMs - 5000; // 5 seconds in the past
      const hasConflict = Math.abs(stat.mtimeMs - expectedMtime) > 1000;

      expect(hasConflict).toBe(true);
    });

    it('requires expectedMtime when file already exists', () => {
      const settingsPath = path.join(getCcsDir(), 'cursor.settings.json');
      fs.writeFileSync(settingsPath, JSON.stringify({ env: { test: 'existing' } }));

      const expectedMtime = undefined;
      const shouldRequireMtime =
        fs.existsSync(settingsPath) &&
        (typeof expectedMtime !== 'number' || !Number.isFinite(expectedMtime));

      expect(shouldRequireMtime).toBe(true);
    });

    it('does not require expectedMtime when file does not exist', () => {
      const settingsPath = path.join(getCcsDir(), 'cursor.settings.json');
      if (fs.existsSync(settingsPath)) {
        fs.rmSync(settingsPath, { force: true });
      }

      const expectedMtime = undefined;
      const shouldRequireMtime =
        fs.existsSync(settingsPath) &&
        (typeof expectedMtime !== 'number' || !Number.isFinite(expectedMtime));

      expect(shouldRequireMtime).toBe(false);
    });

    it('allows write when mtime matches', () => {
      const settingsPath = path.join(getCcsDir(), 'cursor.settings.json');
      const initialSettings = { env: { test: 'initial' } };

      fs.writeFileSync(settingsPath, JSON.stringify(initialSettings));
      const stat = fs.statSync(settingsPath);

      const expectedMtime = stat.mtimeMs;
      const hasConflict = Math.abs(stat.mtimeMs - expectedMtime) > 1000;

      expect(hasConflict).toBe(false);
    });
  });
});
