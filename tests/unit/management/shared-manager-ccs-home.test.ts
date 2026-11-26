import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { SettingsSymlinksChecker } from '../../../src/management/checks/symlink-check';
import { HealthCheck } from '../../../src/management/checks/types';
import {
  normalizePluginMetadataContent,
  normalizePluginMetadataPathString,
} from '../../../src/management/plugin-path-normalizer';
import SharedManager from '../../../src/management/shared-manager';

describe('SharedManager and symlink checks respect CCS_HOME over os.homedir()', () => {
  let ccsHomeDir = '';
  let realHomeDir = '';
  let originalHome: string | undefined;
  let originalCcsHome: string | undefined;
  let originalCcsDir: string | undefined;

  const isolatedClaudeDir = () => path.join(ccsHomeDir, '.claude');
  const isolatedCcsDir = () => path.join(ccsHomeDir, '.ccs');
  const realClaudeDir = () => path.join(realHomeDir, '.claude');

  beforeEach(() => {
    ccsHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-home-isolated-'));
    realHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-home-real-'));

    originalHome = process.env.HOME;
    originalCcsHome = process.env.CCS_HOME;
    originalCcsDir = process.env.CCS_DIR;

    process.env.CCS_HOME = ccsHomeDir;
    process.env.HOME = realHomeDir;
    delete process.env.CCS_DIR;

    spyOn(os, 'homedir').mockReturnValue(realHomeDir);
    spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    mock.restore();

    if (originalHome !== undefined) process.env.HOME = originalHome;
    else delete process.env.HOME;

    if (originalCcsHome !== undefined) process.env.CCS_HOME = originalCcsHome;
    else delete process.env.CCS_HOME;

    if (originalCcsDir !== undefined) process.env.CCS_DIR = originalCcsDir;
    else delete process.env.CCS_DIR;

    for (const dir of [ccsHomeDir, realHomeDir]) {
      if (dir && fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('SharedManager resolves claudeDir under CCS_HOME and never touches HOME/.claude', () => {
    const manager = new SharedManager();
    manager.ensureSharedDirectories();

    expect(fs.existsSync(isolatedClaudeDir())).toBe(true);
    expect(fs.existsSync(realClaudeDir())).toBe(false);

    for (const item of ['commands', 'skills', 'agents', 'plugins']) {
      const sharedItem = path.join(isolatedCcsDir(), 'shared', item);
      const expectedTarget = path.join(isolatedClaudeDir(), item);
      expect(fs.existsSync(expectedTarget)).toBe(true);

      const stats = fs.lstatSync(sharedItem);
      if (stats.isSymbolicLink()) {
        const resolved = path.resolve(path.dirname(sharedItem), fs.readlinkSync(sharedItem));
        expect(fs.realpathSync(resolved)).toBe(fs.realpathSync(expectedTarget));
      }
    }

    expect(fs.existsSync(realClaudeDir())).toBe(false);
  });

  it('normalizePluginRegistryPaths and plugin-path-normalizer target CCS_HOME/.claude', () => {
    const sharedPluginsDir = path.join(isolatedCcsDir(), 'shared', 'plugins');
    const registryPath = path.join(sharedPluginsDir, 'installed_plugins.json');
    fs.mkdirSync(sharedPluginsDir, { recursive: true });

    const instanceCachePath = path.join(
      isolatedCcsDir(),
      'instances',
      'work',
      'plugins',
      'cache',
      'my-plugin',
      '1.0.0'
    );
    fs.writeFileSync(
      registryPath,
      JSON.stringify(
        {
          version: 2,
          plugins: {
            'my-plugin@official': [{ installPath: instanceCachePath }],
          },
        },
        null,
        2
      ),
      'utf8'
    );

    const manager = new SharedManager();
    manager.normalizePluginRegistryPaths();

    const expectedPath = path.join(isolatedClaudeDir(), 'plugins', 'cache', 'my-plugin', '1.0.0');
    const updated = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as {
      plugins: Record<string, Array<{ installPath: string }>>;
    };
    expect(updated.plugins['my-plugin@official'][0].installPath).toBe(expectedPath);
    expect(fs.existsSync(realClaudeDir())).toBe(false);

    // Direct helper defaults also use CCS_HOME/.claude when targetConfigDir is omitted
    expect(normalizePluginMetadataPathString(instanceCachePath)).toBe(expectedPath);
    const normalizedDirect = JSON.parse(
      normalizePluginMetadataContent(JSON.stringify({ installPath: instanceCachePath }))
    ) as { installPath: string };
    expect(normalizedDirect.installPath).toBe(expectedPath);
  });

  it('SettingsSymlinksChecker checks CCS_HOME/.claude instead of HOME/.claude', () => {
    const sharedDir = path.join(isolatedCcsDir(), 'shared');
    fs.mkdirSync(sharedDir, { recursive: true });
    fs.mkdirSync(isolatedClaudeDir(), { recursive: true });

    const isolatedSettings = path.join(isolatedClaudeDir(), 'settings.json');
    const sharedSettings = path.join(sharedDir, 'settings.json');
    fs.writeFileSync(isolatedSettings, '{}', 'utf8');
    fs.symlinkSync(isolatedSettings, sharedSettings);

    // Put a decoy settings.json in realHomeDir/.claude to verify it is ignored
    fs.mkdirSync(realClaudeDir(), { recursive: true });
    fs.writeFileSync(path.join(realClaudeDir(), 'settings.json'), '{"real":true}', 'utf8');

    const okResults = new HealthCheck();
    new SettingsSymlinksChecker().run(okResults);
    expect(okResults.warnings).toHaveLength(0);
    expect(okResults.errors).toHaveLength(0);
    expect(
      okResults.checks.some((c) => c.name === 'Settings Symlinks' && c.status === 'success')
    ).toBe(true);

    // Pointing shared/settings.json at realHomeDir/.claude/settings.json must fail check
    fs.unlinkSync(sharedSettings);
    fs.symlinkSync(path.join(realClaudeDir(), 'settings.json'), sharedSettings);

    const wrongTargetResults = new HealthCheck();
    new SettingsSymlinksChecker().run(wrongTargetResults);
    expect(wrongTargetResults.warnings).toHaveLength(1);
    expect(wrongTargetResults.warnings[0].message).toBe('Shared symlink points to wrong target');
  });
});
