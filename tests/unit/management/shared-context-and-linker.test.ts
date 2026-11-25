import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  syncAdvancedContinuityArtifacts,
  syncProjectContext,
} from '../../../src/management/shared-manager/project-context-sync';
import { syncProjectMemories } from '../../../src/management/shared-manager/project-memory-sync';
import {
  detachSharedDirectories,
  detectCircularSymlink,
  ensureSharedDirectories,
  linkSharedDirectories,
} from '../../../src/management/shared-manager/shared-dir-linker';
import {
  detachManagedPluginLayout,
  ensureSharedPluginLayoutDefaults,
  getSharedPluginLinkItems,
  linkInstancePlugins,
} from '../../../src/management/shared-manager/plugin-layout-internals';
import type { SymlinkHelperDeps } from '../../../src/management/shared-manager/symlink-helpers';
import { ADVANCED_CONTINUITY_ITEMS } from '../../../src/management/shared-manager/types';

describe('shared-manager project-context-sync, project-memory-sync, and shared-dir-linker', () => {
  let tempRoot = '';
  let originalCcsHome: string | undefined;
  let originalCcsDir: string | undefined;
  let logs: string[] = [];
  const warnDeps: SymlinkHelperDeps = { warn: (msg) => `[!] ${msg}` };

  const claudeDir = () => path.join(tempRoot, '.claude');
  const ccsDir = () => path.join(tempRoot, '.ccs');
  const sharedDir = () => path.join(ccsDir(), 'shared');
  const instancesDir = () => path.join(ccsDir(), 'instances');
  const instanceDir = (name: string) => path.join(instancesDir(), name);

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-context-linker-test-'));
    originalCcsHome = process.env.CCS_HOME;
    originalCcsDir = process.env.CCS_DIR;

    process.env.CCS_HOME = tempRoot;
    delete process.env.CCS_DIR;
    logs = [];

    spyOn(os, 'homedir').mockReturnValue(tempRoot);
    spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
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

  describe('syncProjectContext', () => {
    it('creates isolated projects directory by default and preserves local files', async () => {
      const workPath = instanceDir('work');
      fs.mkdirSync(workPath, { recursive: true });
      const roots = { sharedDir: sharedDir(), instancesDir: instancesDir() };

      await syncProjectContext(roots, workPath, { mode: 'isolated' }, warnDeps);

      const projectsPath = path.join(workPath, 'projects');
      expect(fs.lstatSync(projectsPath).isDirectory()).toBe(true);
      expect(fs.lstatSync(projectsPath).isSymbolicLink()).toBe(false);
    });

    it('links projects to shared context group and migrates local project files with conflict safety', async () => {
      const workPath = instanceDir('work');
      const localProjects = path.join(workPath, 'projects');
      fs.mkdirSync(path.join(localProjects, 'repo-a'), { recursive: true });
      fs.writeFileSync(path.join(localProjects, 'repo-a', 'session.jsonl'), 'work-session\n');

      const roots = { sharedDir: sharedDir(), instancesDir: instancesDir() };
      const sharedProjects = path.join(sharedDir(), 'context-groups', 'team-a', 'projects');
      fs.mkdirSync(path.join(sharedProjects, 'repo-a'), { recursive: true });
      fs.writeFileSync(path.join(sharedProjects, 'repo-a', 'session.jsonl'), 'team-session\n');

      await syncProjectContext(roots, workPath, { mode: 'shared', group: 'team-a' }, warnDeps);

      expect(fs.lstatSync(localProjects).isSymbolicLink()).toBe(true);
      expect(fs.realpathSync(localProjects)).toBe(fs.realpathSync(sharedProjects));
      expect(fs.readFileSync(path.join(sharedProjects, 'repo-a', 'session.jsonl'), 'utf8')).toBe(
        'team-session\n'
      );
      expect(
        fs.readFileSync(
          path.join(sharedProjects, 'repo-a', 'session.jsonl.migrated-from-work'),
          'utf8'
        )
      ).toBe('work-session\n');
    });

    it('merges from previous safe group symlink when switching context groups and skips unsafe external symlink', async () => {
      const workPath = instanceDir('work');
      fs.mkdirSync(workPath, { recursive: true });
      const roots = { sharedDir: sharedDir(), instancesDir: instancesDir() };

      // First sync to group-a and seed a file
      await syncProjectContext(roots, workPath, { mode: 'shared', group: 'group-a' }, warnDeps);
      const groupAProjects = path.join(sharedDir(), 'context-groups', 'group-a', 'projects');
      fs.writeFileSync(path.join(groupAProjects, 'history.txt'), 'from-a', 'utf8');

      // Switch to group-b -> merges group-a contents into group-b
      await syncProjectContext(roots, workPath, { mode: 'shared', group: 'group-b' }, warnDeps);
      const groupBProjects = path.join(sharedDir(), 'context-groups', 'group-b', 'projects');
      expect(fs.readFileSync(path.join(groupBProjects, 'history.txt'), 'utf8')).toBe('from-a');

      // Switch back to isolated -> copies group-b into local directory
      await syncProjectContext(roots, workPath, { mode: 'isolated' }, warnDeps);
      const localProjects = path.join(workPath, 'projects');
      expect(fs.lstatSync(localProjects).isSymbolicLink()).toBe(false);
      expect(fs.readFileSync(path.join(localProjects, 'history.txt'), 'utf8')).toBe('from-a');

      // Replace local projects with an unsafe external symlink and switch to isolated -> warns and skips merge
      fs.rmSync(localProjects, { recursive: true, force: true });
      const outside = path.join(tempRoot, 'outside-projects');
      fs.mkdirSync(outside, { recursive: true });
      fs.writeFileSync(path.join(outside, 'secret.txt'), 'nope', 'utf8');
      fs.symlinkSync(outside, localProjects, 'dir');

      await syncProjectContext(roots, workPath, { mode: 'isolated' }, warnDeps);
      expect(fs.lstatSync(localProjects).isSymbolicLink()).toBe(false);
      expect(fs.existsSync(path.join(localProjects, 'secret.txt'))).toBe(false);
      expect(logs.join('\n')).toContain('Skipping unsafe project merge source outside CCS roots');
    });

    it('replaces non-directory regular file occupying projects path in both modes', async () => {
      const workPath = instanceDir('work');
      fs.mkdirSync(workPath, { recursive: true });
      const projectsPath = path.join(workPath, 'projects');
      fs.writeFileSync(projectsPath, 'stray-file', 'utf8');
      const roots = { sharedDir: sharedDir(), instancesDir: instancesDir() };

      await syncProjectContext(roots, workPath, { mode: 'isolated' }, warnDeps);
      expect(fs.lstatSync(projectsPath).isDirectory()).toBe(true);

      fs.rmSync(projectsPath, { recursive: true, force: true });
      fs.writeFileSync(projectsPath, 'stray-file-2', 'utf8');
      await syncProjectContext(roots, workPath, { mode: 'shared', group: 'default' }, warnDeps);
      expect(fs.lstatSync(projectsPath).isSymbolicLink()).toBe(true);
    });
  });

  describe('syncAdvancedContinuityArtifacts', () => {
    it('links continuity artifacts in shared deeper mode and restores local dirs when downgraded', async () => {
      const workPath = instanceDir('work');
      fs.mkdirSync(path.join(workPath, 'todos'), { recursive: true });
      fs.writeFileSync(path.join(workPath, 'todos', 'todo.json'), '{"id":1}', 'utf8');
      const roots = { sharedDir: sharedDir(), instancesDir: instancesDir() };

      await syncAdvancedContinuityArtifacts(
        roots,
        workPath,
        { mode: 'shared', group: 'alpha', continuityMode: 'deeper' },
        warnDeps
      );

      for (const item of ADVANCED_CONTINUITY_ITEMS) {
        const artifactPath = path.join(workPath, item);
        expect(fs.lstatSync(artifactPath).isSymbolicLink()).toBe(true);
      }

      const sharedTodos = path.join(sharedDir(), 'context-groups', 'alpha', 'continuity', 'todos');
      expect(fs.readFileSync(path.join(sharedTodos, 'todo.json'), 'utf8')).toBe('{"id":1}');

      // Switching from alpha to beta merges continuity data
      await syncAdvancedContinuityArtifacts(
        roots,
        workPath,
        { mode: 'shared', group: 'beta', continuityMode: 'deeper' },
        warnDeps
      );
      const betaTodos = path.join(sharedDir(), 'context-groups', 'beta', 'continuity', 'todos');
      expect(fs.readFileSync(path.join(betaTodos, 'todo.json'), 'utf8')).toBe('{"id":1}');

      // Downgrading to standard continuity restores local directories with merged artifacts
      await syncAdvancedContinuityArtifacts(
        roots,
        workPath,
        { mode: 'shared', group: 'beta', continuityMode: 'standard' },
        warnDeps
      );
      expect(fs.lstatSync(path.join(workPath, 'todos')).isSymbolicLink()).toBe(false);
      expect(fs.readFileSync(path.join(workPath, 'todos', 'todo.json'), 'utf8')).toBe('{"id":1}');
    });

    it('warns and skips merging unsafe external continuity symlinks', async () => {
      const workPath = instanceDir('work');
      fs.mkdirSync(workPath, { recursive: true });
      const outside = path.join(tempRoot, 'outside-todos');
      fs.mkdirSync(outside, { recursive: true });
      fs.writeFileSync(path.join(outside, 'x.json'), '{}', 'utf8');
      fs.symlinkSync(outside, path.join(workPath, 'todos'), 'dir');

      const roots = { sharedDir: sharedDir(), instancesDir: instancesDir() };
      await syncAdvancedContinuityArtifacts(
        roots,
        workPath,
        { mode: 'isolated' },
        warnDeps
      );

      expect(fs.lstatSync(path.join(workPath, 'todos')).isSymbolicLink()).toBe(false);
      expect(fs.existsSync(path.join(workPath, 'todos', 'x.json'))).toBe(false);
      expect(logs.join('\n')).toContain('Skipping unsafe todos merge source outside CCS roots');
    });
  });

  describe('syncProjectMemories', () => {
    it('migrates, merges conflicts, and symlinks per-project memory directories', async () => {
      const workPath = instanceDir('work');
      const projectsDir = path.join(workPath, 'projects');
      const projAMem = path.join(projectsDir, 'proj-a', 'memory');
      const projBMem = path.join(projectsDir, 'proj-b', 'memory');
      const projCDir = path.join(projectsDir, 'proj-c');
      const sharedMemB = path.join(sharedDir(), 'memory', 'proj-b');

      fs.mkdirSync(projAMem, { recursive: true });
      fs.writeFileSync(path.join(projAMem, 'notes.md'), 'proj-a notes', 'utf8');

      fs.mkdirSync(projBMem, { recursive: true });
      fs.writeFileSync(path.join(projBMem, 'MEMORY.md'), 'instance-b', 'utf8');
      fs.mkdirSync(sharedMemB, { recursive: true });
      fs.writeFileSync(path.join(sharedMemB, 'MEMORY.md'), 'shared-b', 'utf8');

      fs.mkdirSync(projCDir, { recursive: true });

      const roots = { sharedDir: sharedDir(), instancesDir: instancesDir() };
      await syncProjectMemories(roots, workPath, warnDeps);

      expect(fs.lstatSync(projAMem).isSymbolicLink()).toBe(true);
      expect(fs.readFileSync(path.join(sharedDir(), 'memory', 'proj-a', 'notes.md'), 'utf8')).toBe(
        'proj-a notes'
      );

      expect(fs.lstatSync(projBMem).isSymbolicLink()).toBe(true);
      expect(fs.readFileSync(path.join(sharedMemB, 'MEMORY.md'), 'utf8')).toBe('shared-b');
      expect(
        fs.readFileSync(path.join(sharedMemB, 'MEMORY.md.migrated-from-work'), 'utf8')
      ).toBe('instance-b');

      expect(fs.lstatSync(path.join(projCDir, 'memory')).isSymbolicLink()).toBe(true);
      expect(logs.join('\n')).toContain('Synced shared project memory:');
    });
  });

  describe('shared-dir-linker', () => {
    it('detects direct and indirect circular symlinks back into sharedDir', () => {
      fs.mkdirSync(claudeDir(), { recursive: true });
      fs.mkdirSync(sharedDir(), { recursive: true });

      const sharedCommands = path.join(sharedDir(), 'commands');
      const claudeCommands = path.join(claudeDir(), 'commands');
      fs.mkdirSync(sharedCommands, { recursive: true });
      fs.symlinkSync(sharedCommands, claudeCommands, 'dir');

      expect(detectCircularSymlink(claudeCommands, sharedDir())).toBe(true);
      expect(detectCircularSymlink(path.join(claudeDir(), 'missing'), sharedDir())).toBe(false);

      const safeDir = path.join(tempRoot, 'external-commands');
      fs.mkdirSync(safeDir, { recursive: true });
      const claudeSkills = path.join(claudeDir(), 'skills');
      fs.symlinkSync(safeDir, claudeSkills, 'dir');
      expect(detectCircularSymlink(claudeSkills, sharedDir())).toBe(false);
    });

    it('provisions shared directories, links an instance, and detaches only shared-pointing symlinks', () => {
      const roots = {
        claudeDir: claudeDir(),
        sharedDir: sharedDir(),
        instancesDir: instancesDir(),
      };
      const workPath = instanceDir('work');
      fs.mkdirSync(workPath, { recursive: true });

      ensureSharedDirectories(roots);
      linkSharedDirectories(roots, workPath);

      expect(fs.lstatSync(path.join(workPath, 'commands')).isSymbolicLink()).toBe(true);
      expect(fs.lstatSync(path.join(workPath, 'settings.json')).isSymbolicLink()).toBe(true);
      expect(fs.lstatSync(path.join(workPath, 'plugins')).isDirectory()).toBe(true);
      expect(fs.lstatSync(path.join(workPath, 'plugins', 'cache')).isSymbolicLink()).toBe(true);

      // Add a custom non-shared symlink in instance to verify detach preserves non-shared links
      const customTarget = path.join(tempRoot, 'custom-agents');
      fs.mkdirSync(customTarget, { recursive: true });
      fs.unlinkSync(path.join(workPath, 'agents'));
      fs.symlinkSync(customTarget, path.join(workPath, 'agents'), 'dir');

      detachSharedDirectories(roots, workPath);

      expect(fs.existsSync(path.join(workPath, 'commands'))).toBe(false);
      expect(fs.existsSync(path.join(workPath, 'settings.json'))).toBe(false);
      expect(fs.lstatSync(path.join(workPath, 'agents')).isSymbolicLink()).toBe(true);
    });
  });

  describe('plugin-layout-internals', () => {
    it('creates default shared plugin directories, migrates existing non-empty claude dirs, and links/detaches instance plugins', () => {
      const roots = {
        claudeDir: claudeDir(),
        sharedDir: sharedDir(),
        instancesDir: instancesDir(),
      };
      const claudePlugins = path.join(claudeDir(), 'plugins');
      const claudeCache = path.join(claudePlugins, 'cache');
      const claudeCustom = path.join(claudePlugins, 'custom-dir');
      fs.mkdirSync(claudeCache, { recursive: true });
      fs.mkdirSync(claudeCustom, { recursive: true });
      fs.writeFileSync(path.join(claudeCache, 'cached.json'), '{"v":1}', 'utf8');
      fs.writeFileSync(path.join(claudeCustom, 'plugin.json'), '{"name":"demo"}', 'utf8');
      fs.writeFileSync(path.join(claudePlugins, 'known_marketplaces.json'), '{}', 'utf8');
      fs.writeFileSync(path.join(claudePlugins, 'extra.txt'), 'extra', 'utf8');

      ensureSharedDirectories(roots);
      ensureSharedPluginLayoutDefaults(claudeDir());

      expect(fs.existsSync(path.join(sharedDir(), 'plugins', 'cache', 'cached.json'))).toBe(true);
      expect(fs.existsSync(path.join(sharedDir(), 'plugins', 'marketplaces'))).toBe(true);
      expect(fs.existsSync(path.join(claudeDir(), 'plugins', 'installed_plugins.json'))).toBe(true);
      expect(fs.existsSync(path.join(sharedDir(), 'plugins', 'extra.txt'))).toBe(true);

      // Backup/staging artifacts and instance-local metadata are excluded while extra files/dirs are included
      fs.writeFileSync(path.join(sharedDir(), 'plugins', 'ignored.ccs-write-tmp'), 'tmp', 'utf8');
      const linkItems = getSharedPluginLinkItems(sharedDir());
      const itemNames = linkItems.map((item) => item.name);
      expect(itemNames).toContain('cache');
      expect(itemNames).toContain('marketplaces');
      expect(itemNames).toContain('custom-dir');
      expect(itemNames).toContain('extra.txt');
      expect(itemNames).not.toContain('known_marketplaces.json');
      expect(itemNames).not.toContain('ignored.ccs-write-tmp');

      const workPath = instanceDir('work-plugins');
      fs.mkdirSync(workPath, { recursive: true });
      // Existing instance-local plugin entry matching a shared item gets migrated/adopted safely
      const instancePlugins = path.join(workPath, 'plugins');
      fs.mkdirSync(instancePlugins, { recursive: true });
      fs.writeFileSync(path.join(instancePlugins, 'extra-local.json'), '{"local":true}', 'utf8');

      linkInstancePlugins(roots, workPath);

      expect(fs.lstatSync(path.join(instancePlugins, 'cache')).isSymbolicLink()).toBe(true);
      expect(fs.lstatSync(path.join(instancePlugins, 'extra.txt')).isSymbolicLink()).toBe(true);
      expect(fs.lstatSync(path.join(instancePlugins, 'installed_plugins.json')).isSymbolicLink()).toBe(
        true
      );
      expect(fs.existsSync(path.join(instancePlugins, 'extra-local.json'))).toBe(true);

      // Add an unlinked local file so detach cleans symlinks without deleting non-empty local files
      detachManagedPluginLayout(roots, workPath);
      expect(fs.existsSync(path.join(instancePlugins, 'cache'))).toBe(false);
      expect(fs.existsSync(path.join(instancePlugins, 'extra-local.json'))).toBe(true);

      // When only managed links exist, detach removes the plugins dir completely
      fs.rmSync(instancePlugins, { recursive: true, force: true });
      linkInstancePlugins(roots, workPath);
      detachManagedPluginLayout(roots, workPath);
      expect(fs.existsSync(instancePlugins)).toBe(false);
    });
  });
});
