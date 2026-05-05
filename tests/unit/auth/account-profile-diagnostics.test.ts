import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  describeSettingsSync,
  summarizeAccountHistory,
} from '../../../src/auth/account-profile-diagnostics';

describe('account profile diagnostics', () => {
  let tempHome = '';
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-account-diagnostics-'));
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) process.env.CCS_HOME = originalCcsHome;
    else delete process.env.CCS_HOME;

    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  function seedSharedSettings(instancePath: string): void {
    const claudeDir = path.join(tempHome, '.claude');
    const sharedDir = path.join(tempHome, '.ccs', 'shared');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.mkdirSync(sharedDir, { recursive: true });
    fs.mkdirSync(instancePath, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{}\n');
    fs.symlinkSync(path.join(claudeDir, 'settings.json'), path.join(sharedDir, 'settings.json'));
    fs.symlinkSync(path.join(sharedDir, 'settings.json'), path.join(instancePath, 'settings.json'));
  }

  it('reports non-bare account settings as shared with root Claude settings', () => {
    const instancePath = path.join(tempHome, '.ccs', 'instances', 'ck');
    seedSharedSettings(instancePath);

    const summary = describeSettingsSync(instancePath);

    expect(summary.state).toBe('shared');
    expect(summary.description).toBe('shared with ~/.claude/settings.json');
    expect(summary.root_settings_path).toBe(path.join(tempHome, '.claude', 'settings.json'));
  });

  it('reports bare account settings as profile-local', () => {
    const instancePath = path.join(tempHome, '.ccs', 'instances', 'bare');
    fs.mkdirSync(instancePath, { recursive: true });
    fs.writeFileSync(path.join(instancePath, 'settings.json'), '{}\n');

    const summary = describeSettingsSync(instancePath, { bare: true });

    expect(summary.state).toBe('profile-local');
    expect(summary.description).toContain('bare profile');
  });

  it('reports bare account settings as missing when the local file is absent', () => {
    const instancePath = path.join(tempHome, '.ccs', 'instances', 'bare');

    const summary = describeSettingsSync(instancePath, { bare: true });

    expect(summary.state).toBe('missing');
    expect(summary.description).toContain('bare profile');
    expect(summary.profile_settings_path).toBe(path.join(instancePath, 'settings.json'));
  });

  it('summarizes shared project and deeper continuity lane state', () => {
    const instancePath = path.join(tempHome, '.ccs', 'instances', 'ck');
    const groupRoot = path.join(tempHome, '.ccs', 'shared', 'context-groups', 'default');
    const projectsPath = path.join(groupRoot, 'projects');
    const sessionEnvPath = path.join(groupRoot, 'continuity', 'session-env');
    fs.mkdirSync(projectsPath, { recursive: true });
    fs.mkdirSync(sessionEnvPath, { recursive: true });
    fs.mkdirSync(path.join(projectsPath, 'project-a'));
    fs.mkdirSync(path.join(projectsPath, 'project-b'));
    fs.writeFileSync(path.join(sessionEnvPath, 'session-a.json'), '{}\n');
    fs.mkdirSync(instancePath, { recursive: true });
    fs.symlinkSync(projectsPath, path.join(instancePath, 'projects'), 'dir');

    for (const artifact of ['session-env', 'file-history', 'shell-snapshots', 'todos']) {
      const sharedArtifactPath = path.join(groupRoot, 'continuity', artifact);
      fs.mkdirSync(sharedArtifactPath, { recursive: true });
      fs.symlinkSync(sharedArtifactPath, path.join(instancePath, artifact), 'dir');
    }

    const summary = summarizeAccountHistory(instancePath, {
      mode: 'shared',
      group: 'default',
      continuityMode: 'deeper',
    });

    expect(summary.project_count).toBe(2);
    expect(summary.session_count).toBe(1);
    expect(summary.projects_shared).toBe(true);
    expect(summary.deeper_artifacts_shared).toBe(true);
  });
});
