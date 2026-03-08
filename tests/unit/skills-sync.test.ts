import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import SharedManager from '../../src/management/shared-manager';
import type { AccountContextPolicy } from '../../src/auth/account-context';

describe('SharedManager skills sync', () => {
  let tempRoot = '';
  let originalHome: string | undefined;
  let originalCcsHome: string | undefined;
  let originalCcsDir: string | undefined;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-skills-sync-test-'));
    originalHome = process.env.HOME;
    originalCcsHome = process.env.CCS_HOME;
    originalCcsDir = process.env.CCS_DIR;

    const isolatedHome = path.join(tempRoot, 'home');
    fs.mkdirSync(isolatedHome, { recursive: true });
    process.env.HOME = isolatedHome;
    process.env.CCS_HOME = tempRoot;
    delete process.env.CCS_DIR;
  });

  afterEach(() => {
    if (originalHome !== undefined) process.env.HOME = originalHome;
    else delete process.env.HOME;

    if (originalCcsHome !== undefined) process.env.CCS_HOME = originalCcsHome;
    else delete process.env.CCS_HOME;

    if (originalCcsDir !== undefined) process.env.CCS_DIR = originalCcsDir;
    else delete process.env.CCS_DIR;

    if (tempRoot && fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  function getCcsDir(): string {
    return path.join(path.resolve(tempRoot), '.ccs');
  }

  function setupInstance(): { instancePath: string; claudeDir: string; sharedDir: string } {
    const ccsDir = getCcsDir();
    const instancePath = path.join(ccsDir, 'instances', 'test-profile');
    const claudeDir = path.join(tempRoot, 'home', '.claude');
    const sharedDir = path.join(ccsDir, 'shared');

    fs.mkdirSync(instancePath, { recursive: true });
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.mkdirSync(sharedDir, { recursive: true });

    // Create shared skills dir in ~/.claude/
    const claudeSkills = path.join(claudeDir, 'skills');
    fs.mkdirSync(claudeSkills, { recursive: true });

    // Create shared symlink ~/.ccs/shared/skills -> ~/.claude/skills
    const sharedSkills = path.join(sharedDir, 'skills');
    fs.symlinkSync(claudeSkills, sharedSkills, 'dir');

    // Create initial shared symlink in instance (default state)
    const instanceSkills = path.join(instancePath, 'skills');
    fs.symlinkSync(sharedSkills, instanceSkills, 'dir');

    return { instancePath, claudeDir, sharedDir };
  }

  it('keeps shared symlink in shared mode', async () => {
    const { instancePath } = setupInstance();
    const policy: AccountContextPolicy = { mode: 'isolated', skillsMode: 'shared' };

    const manager = new SharedManager();
    await manager.syncSkills(instancePath, policy);

    const skillsPath = path.join(instancePath, 'skills');
    const stats = fs.lstatSync(skillsPath);
    expect(stats.isSymbolicLink()).toBe(true);
  });

  it('converts symlink to real directory in isolated mode', async () => {
    const { instancePath } = setupInstance();
    const policy: AccountContextPolicy = { mode: 'isolated', skillsMode: 'isolated' };

    const manager = new SharedManager();
    await manager.syncSkills(instancePath, policy);

    const skillsPath = path.join(instancePath, 'skills');
    const stats = fs.lstatSync(skillsPath);
    expect(stats.isSymbolicLink()).toBe(false);
    expect(stats.isDirectory()).toBe(true);
  });

  it('symlinks shared skills into isolated directory', async () => {
    const { instancePath, claudeDir } = setupInstance();

    // Add a shared skill to ~/.claude/skills/
    const sharedSkillDir = path.join(claudeDir, 'skills', 'my-shared-skill');
    fs.mkdirSync(sharedSkillDir, { recursive: true });
    fs.writeFileSync(path.join(sharedSkillDir, 'index.js'), 'module.exports = {}');

    const policy: AccountContextPolicy = { mode: 'isolated', skillsMode: 'isolated' };
    const manager = new SharedManager();
    await manager.syncSkills(instancePath, policy);

    const skillsPath = path.join(instancePath, 'skills');
    const linkedSkill = path.join(skillsPath, 'my-shared-skill');

    expect(fs.existsSync(linkedSkill)).toBe(true);
    const linkStats = fs.lstatSync(linkedSkill);
    expect(linkStats.isSymbolicLink()).toBe(true);
  });

  it('preserves profile-specific skills during sync', async () => {
    const { instancePath, claudeDir } = setupInstance();
    const policy: AccountContextPolicy = { mode: 'isolated', skillsMode: 'isolated' };
    const manager = new SharedManager();

    // First: switch to isolated mode
    await manager.syncSkills(instancePath, policy);

    // Simulate a profile-specific skill (added by npx skills)
    const profileSkillDir = path.join(instancePath, 'skills', 'profile-only-skill');
    fs.mkdirSync(profileSkillDir, { recursive: true });
    fs.writeFileSync(path.join(profileSkillDir, 'index.js'), 'profile-specific');

    // Add a shared skill
    const sharedSkillDir = path.join(claudeDir, 'skills', 'new-shared-skill');
    fs.mkdirSync(sharedSkillDir, { recursive: true });

    // Re-sync
    await manager.syncSkills(instancePath, policy);

    // Profile-specific skill should still exist
    expect(fs.existsSync(profileSkillDir)).toBe(true);
    expect(fs.readFileSync(path.join(profileSkillDir, 'index.js'), 'utf8')).toBe(
      'profile-specific'
    );

    // New shared skill should be linked
    const newSharedLink = path.join(instancePath, 'skills', 'new-shared-skill');
    expect(fs.existsSync(newSharedLink)).toBe(true);
    expect(fs.lstatSync(newSharedLink).isSymbolicLink()).toBe(true);
  });

  it('restores shared symlink when switching from isolated to shared', async () => {
    const { instancePath } = setupInstance();
    const manager = new SharedManager();

    // Switch to isolated
    await manager.syncSkills(instancePath, { mode: 'isolated', skillsMode: 'isolated' });
    expect(fs.lstatSync(path.join(instancePath, 'skills')).isDirectory()).toBe(true);
    expect(fs.lstatSync(path.join(instancePath, 'skills')).isSymbolicLink()).toBe(false);

    // Switch back to shared
    await manager.syncSkills(instancePath, { mode: 'isolated', skillsMode: 'shared' });
    expect(fs.lstatSync(path.join(instancePath, 'skills')).isSymbolicLink()).toBe(true);
  });

  it('handles missing ~/.claude/skills gracefully in isolated mode', async () => {
    const ccsDir = getCcsDir();
    const instancePath = path.join(ccsDir, 'instances', 'no-claude-skills');
    const claudeDir = path.join(tempRoot, 'home', '.claude');
    const sharedDir = path.join(ccsDir, 'shared');

    fs.mkdirSync(instancePath, { recursive: true });
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.mkdirSync(sharedDir, { recursive: true });

    // No ~/.claude/skills directory exists
    const policy: AccountContextPolicy = { mode: 'isolated', skillsMode: 'isolated' };
    const manager = new SharedManager();
    await manager.syncSkills(instancePath, policy);

    const skillsPath = path.join(instancePath, 'skills');
    expect(fs.existsSync(skillsPath)).toBe(true);
    expect(fs.lstatSync(skillsPath).isDirectory()).toBe(true);
  });

  it('defaults to shared mode when skillsMode is undefined', async () => {
    const { instancePath } = setupInstance();
    const policy: AccountContextPolicy = { mode: 'isolated' }; // no skillsMode

    const manager = new SharedManager();
    await manager.syncSkills(instancePath, policy);

    const skillsPath = path.join(instancePath, 'skills');
    const stats = fs.lstatSync(skillsPath);
    expect(stats.isSymbolicLink()).toBe(true);
  });
});
