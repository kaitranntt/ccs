import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ensureProfileHooks } from '../../../../src/utils/websearch/profile-hook-injector';
import { getHookPath } from '../../../../src/utils/websearch/hook-config';
import { getMigrationMarkerPath } from '../../../../src/utils/websearch/hook-installer';

describe('ensureProfileHooks', () => {
  let tempHome: string | undefined;
  let originalCcsHome: string | undefined;
  let originalClaudeConfigDir: string | undefined;

  function setupTempHome(): string {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-profile-hook-test-'));
    originalCcsHome = process.env.CCS_HOME;
    originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
    process.env.CCS_HOME = tempHome;
    delete process.env.CLAUDE_CONFIG_DIR;
    return tempHome;
  }

  function getCcsDir(): string {
    if (!tempHome) {
      throw new Error('tempHome not initialized');
    }
    return path.join(tempHome, '.ccs');
  }

  function getBundledHookContents(): string {
    return fs.readFileSync(path.join(process.cwd(), 'lib', 'hooks', 'websearch-transformer.cjs'), 'utf8');
  }

  afterEach(() => {
    mock.restore();

    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }

    if (originalClaudeConfigDir !== undefined) {
      process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
    } else {
      delete process.env.CLAUDE_CONFIG_DIR;
    }

    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }

    tempHome = undefined;
    originalCcsHome = undefined;
    originalClaudeConfigDir = undefined;
  });

  it('installs the hook binary before writing the profile hook command', () => {
    setupTempHome();

    const ensured = ensureProfileHooks('glm');
    const hookPath = getHookPath();
    const settingsPath = path.join(tempHome!, '.ccs', 'glm.settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

    expect(ensured).toBe(true);
    expect(fs.existsSync(hookPath)).toBe(true);
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe(`node "${hookPath}"`);
  });

  it('succeeds when the hook already exists on disk and installation is effectively a no-op', () => {
    setupTempHome();

    const hookPath = getHookPath();
    fs.mkdirSync(path.dirname(hookPath), { recursive: true });
    fs.writeFileSync(hookPath, getBundledHookContents(), 'utf8');

    const copyFileSpy = spyOn(fs, 'copyFileSync').mockImplementation(() => {
      throw new Error('copy skipped');
    });

    const ensured = ensureProfileHooks('glm');
    const settingsPath = path.join(getCcsDir(), 'glm.settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

    expect(ensured).toBe(true);
    expect(copyFileSpy).not.toHaveBeenCalled();
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe(`node "${hookPath}"`);
  });

  it('does not rewrite the shared hook binary when it is already installed', () => {
    setupTempHome();

    expect(ensureProfileHooks('glm')).toBe(true);

    const firstMtime = fs.statSync(getHookPath()).mtimeMs;
    const waitUntil = Date.now() + 25;
    while (Date.now() < waitUntil) {
      // Give the filesystem timestamp a chance to advance if a rewrite occurs.
    }

    expect(ensureProfileHooks('glm')).toBe(true);
    const secondMtime = fs.statSync(getHookPath()).mtimeMs;

    expect(secondMtime).toBe(firstMtime);
  });

  it('refreshes a stale shared hook binary when the bundled script has changed', () => {
    setupTempHome();

    const hookPath = getHookPath();
    fs.mkdirSync(path.dirname(hookPath), { recursive: true });
    fs.writeFileSync(hookPath, '// stale hook', 'utf8');

    expect(ensureProfileHooks('glm')).toBe(true);
    const installedHook = fs.readFileSync(hookPath, 'utf8');

    expect(installedHook).not.toBe('// stale hook');
    expect(installedHook).toContain('CCS WebSearch Hook');
  });

  it('repairs an unreadable existing hook binary instead of failing the profile setup', () => {
    if (process.platform === 'win32') return;

    setupTempHome();

    const hookPath = getHookPath();
    fs.mkdirSync(path.dirname(hookPath), { recursive: true });
    fs.writeFileSync(hookPath, '// unreadable stale hook', 'utf8');
    fs.chmodSync(hookPath, 0o200);

    try {
      const ensured = ensureProfileHooks('glm');
      const settingsPath = path.join(getCcsDir(), 'glm.settings.json');
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      const installedHook = fs.readFileSync(hookPath, 'utf8');

      expect(ensured).toBe(true);
      expect(installedHook).not.toBe('// unreadable stale hook');
      expect(installedHook).toContain('CCS WebSearch Hook');
      expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe(`node "${hookPath}"`);
    } finally {
      if (fs.existsSync(hookPath)) {
        fs.chmodSync(hookPath, 0o644);
      }
    }
  });

  it('succeeds when another process installs the hook during a failed local install', () => {
    setupTempHome();

    const hookPath = getHookPath();
    const originalCopyFileSync = fs.copyFileSync;
    const copyFileSpy = spyOn(fs, 'copyFileSync').mockImplementation((source, destination) => {
      originalCopyFileSync(source, hookPath);
      throw new Error(`simulated concurrent winner while copying to ${String(destination)}`);
    });

    const ensured = ensureProfileHooks('glm');
    const settingsPath = path.join(getCcsDir(), 'glm.settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

    expect(ensured).toBe(true);
    expect(copyFileSpy).toHaveBeenCalled();
    expect(fs.existsSync(hookPath)).toBe(true);
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe(`node "${hookPath}"`);
  });

  it('returns false when the hook path exists but is unusable', () => {
    setupTempHome();

    const hookPath = getHookPath();
    fs.mkdirSync(hookPath, { recursive: true });

    const ensured = ensureProfileHooks('glm');

    expect(ensured).toBe(false);
    expect(fs.statSync(hookPath).isDirectory()).toBe(true);
    expect(fs.existsSync(path.join(getCcsDir(), 'glm.settings.json'))).toBe(false);
  });

  it('returns false for invalid profile names without creating files', () => {
    setupTempHome();

    const ensured = ensureProfileHooks('../glm');

    expect(ensured).toBe(false);
    expect(fs.existsSync(getCcsDir())).toBe(false);
  });

  it('returns false when WebSearch is disabled without creating files', () => {
    setupTempHome();

    fs.mkdirSync(getCcsDir(), { recursive: true });
    fs.writeFileSync(
      path.join(getCcsDir(), 'config.yaml'),
      'version: 12\nwebsearch:\n  enabled: false\n',
      'utf8'
    );

    const ensured = ensureProfileHooks('glm');

    expect(ensured).toBe(false);
    expect(fs.existsSync(getHookPath())).toBe(false);
    expect(fs.existsSync(path.join(getCcsDir(), 'glm.settings.json'))).toBe(false);
  });

  it('returns false when hook installation fails and no hook exists on disk', () => {
    setupTempHome();

    const claudeSettingsPath = path.join(tempHome!, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(claudeSettingsPath), { recursive: true });
    const globalSettings = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'WebSearch',
            hooks: [
              {
                type: 'command',
                command: `node "${getHookPath()}"`,
                timeout: 90,
              },
            ],
          },
        ],
      },
    };
    fs.writeFileSync(claudeSettingsPath, JSON.stringify(globalSettings, null, 2), 'utf8');

    const copyFileSpy = spyOn(fs, 'copyFileSync').mockImplementation(() => {
      throw new Error('copy failed');
    });

    const ensured = ensureProfileHooks('glm');
    const persistedGlobalSettings = JSON.parse(fs.readFileSync(claudeSettingsPath, 'utf8'));

    expect(ensured).toBe(false);
    expect(copyFileSpy).toHaveBeenCalled();
    expect(fs.existsSync(getHookPath())).toBe(false);
    expect(fs.existsSync(getMigrationMarkerPath())).toBe(false);
    expect(fs.existsSync(path.join(getCcsDir(), 'glm.settings.json'))).toBe(false);
    expect(persistedGlobalSettings).toEqual(globalSettings);
  });
});
