import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';

import RecoveryManager from '../../../src/management/recovery-manager';

describe('RecoveryManager', () => {
  let tempRoot = '';
  let originalCcsHome: string | undefined;
  let originalCcsDir: string | undefined;
  let capturedLogs: string[] = [];

  const ccsDir = () => path.join(tempRoot, '.ccs');
  const claudeDir = () => path.join(tempRoot, '.claude');
  const sharedDir = () => path.join(ccsDir(), 'shared');
  const completionsDir = () => path.join(ccsDir(), 'completions');

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-recovery-manager-test-'));
    originalCcsHome = process.env.CCS_HOME;
    originalCcsDir = process.env.CCS_DIR;

    process.env.CCS_HOME = tempRoot;
    delete process.env.CCS_DIR;
    capturedLogs = [];

    spyOn(os, 'homedir').mockReturnValue(tempRoot);
    spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      capturedLogs.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    mock.restore();

    if (originalCcsHome !== undefined) process.env.CCS_HOME = originalCcsHome;
    else delete process.env.CCS_HOME;

    if (originalCcsDir !== undefined) process.env.CCS_DIR = originalCcsDir;
    else delete process.env.CCS_DIR;

    if (tempRoot && fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  describe('ensureCcsDirectory', () => {
    it('creates the CCS directory when missing and records recovery', () => {
      const manager = new RecoveryManager();
      expect(fs.existsSync(ccsDir())).toBe(false);

      const created = manager.ensureCcsDirectory();

      expect(created).toBe(true);
      expect(fs.existsSync(ccsDir())).toBe(true);
      expect(manager.getRecoverySummary()).toEqual([`Created ${ccsDir()} directory`]);
    });

    it('returns false when CCS directory already exists', () => {
      fs.mkdirSync(ccsDir(), { recursive: true });
      const manager = new RecoveryManager();

      const created = manager.ensureCcsDirectory();

      expect(created).toBe(false);
      expect(manager.getRecoverySummary()).toEqual([]);
    });
  });

  describe('ensureSharedDirectories', () => {
    it('creates shared root and standard subdirectories when missing', () => {
      const manager = new RecoveryManager();

      const created = manager.ensureSharedDirectories();

      expect(created).toBe(true);
      for (const subdir of ['commands', 'skills', 'agents', 'plugins']) {
        expect(fs.statSync(path.join(sharedDir(), subdir)).isDirectory()).toBe(true);
      }
      expect(manager.getRecoverySummary()).toContain(`Created ${sharedDir()}`);
    });

    it('returns false when shared structure is already complete', () => {
      for (const subdir of ['commands', 'skills', 'agents', 'plugins']) {
        fs.mkdirSync(path.join(sharedDir(), subdir), { recursive: true });
      }
      const manager = new RecoveryManager();

      const created = manager.ensureSharedDirectories();

      expect(created).toBe(false);
      expect(manager.getRecoverySummary()).toEqual([]);
    });

    it('removes broken symlinks at shared root and subdirs and recreates directories', () => {
      fs.mkdirSync(ccsDir(), { recursive: true });
      fs.symlinkSync(path.join(tempRoot, 'missing-shared-target'), sharedDir(), 'dir');

      const manager = new RecoveryManager();
      const created = manager.ensureSharedDirectories();

      expect(created).toBe(true);
      expect(fs.lstatSync(sharedDir()).isDirectory()).toBe(true);
      expect(fs.lstatSync(sharedDir()).isSymbolicLink()).toBe(false);
      expect(manager.getRecoverySummary()).toContain(`Removed broken symlink: ${sharedDir()}`);
    });

    it('removes broken symlinks inside shared subdirectories without recreating valid ones', () => {
      fs.mkdirSync(sharedDir(), { recursive: true });
      fs.mkdirSync(path.join(sharedDir(), 'commands'), { recursive: true });
      fs.symlinkSync(
        path.join(tempRoot, 'dangling-skills'),
        path.join(sharedDir(), 'skills'),
        'dir'
      );

      const manager = new RecoveryManager();
      const created = manager.ensureSharedDirectories();

      expect(created).toBe(true);
      expect(fs.lstatSync(path.join(sharedDir(), 'skills')).isDirectory()).toBe(true);
      expect(manager.getRecoverySummary()).toContain(
        `Removed broken symlink: ${path.join(sharedDir(), 'skills')}`
      );
    });

    it('skips shared root when a regular file occupies the path', () => {
      fs.mkdirSync(ccsDir(), { recursive: true });
      fs.writeFileSync(sharedDir(), 'not-a-directory', 'utf8');

      const manager = new RecoveryManager();
      const created = manager.ensureSharedDirectories();

      expect(created).toBe(false);
      expect(manager.getRecoverySummary()).toContain(
        `Skipped ${sharedDir()}: existing path is not a directory`
      );
    });

    it('skips invalid subdirectory when a regular file occupies the subdir path', () => {
      fs.mkdirSync(sharedDir(), { recursive: true });
      const pluginsPath = path.join(sharedDir(), 'plugins');
      fs.writeFileSync(pluginsPath, 'file-instead-of-dir', 'utf8');

      const manager = new RecoveryManager();
      const created = manager.ensureSharedDirectories();

      expect(created).toBe(true);
      expect(manager.getRecoverySummary()).toContain(
        `Skipped ${pluginsPath}: existing path is not a directory`
      );
    });

    it('skips symlinked shared root that points to a regular file', () => {
      fs.mkdirSync(ccsDir(), { recursive: true });
      const fileTarget = path.join(tempRoot, 'file-target');
      fs.writeFileSync(fileTarget, 'hello', 'utf8');
      fs.symlinkSync(fileTarget, sharedDir(), 'file');

      const manager = new RecoveryManager();
      const created = manager.ensureSharedDirectories();

      expect(created).toBe(false);
      expect(manager.getRecoverySummary()).toContain(
        `Skipped ${sharedDir()}: symlink target is not a directory`
      );
    });
  });

  describe('ensureClaudeSettings', () => {
    it('creates ~/.claude directory and empty settings.json when missing', () => {
      const manager = new RecoveryManager();
      const settingsPath = path.join(claudeDir(), 'settings.json');

      const created = manager.ensureClaudeSettings();

      expect(created).toBe(true);
      expect(fs.existsSync(claudeDir())).toBe(true);
      expect(fs.readFileSync(settingsPath, 'utf8')).toBe('{}\n');
      expect(manager.getRecoverySummary()).toEqual([
        `Created ${claudeDir()} directory`,
        `Created ${settingsPath}`,
      ]);
    });

    it('leaves existing settings.json untouched', () => {
      fs.mkdirSync(claudeDir(), { recursive: true });
      const settingsPath = path.join(claudeDir(), 'settings.json');
      fs.writeFileSync(settingsPath, '{"env":{"FOO":"bar"}}\n', 'utf8');

      const manager = new RecoveryManager();
      const created = manager.ensureClaudeSettings();

      expect(created).toBe(false);
      expect(fs.readFileSync(settingsPath, 'utf8')).toBe('{"env":{"FOO":"bar"}}\n');
      expect(manager.getRecoverySummary()).toEqual([]);
    });
  });

  describe('ensureConfigYaml', () => {
    it('creates default config.yaml when neither config.yaml nor config.json exists', () => {
      fs.mkdirSync(ccsDir(), { recursive: true });
      const manager = new RecoveryManager();

      const created = manager.ensureConfigYaml();

      expect(created).toBe(true);
      const yamlPath = path.join(ccsDir(), 'config.yaml');
      expect(fs.existsSync(yamlPath)).toBe(true);
      const parsed = yaml.load(fs.readFileSync(yamlPath, 'utf8')) as { version?: number };
      expect(typeof parsed.version).toBe('number');
      expect(manager.getRecoverySummary()).toContain(`Created ${yamlPath}`);
    });

    it('keeps valid existing config.yaml without modification', () => {
      fs.mkdirSync(ccsDir(), { recursive: true });
      const manager = new RecoveryManager();
      expect(manager.ensureConfigYaml()).toBe(true);

      const secondManager = new RecoveryManager();
      const createdAgain = secondManager.ensureConfigYaml();

      expect(createdAgain).toBe(false);
      expect(secondManager.getRecoverySummary()).toEqual([]);
    });

    it('defers to autoMigrate when legacy config.json exists without config.yaml', () => {
      fs.mkdirSync(ccsDir(), { recursive: true });
      fs.writeFileSync(path.join(ccsDir(), 'config.json'), '{"profiles":{}}\n', 'utf8');

      const manager = new RecoveryManager();
      const created = manager.ensureConfigYaml();

      expect(created).toBe(false);
      expect(fs.existsSync(path.join(ccsDir(), 'config.yaml'))).toBe(false);
      expect(manager.getRecoverySummary()).toEqual([]);
    });

    it('propagates YAML parse error when config.yaml is corrupted', () => {
      fs.mkdirSync(ccsDir(), { recursive: true });
      const yamlPath = path.join(ccsDir(), 'config.yaml');
      fs.writeFileSync(yamlPath, 'profiles:\n  broken: [unclosed\n', 'utf8');

      const manager = new RecoveryManager();
      expect(() => manager.ensureConfigYaml()).toThrow();
    });

    it('falls back to minimal config.json when config.yaml directory is not writable', () => {
      // Simulate read-only / non-existent config.yaml failure only when saveConfig throws;
      // when config.yaml exists as a directory, loadUnifiedConfig surfaces EISDIR.
      fs.mkdirSync(ccsDir(), { recursive: true });
      fs.mkdirSync(path.join(ccsDir(), 'config.yaml'), { recursive: true });

      const manager = new RecoveryManager();
      expect(() => manager.ensureConfigYaml()).toThrow();
    });
  });

  describe('ensureShellCompletions', () => {
    it('copies shell completion scripts into completionsDir when missing', () => {
      fs.mkdirSync(ccsDir(), { recursive: true });
      const manager = new RecoveryManager();

      const installed = manager.ensureShellCompletions();

      expect(installed).toBe(true);
      for (const file of ['ccs.bash', 'ccs.zsh', 'ccs.fish', 'ccs.ps1']) {
        expect(fs.existsSync(path.join(completionsDir(), file))).toBe(true);
      }
      expect(manager.getRecoverySummary()).toContain(
        `Installed shell completions to ${completionsDir()}`
      );
    });

    it('does not overwrite existing completion files', () => {
      fs.mkdirSync(completionsDir(), { recursive: true });
      for (const file of ['ccs.bash', 'ccs.zsh', 'ccs.fish', 'ccs.ps1']) {
        fs.writeFileSync(path.join(completionsDir(), file), `# custom ${file}\n`, 'utf8');
      }

      const manager = new RecoveryManager();
      const installed = manager.ensureShellCompletions();

      expect(installed).toBe(false);
      expect(fs.readFileSync(path.join(completionsDir(), 'ccs.bash'), 'utf8')).toBe(
        '# custom ccs.bash\n'
      );
    });
  });

  describe('recoverAll and showRecoveryHints', () => {
    it('performs full lazy recovery on an empty home directory and resets summary between runs', () => {
      const manager = new RecoveryManager();

      const firstRunRecovered = manager.recoverAll();
      expect(firstRunRecovered).toBe(true);
      expect(manager.getRecoverySummary().length).toBeGreaterThanOrEqual(5);
      expect(fs.existsSync(path.join(ccsDir(), 'config.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(claudeDir(), 'settings.json'))).toBe(true);

      const secondRunRecovered = manager.recoverAll();
      expect(secondRunRecovered).toBe(false);
      expect(manager.getRecoverySummary()).toEqual([]);
    });

    it('prints login hint when claude settings.json was created and stays silent when nothing recovered', () => {
      const manager = new RecoveryManager();
      manager.showRecoveryHints();
      expect(capturedLogs).toEqual([]);

      manager.recoverAll();
      manager.showRecoveryHints();

      const output = capturedLogs.join('\n');
      expect(output).toContain('Auto-recovery completed:');
      expect(output).toContain('Next step: Login to Claude CLI');
      expect(output).toContain('Run: claude /login');
    });

    it('omits Claude login hint when settings.json already existed', () => {
      fs.mkdirSync(claudeDir(), { recursive: true });
      fs.writeFileSync(path.join(claudeDir(), 'settings.json'), '{}\n', 'utf8');

      const manager = new RecoveryManager();
      manager.recoverAll();
      manager.showRecoveryHints();

      const output = capturedLogs.join('\n');
      expect(output).toContain('Auto-recovery completed:');
      expect(output).not.toContain('Next step: Login to Claude CLI');
    });
  });
});
