import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { SettingsSymlinksChecker } from '../../../src/management/checks/symlink-check';
import { HealthCheck } from '../../../src/management/checks/types';
import {
  listAccountInstanceNames,
  listAccountInstancePaths,
} from '../../../src/management/instance-directory';
import { InstancesChecker } from '../../../src/management/checks/profile-check';
import { checkInstances } from '../../../src/web-server/health/profile-checks';
import { checkSettingsSymlinks } from '../../../src/web-server/health/symlink-checks';

describe('account instance directory enumeration', () => {
  let tempRoot = '';
  let originalCcsHome: string | undefined;
  let originalCcsDir: string | undefined;

  const ccsDir = () => path.join(tempRoot, '.ccs');
  const claudeDir = () => path.join(tempRoot, '.claude');
  const instancesDir = () => path.join(ccsDir(), 'instances');

  function createValidSettingsLayout(): void {
    const claudeSettings = path.join(claudeDir(), 'settings.json');
    const sharedSettings = path.join(ccsDir(), 'shared', 'settings.json');
    const workSettings = path.join(instancesDir(), 'work', 'settings.json');

    fs.mkdirSync(path.dirname(claudeSettings), { recursive: true });
    fs.mkdirSync(path.dirname(sharedSettings), { recursive: true });
    fs.mkdirSync(path.dirname(workSettings), { recursive: true });
    fs.mkdirSync(path.join(instancesDir(), '.locks'), { recursive: true });

    fs.writeFileSync(claudeSettings, '{}\n', 'utf8');
    fs.symlinkSync(claudeSettings, sharedSettings, 'file');
    fs.symlinkSync(sharedSettings, workSettings, 'file');
  }

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-instance-directory-test-'));
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

  it('lists only user account instance directories', () => {
    fs.mkdirSync(path.join(instancesDir(), 'work'), { recursive: true });
    fs.mkdirSync(path.join(instancesDir(), 'personal'), { recursive: true });
    fs.mkdirSync(path.join(instancesDir(), '.locks'), { recursive: true });
    fs.mkdirSync(path.join(instancesDir(), '.cache'), { recursive: true });
    fs.writeFileSync(path.join(instancesDir(), 'README.txt'), 'not an instance', 'utf8');

    expect(listAccountInstanceNames(instancesDir()).sort()).toEqual(['personal', 'work']);
    expect(listAccountInstancePaths(instancesDir()).sort()).toEqual(
      [path.join(instancesDir(), 'personal'), path.join(instancesDir(), 'work')].sort()
    );
  });

  it('skips transient entries that cannot be statted', () => {
    fs.mkdirSync(path.join(instancesDir(), 'work'), { recursive: true });
    fs.symlinkSync(
      path.join(instancesDir(), 'missing-instance'),
      path.join(instancesDir(), 'transient'),
      'dir'
    );

    expect(listAccountInstanceNames(instancesDir())).toEqual(['work']);
  });

  it('keeps ccs doctor settings symlinks healthy when .locks exists', () => {
    createValidSettingsLayout();

    const results = new HealthCheck();
    new SettingsSymlinksChecker().run(results);

    expect(results.warnings).toEqual([]);
    expect(results.checks.find((check) => check.name === 'Settings Symlinks')?.status).toBe(
      'success'
    );
    expect(results.details['Settings Symlinks']?.info).toBe('1 instance(s) valid');
  });

  it('keeps ccs doctor instance counts tied to real profiles', () => {
    fs.mkdirSync(path.join(instancesDir(), 'work'), { recursive: true });
    fs.mkdirSync(path.join(instancesDir(), '.locks'), { recursive: true });

    const results = new HealthCheck();
    new InstancesChecker().run(results);

    expect(results.checks.find((check) => check.name === 'Instances')?.message).toBe(
      '1 account profiles'
    );
  });

  it('keeps dashboard health checks tied to real profiles', () => {
    createValidSettingsLayout();

    expect(checkSettingsSymlinks(ccsDir(), claudeDir())).toMatchObject({
      status: 'ok',
      message: '1 instance(s) valid',
    });
    expect(checkInstances(ccsDir())).toMatchObject({
      status: 'ok',
      message: '1 account profile',
    });
  });
});
