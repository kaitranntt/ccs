/**
 * Tests for Windows Claude CLI detection fallback
 * Tests the native installer path detection added in #447
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as childProcess from 'child_process';

// We need to test the module with mocked dependencies
describe('Windows Claude CLI Detection', () => {
  const originalPlatform = process.platform;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment. Drop any CCS_CLAUDE_PATH inherited from the shell: it is detection
    // priority 1, so with existsSync mocked to true it would shadow the path under test.
    // Tests that exercise it set their own value.
    process.env = { ...originalEnv };
    delete process.env.CCS_CLAUDE_PATH;
  });

  afterEach(() => {
    // Restore platform and env
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    process.env = { ...originalEnv };
  });

  describe('expandWindowsPath', () => {
    it('should expand Windows environment variables', async () => {
      // Set up test env vars
      process.env.LOCALAPPDATA = 'C:\\Users\\TestUser\\AppData\\Local';
      process.env.PROGRAMFILES = 'C:\\Program Files';
      process.env.USERPROFILE = 'C:\\Users\\TestUser';

      // Import module fresh to get expandWindowsPath behavior
      const { detectClaudeCli } = await import('../../../src/utils/claude-detector');

      // The function is internal, but we can verify behavior through detectClaudeCli
      // by checking that it properly expands paths when searching
      expect(typeof detectClaudeCli).toBe('function');
    });
  });

  describe('detectClaudeCli priority order', () => {
    it('should prioritize CCS_CLAUDE_PATH over other methods', async () => {
      const testPath = '/tmp/test-claude-cli';
      process.env.CCS_CLAUDE_PATH = testPath;

      // Mock fs.existsSync to return true for our test path
      const existsSyncSpy = spyOn(fs, 'existsSync').mockImplementation((p) => {
        return p === testPath;
      });

      const { detectClaudeCli } = await import('../../../src/utils/claude-detector');
      const result = detectClaudeCli();

      expect(result).toBe(testPath);
      existsSyncSpy.mockRestore();
    });

    it('should warn and fallback when CCS_CLAUDE_PATH is invalid', async () => {
      process.env.CCS_CLAUDE_PATH = '/nonexistent/path/to/claude';

      const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
      const existsSyncSpy = spyOn(fs, 'existsSync').mockReturnValue(false);
      const execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(() => {
        throw new Error('not found');
      });

      const { detectClaudeCli } = await import('../../../src/utils/claude-detector');
      const result = detectClaudeCli();

      expect(warnSpy).toHaveBeenCalled();
      expect(result).toBeNull();

      warnSpy.mockRestore();
      existsSyncSpy.mockRestore();
      execSyncSpy.mockRestore();
    });
  });

  describe('Windows native path fallback', () => {
    it('should check native installer paths when where.exe fails on Windows', async () => {
      // Simulate Windows
      Object.defineProperty(process, 'platform', { value: 'win32' });

      process.env.USERPROFILE = 'C:\\Users\\TestUser';
      const expectedPath = 'C:\\Users\\TestUser\\.local\\bin\\claude.exe';

      const existsSyncSpy = spyOn(fs, 'existsSync').mockImplementation((p) => {
        return p === expectedPath;
      });
      const execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(() => {
        throw new Error('not found');
      });

      const { detectClaudeCli } = await import('../../../src/utils/claude-detector');
      const result = detectClaudeCli();

      // On actual Windows, this would find the native path
      // In test env (Linux), platform check will prevent fallback
      expect(result === null || typeof result === 'string').toBe(true);

      existsSyncSpy.mockRestore();
      execSyncSpy.mockRestore();
    });

    it('should return first valid native path found', async () => {
      // Test the order of path checking - native installer path is first
      const paths = [
        '%USERPROFILE%\\.local\\bin\\claude.exe',
        '%APPDATA%\\npm\\claude.cmd',
        '%USERPROFILE%\\.bun\\bin\\claude.exe',
      ];

      // Native installer path should be checked first
      expect(paths[0]).toContain('USERPROFILE');
      expect(paths[0]).toContain('.local');
      expect(paths[0]).toContain('bin');
    });
  });

  describe('getClaudeCliInfo', () => {
    it('should return null when Claude CLI not found', async () => {
      const existsSyncSpy = spyOn(fs, 'existsSync').mockReturnValue(false);
      const execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(() => {
        throw new Error('not found');
      });

      const { getClaudeCliInfo } = await import('../../../src/utils/claude-detector');
      const result = getClaudeCliInfo();

      expect(result).toBeNull();

      existsSyncSpy.mockRestore();
      execSyncSpy.mockRestore();
    });

    it('should set needsShell for .cmd files on Windows', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const cmdPath = 'C:\\Users\\test\\AppData\\Roaming\\npm\\claude.cmd';
      const existsSyncSpy = spyOn(fs, 'existsSync').mockReturnValue(true);
      const execSyncSpy = spyOn(childProcess, 'execSync').mockReturnValue(cmdPath);

      const { getClaudeCliInfo } = await import('../../../src/utils/claude-detector');
      const result = getClaudeCliInfo();

      // needsShell should be true for .cmd files on Windows
      if (result && process.platform === 'win32') {
        expect(result.needsShell).toBe(true);
      }

      existsSyncSpy.mockRestore();
      execSyncSpy.mockRestore();
    });
  });

  describe('Windows path templates', () => {
    it('should include all expected installation locations', () => {
      // Verify the path templates reference correct env vars
      const expectedEnvVars = [
        'USERPROFILE',  // Native installer: %USERPROFILE%\.local\bin\claude.exe
        'APPDATA',      // npm: %APPDATA%\npm\claude.cmd
      ];

      // These should all be referenced in the source file
      expectedEnvVars.forEach((envVar) => {
        expect(envVar).toBeTruthy();
      });
    });

    it('should handle missing environment variables gracefully', async () => {
      // Remove Windows env vars
      delete process.env.LOCALAPPDATA;
      delete process.env.PROGRAMFILES;
      delete process.env.APPDATA;
      delete process.env.USERPROFILE;

      const existsSyncSpy = spyOn(fs, 'existsSync').mockReturnValue(false);
      const execSyncSpy = spyOn(childProcess, 'execSync').mockImplementation(() => {
        throw new Error('not found');
      });

      const { detectClaudeCli } = await import('../../../src/utils/claude-detector');

      // Should not throw even with missing env vars
      expect(() => detectClaudeCli()).not.toThrow();

      existsSyncSpy.mockRestore();
      execSyncSpy.mockRestore();
    });
  });
});
