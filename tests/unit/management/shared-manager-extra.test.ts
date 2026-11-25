import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  normalizePluginMetadataContent,
  normalizePluginMetadataPathString,
  normalizePluginMetadataValue,
} from '../../../src/management/plugin-path-normalizer';
import {
  claimCanonicalFirstCopy,
  readRegularFileContent,
  recoverInterruptedClaims,
} from '../../../src/management/shared-manager/canonical-first-file-claims';
import {
  preserveCanonicalFirstDivergence,
  reconcileCanonicalFirstFile,
} from '../../../src/management/shared-manager/canonical-first-file-reconciler';
import {
  copyDirectoryFallback,
  ensureDirectory,
  fileContentsEqual,
  getConflictCopyPath,
  getLstat,
  getLstatSync,
  isPathWithinDirectory,
  moveDirectory,
  pathExists,
  removeExistingPath,
  resolveCanonicalPath,
  symlinkPointsTo,
} from '../../../src/management/shared-manager/fs-helpers';
import {
  migrateFromV311,
  migrateToSharedSettings,
} from '../../../src/management/shared-manager/migrations';
import {
  detachLegacySharedMemoryLinks,
  ensureProjectMemoryLink,
  isSafeContinuityMergeSource,
  isSafeProjectsMergeSource,
  isSymlinkTarget,
  linkDirectoryWithFallback,
  mergeDirectoryWithConflictCopies,
  resolveSymlinkTargetPath,
  type SymlinkHelperDeps,
} from '../../../src/management/shared-manager/symlink-helpers';

describe('shared-manager submodules and plugin-path-normalizer', () => {
  let tempRoot = '';
  let originalCcsHome: string | undefined;
  let originalCcsDir: string | undefined;
  const warnDeps: SymlinkHelperDeps = { warn: (msg) => `[!] ${msg}` };

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-shared-extra-test-'));
    originalCcsHome = process.env.CCS_HOME;
    originalCcsDir = process.env.CCS_DIR;
    process.env.CCS_HOME = tempRoot;
    delete process.env.CCS_DIR;

    spyOn(os, 'homedir').mockReturnValue(tempRoot);
    spyOn(console, 'log').mockImplementation(() => {});
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

  describe('plugin-path-normalizer', () => {
    it('normalizes .claude, .ccs/shared, and .ccs/instances/<name> plugin paths for POSIX and Windows', () => {
      expect(
        normalizePluginMetadataPathString(
          '/Users/alice/.ccs/instances/work/plugins/cache/my-plugin',
          '/Users/alice/.claude'
        )
      ).toBe('/Users/alice/.claude/plugins/cache/my-plugin');

      expect(
        normalizePluginMetadataPathString(
          '/Users/alice/.ccs/shared/plugins',
          '/Users/alice/.claude'
        )
      ).toBe('/Users/alice/.claude/plugins');

      expect(
        normalizePluginMetadataPathString(
          'C:\\Users\\alice\\.ccs\\instances\\work\\plugins\\marketplaces\\official',
          'C:\\Users\\alice\\.claude'
        )
      ).toBe('C:\\Users\\alice\\.claude\\plugins\\marketplaces\\official');

      expect(normalizePluginMetadataPathString('/opt/custom/path', '/Users/alice/.claude')).toBe(
        '/opt/custom/path'
      );
    });

    it('normalizes nested objects/arrays and returns original string when unchanged', () => {
      const target = path.join(tempRoot, '.claude');
      const changedPayload = {
        plugins: {
          'demo@official': [
            { installPath: path.join(tempRoot, '.ccs', 'instances', 'work', 'plugins', 'cache') },
            42,
          ],
        },
      };

      const res = normalizePluginMetadataValue(changedPayload, target);
      expect(res.changed).toBe(true);

      const originalJson = JSON.stringify({ version: 2, plugins: {} }, null, 2);
      expect(normalizePluginMetadataContent(originalJson, target)).toBe(originalJson);

      const normalizedJson = normalizePluginMetadataContent(
        JSON.stringify(changedPayload),
        target
      );
      expect(normalizedJson).toContain(path.join(target, 'plugins', 'cache'));
    });
  });

  describe('fs-helpers', () => {
    it('checks path containment, symlink targets, and canonical resolution', () => {
      const rootDir = path.join(tempRoot, 'root');
      const childDir = path.join(rootDir, 'nested', 'sub');
      const outsideDir = path.join(tempRoot, 'outside');
      fs.mkdirSync(childDir, { recursive: true });
      fs.mkdirSync(outsideDir, { recursive: true });

      expect(isPathWithinDirectory(rootDir, rootDir)).toBe(true);
      expect(isPathWithinDirectory(childDir, rootDir)).toBe(true);
      expect(isPathWithinDirectory(outsideDir, rootDir)).toBe(false);

      const linkPath = path.join(tempRoot, 'dir-link');
      fs.symlinkSync(childDir, linkPath, 'dir');
      expect(symlinkPointsTo(linkPath, childDir)).toBe(true);
      expect(symlinkPointsTo(linkPath, outsideDir)).toBe(false);
      expect(symlinkPointsTo(path.join(tempRoot, 'missing'), childDir)).toBe(false);
      expect(resolveCanonicalPath(path.join(tempRoot, 'nonexistent'))).toBe(
        path.resolve(tempRoot, 'nonexistent')
      );
    });

    it('removes files, symlinks, and directories safely', () => {
      const file = path.join(tempRoot, 'f.txt');
      const dir = path.join(tempRoot, 'd');
      const link = path.join(tempRoot, 'l');
      fs.writeFileSync(file, 'x');
      fs.mkdirSync(path.join(dir, 'inner'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'inner', 'a.txt'), 'y');
      fs.symlinkSync(file, link, 'file');

      removeExistingPath(link, 'file');
      expect(fs.existsSync(link)).toBe(false);
      expect(fs.existsSync(file)).toBe(true);

      removeExistingPath(file, 'file');
      removeExistingPath(dir, 'directory');
      removeExistingPath(path.join(tempRoot, 'already-gone'), 'file');

      expect(fs.existsSync(file)).toBe(false);
      expect(fs.existsSync(dir)).toBe(false);
    });

    it('copies directories, moves directories, compares files, and generates conflict paths', async () => {
      const src = path.join(tempRoot, 'copy-src');
      const dest = path.join(tempRoot, 'copy-dest');
      const missingSrc = path.join(tempRoot, 'missing-src');

      copyDirectoryFallback(missingSrc, dest);
      expect(fs.statSync(missingSrc).isDirectory()).toBe(true);

      fs.mkdirSync(path.join(src, 'sub'), { recursive: true });
      fs.writeFileSync(path.join(src, 'a.txt'), 'alpha');
      fs.writeFileSync(path.join(src, 'sub', 'b.txt'), 'beta');

      copyDirectoryFallback(src, dest);
      expect(await fileContentsEqual(path.join(src, 'a.txt'), path.join(dest, 'a.txt'))).toBe(
        true
      );
      fs.writeFileSync(path.join(dest, 'a.txt'), 'gamma');
      expect(await fileContentsEqual(path.join(src, 'a.txt'), path.join(dest, 'a.txt'))).toBe(
        false
      );
      expect(await fileContentsEqual(path.join(src, 'a.txt'), path.join(tempRoot, 'none'))).toBe(
        false
      );

      const moved = path.join(tempRoot, 'moved-dest');
      await moveDirectory(dest, moved);
      expect(await pathExists(dest)).toBe(false);
      expect(await pathExists(path.join(moved, 'sub', 'b.txt'))).toBe(true);

      expect(await getLstat(path.join(tempRoot, 'nope'))).toBeNull();
      expect(getLstatSync(path.join(tempRoot, 'nope'))).toBeNull();

      const targetFile = path.join(tempRoot, 'conflict.txt');
      fs.writeFileSync(targetFile, 'base');
      const firstCopy = await getConflictCopyPath(targetFile, 'Work Profile');
      expect(firstCopy).toBe(`${targetFile}.migrated-from-work-profile`);
      fs.writeFileSync(firstCopy, 'c1');
      const secondCopy = await getConflictCopyPath(targetFile, 'Work Profile');
      expect(secondCopy).toBe(`${targetFile}.migrated-from-work-profile-1`);
    });
  });

  describe('symlink-helpers', () => {
    it('creates and verifies directory links and merges directories with conflict copies', async () => {
      const target = path.join(tempRoot, 'target-dir');
      const link = path.join(tempRoot, 'link-dir');
      await ensureDirectory(target);
      await linkDirectoryWithFallback(target, link, warnDeps);

      expect(await isSymlinkTarget(link, target)).toBe(true);
      expect(await resolveSymlinkTargetPath(link)).toBe(path.resolve(target));

      const memLink = path.join(tempRoot, 'mem-link');
      const memTarget = path.join(tempRoot, 'mem-target');
      expect(await ensureProjectMemoryLink(memLink, memTarget, warnDeps)).toBe(true);
      expect(await ensureProjectMemoryLink(memLink, memTarget, warnDeps)).toBe(false);

      // Replace a regular directory occupying memLink with a symlink
      fs.unlinkSync(memLink);
      fs.mkdirSync(memLink, { recursive: true });
      fs.writeFileSync(path.join(memLink, 'old.txt'), 'old');
      expect(await ensureProjectMemoryLink(memLink, memTarget, warnDeps)).toBe(true);
      expect(await isSymlinkTarget(memLink, memTarget)).toBe(true);

      const mergeSrc = path.join(tempRoot, 'merge-src');
      const mergeDst = path.join(tempRoot, 'merge-dst');
      await ensureDirectory(path.join(mergeSrc, 'nested'));
      await ensureDirectory(path.join(mergeDst, 'nested'));
      fs.writeFileSync(path.join(mergeSrc, 'same.md'), 'same');
      fs.writeFileSync(path.join(mergeDst, 'same.md'), 'same');
      fs.writeFileSync(path.join(mergeSrc, 'nested', 'notes.md'), 'from-instance');
      fs.writeFileSync(path.join(mergeDst, 'nested', 'notes.md'), 'from-target');
      fs.writeFileSync(path.join(mergeSrc, 'new.md'), 'brand-new');

      const conflicts = await mergeDirectoryWithConflictCopies(mergeSrc, mergeDst, 'work');
      expect(conflicts).toBe(1);
      expect(fs.readFileSync(path.join(mergeDst, 'new.md'), 'utf8')).toBe('brand-new');
      expect(
        fs.readFileSync(path.join(mergeDst, 'nested', 'notes.md.migrated-from-work'), 'utf8')
      ).toBe('from-instance');
    });

    it('detaches legacy shared memory symlinks back to instance-local directories', async () => {
      const sharedDir = path.join(tempRoot, '.ccs', 'shared');
      const sharedMemoryProject = path.join(sharedDir, 'memory', 'proj-a');
      const projectsPath = path.join(tempRoot, '.ccs', 'instances', 'work', 'projects');
      const projectMemoryLink = path.join(projectsPath, 'proj-a', 'memory');

      await ensureDirectory(sharedMemoryProject);
      await ensureDirectory(path.join(projectsPath, 'proj-a'));
      fs.writeFileSync(path.join(sharedMemoryProject, 'MEMORY.md'), '# Shared memory\n');
      fs.symlinkSync(sharedMemoryProject, projectMemoryLink, 'dir');

      await detachLegacySharedMemoryLinks(projectsPath, 'work', sharedDir);

      expect(fs.lstatSync(projectMemoryLink).isSymbolicLink()).toBe(false);
      expect(fs.lstatSync(projectMemoryLink).isDirectory()).toBe(true);
      expect(fs.readFileSync(path.join(projectMemoryLink, 'MEMORY.md'), 'utf8')).toBe(
        '# Shared memory\n'
      );
    });

    it('validates safe projects and continuity merge sources', () => {
      const sharedDir = path.join(tempRoot, '.ccs', 'shared');
      const instancesDir = path.join(tempRoot, '.ccs', 'instances');
      const groupProjects = path.join(sharedDir, 'context-groups', 'team', 'projects');
      const groupContinuity = path.join(sharedDir, 'context-groups', 'team', 'continuity', 'todos');
      const instProjects = path.join(instancesDir, 'work', 'projects');
      const instTodos = path.join(instancesDir, 'work', 'todos');
      const outside = path.join(tempRoot, 'outside');

      expect(isSafeProjectsMergeSource(groupProjects, 'work', sharedDir, instancesDir)).toBe(true);
      expect(isSafeProjectsMergeSource(instProjects, 'work', sharedDir, instancesDir)).toBe(true);
      expect(isSafeProjectsMergeSource(outside, 'work', sharedDir, instancesDir)).toBe(false);

      expect(
        isSafeContinuityMergeSource(groupContinuity, 'work', 'todos', sharedDir, instancesDir)
      ).toBe(true);
      expect(
        isSafeContinuityMergeSource(instTodos, 'work', 'todos', sharedDir, instancesDir)
      ).toBe(true);
      expect(isSafeContinuityMergeSource(outside, 'work', 'todos', sharedDir, instancesDir)).toBe(
        false
      );
    });
  });

  describe('canonical-first claims, reconciler, and migrations', () => {
    it('recovers interrupted single claim and quarantines multiple claims', () => {
      const target = path.join(tempRoot, 'CLAUDE.md');
      const claim1 = `${target}.ccs-shared-claim-1`;
      fs.writeFileSync(claim1, 'recovered content', 'utf8');

      recoverInterruptedClaims(target);
      expect(fs.readFileSync(target, 'utf8')).toBe('recovered content');
      expect(readRegularFileContent(target)?.toString('utf8')).toBe('recovered content');

      const claimA = `${target}.ccs-shared-claim-2`;
      const claimB = `${target}.ccs-shared-claim-3`;
      fs.writeFileSync(claimA, 'a', 'utf8');
      fs.writeFileSync(claimB, 'b', 'utf8');

      recoverInterruptedClaims(target);
      expect(fs.existsSync(`${target}.ccs-shared-conflict`)).toBe(true);
      expect(fs.existsSync(`${target}.ccs-shared-conflict-1`)).toBe(true);
    });

    it('claims divergent copies while deduplicating identical canonical content', () => {
      const divergent = path.join(tempRoot, 'divergent.md');
      fs.writeFileSync(divergent, 'canonical', 'utf8');
      expect(claimCanonicalFirstCopy(divergent, Buffer.from('canonical'), 'match')).toBe(true);
      expect(fs.existsSync(divergent)).toBe(false);
      expect(fs.existsSync(`${divergent}.ccs-shared-conflict`)).toBe(false);

      fs.writeFileSync(divergent, 'different', 'utf8');
      expect(claimCanonicalFirstCopy(divergent, Buffer.from('canonical'), 'differs')).toBe(true);
      expect(fs.existsSync(`${divergent}.ccs-shared-conflict`)).toBe(true);
    });

    it('reconciles canonical-first files and preserves later divergence without overwriting canonical', () => {
      const claudeDir = path.join(tempRoot, '.claude');
      const sharedDir = path.join(tempRoot, '.ccs', 'shared');
      const instancesDir = path.join(tempRoot, '.ccs', 'instances');
      const instWork = path.join(instancesDir, 'work');
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.mkdirSync(sharedDir, { recursive: true });
      fs.mkdirSync(instWork, { recursive: true });

      // No canonical yet, single unique variant in shared gets adopted into canonical
      fs.writeFileSync(path.join(sharedDir, 'CLAUDE.md'), '# Adopted\n', 'utf8');
      reconcileCanonicalFirstFile({ claudeDir, sharedDir, instancesDir }, 'CLAUDE.md');
      expect(fs.readFileSync(path.join(claudeDir, 'CLAUDE.md'), 'utf8')).toBe('# Adopted\n');

      // Conflicting later divergence in instance is quarantined while canonical stays intact
      const instClaudeMd = path.join(instWork, 'CLAUDE.md');
      fs.writeFileSync(instClaudeMd, '# Diverged\n', 'utf8');
      const preserved = preserveCanonicalFirstDivergence(
        instClaudeMd,
        path.join(claudeDir, 'CLAUDE.md')
      );
      expect(preserved).toBe(true);
      expect(fs.readFileSync(path.join(claudeDir, 'CLAUDE.md'), 'utf8')).toBe('# Adopted\n');
      expect(fs.existsSync(`${instClaudeMd}.ccs-shared-conflict`)).toBe(true);
    });

    it('runs migrateFromV311 and migrateToSharedSettings cleanly in temp home', () => {
      const claudeDir = path.join(tempRoot, '.claude');
      const sharedDir = path.join(tempRoot, '.ccs', 'shared');
      const instancesDir = path.join(tempRoot, '.ccs', 'instances');
      const roots = { claudeDir, sharedDir, instancesDir };

      fs.mkdirSync(path.join(sharedDir, 'commands'), { recursive: true });
      fs.writeFileSync(path.join(sharedDir, 'commands', 'hello.md'), '# hello', 'utf8');
      fs.mkdirSync(path.join(instancesDir, 'work'), { recursive: true });
      fs.writeFileSync(path.join(instancesDir, 'work', 'settings.json'), '{"legacy":true}');

      migrateFromV311(roots);
      expect(fs.existsSync(path.join(claudeDir, 'commands', 'hello.md'))).toBe(true);
      expect(fs.lstatSync(path.join(sharedDir, 'commands')).isSymbolicLink()).toBe(true);

      // Reset work/settings.json to regular file to verify backup + symlink in migrateToSharedSettings
      const workSettings = path.join(instancesDir, 'work', 'settings.json');
      if (fs.lstatSync(workSettings).isSymbolicLink()) {
        fs.unlinkSync(workSettings);
      }
      fs.writeFileSync(workSettings, '{"isolated":true}', 'utf8');

      migrateToSharedSettings(roots);
      expect(fs.lstatSync(workSettings).isSymbolicLink()).toBe(true);
      expect(fs.readFileSync(`${workSettings}.pre-shared-migration`, 'utf8')).toBe(
        '{"isolated":true}'
      );
    });
  });
});
