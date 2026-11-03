import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createOpenAICompatLaunchSettings } from '../../../src/utils/openai-compat-launch-settings';
import type { Settings } from '../../../src/types/config';

describe('createOpenAICompatLaunchSettings', () => {
  let tempRoot: string;
  let ccsDir: string;
  let originalCcsDir: string | undefined;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-isolated-settings-test-'));
    ccsDir = path.join(tempRoot, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    originalCcsDir = process.env.CCS_DIR;
    process.env.CCS_DIR = ccsDir;
  });

  afterEach(() => {
    if (originalCcsDir !== undefined) {
      process.env.CCS_DIR = originalCcsDir;
    } else {
      delete process.env.CCS_DIR;
    }

    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  describe('durable mode ({ durable: true })', () => {
    it('snapshots settings into a durable, path-keyed location under ~/.ccs/cache/isolated-settings (issue #1734)', () => {
      const originalSettingsPath = path.join(tempRoot, 'codex.settings.json');
      const settings: Settings = {
        env: {
          ANTHROPIC_API_KEY: 'secret-key-to-strip',
          ANTHROPIC_BASE_URL: 'https://proxy.example.com',
          CUSTOM_VAR: 'preserved-value',
        },
      };

      const result = createOpenAICompatLaunchSettings(originalSettingsPath, settings, {
        durable: true,
      });

      expect(fs.existsSync(result.settingsPath)).toBe(true);
      expect(result.settingsPath).toContain(path.join(ccsDir, 'cache', 'isolated-settings'));
      expect(path.basename(result.settingsPath)).toBe('codex.settings.json');

      // Verify content: Anthropic routing keys are stripped, custom vars preserved
      const written = JSON.parse(fs.readFileSync(result.settingsPath, 'utf8')) as Settings;
      expect(written.env?.ANTHROPIC_API_KEY).toBeUndefined();
      expect(written.env?.ANTHROPIC_BASE_URL).toBeUndefined();
      expect(written.env?.CUSTOM_VAR).toBe('preserved-value');

      // Verify durability: calling cleanup() does NOT delete the durable snapshot
      // so background fleet daemon respawns can continue to read it (issue #1734).
      result.cleanup();
      expect(fs.existsSync(result.settingsPath)).toBe(true);
    });

    it('atomically replaces the single snapshot when settings change without creating multiple directories', () => {
      const settingsPath = path.join(tempRoot, 'glm.settings.json');
      const settings1: Settings = {
        env: {
          USER_ROLE: 'admin',
        },
      };
      const settings2: Settings = {
        env: {
          USER_ROLE: 'superadmin',
        },
      };

      const first = createOpenAICompatLaunchSettings(settingsPath, settings1, { durable: true });
      const second = createOpenAICompatLaunchSettings(settingsPath, settings2, { durable: true });

      // Path is strictly identical because it is keyed on the canonical settings path
      expect(first.settingsPath).toBe(second.settingsPath);

      // Verify content was updated to the latest revision
      const updated = JSON.parse(fs.readFileSync(second.settingsPath, 'utf8')) as Settings;
      expect(updated.env?.USER_ROLE).toBe('superadmin');
    });

    it('fails clearly when durable snapshot cannot be written instead of silently falling back to TMPDIR', () => {
      // Point CCS_DIR to a read-only or invalid file path
      const blockingFile = path.join(tempRoot, 'blocking-file');
      fs.writeFileSync(blockingFile, 'blocks-mkdir', 'utf8');
      process.env.CCS_DIR = path.join(blockingFile, 'invalid-subdir');

      const settingsPath = path.join(tempRoot, 'test.settings.json');
      const settings: Settings = { env: { FOO: 'bar' } };

      expect(() => {
        createOpenAICompatLaunchSettings(settingsPath, settings, { durable: true });
      }).toThrow();
    });
    it('unconditionally hardens directory permissions to 0700 on POSIX even if directory pre-existed with permissive mode', () => {
      if (process.platform === 'win32') return;
      const settingsPath = path.join(tempRoot, 'perm.settings.json');
      const settings: Settings = { env: { FOO: 'bar' } };

      // Pre-create the directory with permissive mode 0777
      const result1 = createOpenAICompatLaunchSettings(settingsPath, settings, { durable: true });
      const dir = path.dirname(result1.settingsPath);
      fs.chmodSync(dir, 0o777);
      expect(fs.statSync(dir).mode & 0o777).toBe(0o777);

      // Calling again must re-harden to 0700
      createOpenAICompatLaunchSettings(settingsPath, settings, { durable: true });
      expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
    });

    it('fails closed and throws if chmodSync fails in durable mode', () => {
      const settingsPath = path.join(tempRoot, 'chmod-fail.settings.json');
      const settings: Settings = { env: { FOO: 'bar' } };

      const spy = spyOn(fs, 'chmodSync').mockImplementation(() => {
        throw new Error('EPERM: chmod failed');
      });

      try {
        expect(() => {
          createOpenAICompatLaunchSettings(settingsPath, settings, { durable: true });
        }).toThrow('EPERM: chmod failed');
      } finally {
        spy.mockRestore();
      }
    });

    it('cleans up temporary file if renameSync throws', () => {
      const settingsPath = path.join(tempRoot, 'fail-rename.settings.json');
      const settings: Settings = { env: { SECRET: 'do-not-leak' } };

      const spy = spyOn(fs, 'renameSync').mockImplementation(() => {
        throw new Error('simulated rename failure');
      });

      try {
        expect(() => {
          createOpenAICompatLaunchSettings(settingsPath, settings, { durable: true });
        }).toThrow('simulated rename failure');
      } finally {
        spy.mockRestore();
      }

      // Check that no .tmp files exist in the cache directory
      const dir = path.join(ccsDir, 'cache', 'isolated-settings');
      if (fs.existsSync(dir)) {
        const subdirs = fs.readdirSync(dir);
        for (const sub of subdirs) {
          const files = fs.readdirSync(path.join(dir, sub));
          const tmpFiles = files.filter((f) => f.endsWith('.tmp'));
          expect(tmpFiles.length).toBe(0);
        }
      }
    });
  });

  describe('ephemeral mode (default / headless)', () => {
    it('creates an ephemeral tempdir in os.tmpdir() and deletes it on cleanup', () => {
      const settingsPath = path.join(tempRoot, 'headless.settings.json');
      const settings: Settings = {
        env: {
          ANTHROPIC_API_KEY: 'key',
          WORKER_ID: '42',
        },
      };

      const result = createOpenAICompatLaunchSettings(settingsPath, settings);

      expect(fs.existsSync(result.settingsPath)).toBe(true);
      expect(result.settingsPath).toMatch(/ccs-(?:openai-compat|launch)-settings-/);

      result.cleanup();
      expect(fs.existsSync(result.settingsPath)).toBe(false);
    });
  });
});
