/**
 * Unit tests for Profile Detector
 */
import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import ProfileDetector, { loadSettingsFromFile } from '../../../src/auth/profile-detector';
import * as unifiedConfigLoader from '../../../src/config/unified-config-loader';

describe('ProfileDetector', () => {
  const tempDir = path.join(os.tmpdir(), `ccs-test-profile-detector-${process.pid}`);

  beforeEach(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('loadSettingsFromFile', () => {
    it('should load settings from a valid JSON file', () => {
      const settingsPath = path.join(tempDir, 'valid.settings.json');
      const settings = { env: { KEY: 'VALUE' } };
      fs.writeFileSync(settingsPath, JSON.stringify(settings));

      const result = loadSettingsFromFile(settingsPath);
      expect(result).toEqual({ KEY: 'VALUE' });
    });

    it('should return empty object for non-existent file', () => {
      const result = loadSettingsFromFile(path.join(tempDir, 'non-existent.json'));
      expect(result).toEqual({});
    });

    it('should return empty object for invalid JSON', () => {
      const settingsPath = path.join(tempDir, 'invalid.json');
      fs.writeFileSync(settingsPath, 'invalid json');

      const result = loadSettingsFromFile(settingsPath);
      expect(result).toEqual({});
    });

    it('should handle tilde expansion correctly', () => {
      const mockHome = path.join(tempDir, 'home');
      fs.mkdirSync(mockHome, { recursive: true });
      const settingsPath = '~/test.settings.json';
      const actualPath = path.join(mockHome, 'test.settings.json');
      fs.writeFileSync(actualPath, JSON.stringify({ env: { HOME_VAR: 'TRUE' } }));

      // Mock os.homedir
      const homedirSpy = spyOn(os, 'homedir').mockReturnValue(mockHome);

      try {
        const result = loadSettingsFromFile(settingsPath);
        expect(result).toEqual({ HOME_VAR: 'TRUE' });
      } finally {
        homedirSpy.mockRestore();
      }
    });

    it('should handle env var expansion correctly', () => {
      const settingsPath = path.join(tempDir, '${TEST_VAR}.json');
      const actualPath = path.join(tempDir, 'actual.json');
      fs.writeFileSync(actualPath, JSON.stringify({ env: { ENV_VAR: 'EXPANDED' } }));

      process.env.TEST_VAR = 'actual';
      try {
        const result = loadSettingsFromFile(settingsPath);
        expect(result).toEqual({ ENV_VAR: 'EXPANDED' });
      } finally {
        delete process.env.TEST_VAR;
      }
    });
  });

  describe('detectProfileType', () => {
    let detector: ProfileDetector;

    beforeEach(() => {
      detector = new ProfileDetector();
    });

    it('should detect CLIProxy profiles', () => {
      const result = detector.detectProfileType('gemini');
      expect(result.type).toBe('cliproxy');
      expect(result.name).toBe('gemini');
      expect(result.provider).toBe('gemini');
    });

    it('should detect settings-based profile from unified config', () => {
      const settingsPath = path.join(tempDir, 'glm.settings.json');
      fs.writeFileSync(settingsPath, JSON.stringify({ env: { ANTHROPIC_MODEL: 'glm-4' } }));

      const mockUnifiedConfig = {
        version: 2,
        profiles: {
          glm: { settings: settingsPath, type: 'api' },
        },
      };

      const isUnifiedModeSpy = spyOn(unifiedConfigLoader, 'isUnifiedMode').mockReturnValue(true);
      const loadUnifiedConfigSpy = spyOn(unifiedConfigLoader, 'loadUnifiedConfig').mockReturnValue(
        mockUnifiedConfig as any
      );

      try {
        const result = detector.detectProfileType('glm');
        expect(result.type).toBe('settings');
        expect(result.name).toBe('glm');
        expect(result.env).toEqual({ ANTHROPIC_MODEL: 'glm-4' });
      } finally {
        isUnifiedModeSpy.mockRestore();
        loadUnifiedConfigSpy.mockRestore();
      }
    });

    it('should resolve km to legacy kimi API profile from unified config', () => {
      const settingsPath = path.join(tempDir, 'kimi.settings.json');
      fs.writeFileSync(
        settingsPath,
        JSON.stringify({ env: { ANTHROPIC_MODEL: 'kimi-k2-thinking-turbo' } })
      );

      const mockUnifiedConfig = {
        version: 2,
        profiles: {
          kimi: { settings: settingsPath, type: 'api' },
        },
      };

      const isUnifiedModeSpy = spyOn(unifiedConfigLoader, 'isUnifiedMode').mockReturnValue(true);
      const loadUnifiedConfigSpy = spyOn(unifiedConfigLoader, 'loadUnifiedConfig').mockReturnValue(
        mockUnifiedConfig as any
      );

      try {
        const result = detector.detectProfileType('km');
        expect(result.type).toBe('settings');
        expect(result.name).toBe('km');
        expect(result.settingsPath).toBe(settingsPath);
        expect(result.env).toEqual({ ANTHROPIC_MODEL: 'kimi-k2-thinking-turbo' });
      } finally {
        isUnifiedModeSpy.mockRestore();
        loadUnifiedConfigSpy.mockRestore();
      }
    });

    it('should keep ccs kimi mapped to CLIProxy provider', () => {
      const result = detector.detectProfileType('kimi');
      expect(result.type).toBe('cliproxy');
      expect(result.provider).toBe('kimi');
    });

    it('should detect account-based profile from unified config', () => {
      const mockUnifiedConfig = {
        version: 2,
        accounts: {
          work: { created: '2025-01-01', last_used: '2025-01-02', bare: true },
        },
      };

      const isUnifiedModeSpy = spyOn(unifiedConfigLoader, 'isUnifiedMode').mockReturnValue(true);
      const loadUnifiedConfigSpy = spyOn(unifiedConfigLoader, 'loadUnifiedConfig').mockReturnValue(
        mockUnifiedConfig as any
      );

      try {
        const result = detector.detectProfileType('work');
        expect(result.type).toBe('account');
        expect(result.name).toBe('work');
        expect(result.profile).toBeDefined();
        expect((result.profile as any).type).toBe('account');
        expect((result.profile as any).bare).toBe(true);
      } finally {
        isUnifiedModeSpy.mockRestore();
        loadUnifiedConfigSpy.mockRestore();
      }
    });

    it('should return null for unknown profile (throws error)', () => {
      const isUnifiedModeSpy = spyOn(unifiedConfigLoader, 'isUnifiedMode').mockReturnValue(false);
      // Mock readConfig/readProfiles to return empty
      const existsSyncSpy = spyOn(fs, 'existsSync').mockReturnValue(false);

      try {
        expect(() => detector.detectProfileType('unknown')).toThrow(/Profile not found/);
      } finally {
        isUnifiedModeSpy.mockRestore();
        existsSyncSpy.mockRestore();
      }
    });

    it('should detect cursor as a first-class runtime profile when enabled', () => {
      const mockUnifiedConfig = {
        version: 2,
        cursor: {
          enabled: true,
          port: 20129,
          auto_start: true,
          ghost_mode: true,
          model: 'gpt-5.3-codex',
        },
      };

      const isUnifiedModeSpy = spyOn(unifiedConfigLoader, 'isUnifiedMode').mockReturnValue(true);
      const loadUnifiedConfigSpy = spyOn(unifiedConfigLoader, 'loadUnifiedConfig').mockReturnValue(
        mockUnifiedConfig as any
      );

      try {
        const result = detector.detectProfileType('cursor');
        expect(result.type).toBe('cursor');
        expect(result.name).toBe('cursor');
        expect(result.cursorConfig?.auto_start).toBe(true);
      } finally {
        isUnifiedModeSpy.mockRestore();
        loadUnifiedConfigSpy.mockRestore();
      }
    });

    it('should throw a helpful error when cursor profile is disabled', () => {
      const mockUnifiedConfig = {
        version: 2,
        cursor: {
          enabled: false,
          port: 20129,
          auto_start: false,
          ghost_mode: true,
          model: 'gpt-5.3-codex',
        },
      };

      const isUnifiedModeSpy = spyOn(unifiedConfigLoader, 'isUnifiedMode').mockReturnValue(true);
      const loadUnifiedConfigSpy = spyOn(unifiedConfigLoader, 'loadUnifiedConfig').mockReturnValue(
        mockUnifiedConfig as any
      );

      try {
        expect(() => detector.detectProfileType('cursor')).toThrow(/Cursor profile is not enabled/);
      } finally {
        isUnifiedModeSpy.mockRestore();
        loadUnifiedConfigSpy.mockRestore();
      }
    });
  });
});
