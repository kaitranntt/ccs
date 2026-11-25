import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  CLIProxyAuthChecker,
  CLIProxyBinaryChecker,
  CLIProxyConfigChecker,
  CLIProxyPortChecker,
} from '../../../src/management/checks/cliproxy-check';
import { ConfigFilesChecker } from '../../../src/management/checks/config-check';
import { EnvironmentChecker } from '../../../src/management/checks/env-check';
import { OAuthPortsChecker } from '../../../src/management/checks/oauth-check';
import {
  DelegationChecker,
  InstancesChecker,
  ProfilesChecker,
} from '../../../src/management/checks/profile-check';
import {
  CcsSymlinksChecker,
  PermissionsChecker,
  SettingsSymlinksChecker,
} from '../../../src/management/checks/symlink-check';
import { CcsDirectoryChecker, ClaudeCliChecker } from '../../../src/management/checks/system-check';
import { HealthCheck } from '../../../src/management/checks/types';
import { DOCKER_BOOTSTRAP_STATE_FILENAME } from '../../../src/docker/docker-key-rotation';

let mockPortProcessMap: Record<number, { pid: number; processName: string } | null> = {};
let mockClaudePath: string | null = null;

mock.module('../../../src/utils/port-utils', () => ({
  getPortProcess: async (port: number) => mockPortProcessMap[port] ?? null,
  isCLIProxyProcess: (proc: { processName: string } | null) =>
    Boolean(proc && proc.processName.toLowerCase().startsWith('cli-proxy')),
  checkWindowsFirewall: async () => ({ checked: false, mayBlock: false, message: 'Not Windows' }),
  testLocalhostBinding: async (port: number) => ({
    success: !mockPortProcessMap[port],
    message: mockPortProcessMap[port] ? `Port ${port} in use` : `Port ${port} available`,
  }),
  waitForPortFree: async () => true,
}));

mock.module('../../../src/utils/claude-detector', () => ({
  detectClaudeCli: () => mockClaudePath,
  getClaudeCliInfo: () => (mockClaudePath ? { path: mockClaudePath, needsShell: false } : null),
}));

async function loadDoctorClass() {
  const mod = await import(`../../../src/management/doctor?test=${Date.now()}-${Math.random()}`);
  return mod.default;
}

describe('Doctor and management health checkers', () => {
  let tempRoot = '';
  let originalCcsHome: string | undefined;
  let originalCcsDir: string | undefined;
  let originalClaudeConfigDir: string | undefined;
  let originalClaudePath: string | undefined;
  let logs: string[] = [];

  const ccsDir = () => path.join(tempRoot, '.ccs');
  const claudeDir = () => path.join(tempRoot, '.claude');

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-doctor-checks-test-'));
    originalCcsHome = process.env.CCS_HOME;
    originalCcsDir = process.env.CCS_DIR;
    originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
    originalClaudePath = process.env.CCS_CLAUDE_PATH;

    process.env.CCS_HOME = tempRoot;
    delete process.env.CCS_DIR;
    delete process.env.CLAUDE_CONFIG_DIR;
    delete process.env.CCS_CLAUDE_PATH;

    mockPortProcessMap = {};
    mockClaudePath = null;
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

    if (originalClaudeConfigDir !== undefined) {
      process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
    } else {
      delete process.env.CLAUDE_CONFIG_DIR;
    }

    if (originalClaudePath !== undefined) process.env.CCS_CLAUDE_PATH = originalClaudePath;
    else delete process.env.CCS_CLAUDE_PATH;

    if (tempRoot && fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  describe('HealthCheck container', () => {
    it('tracks checks, warnings, errors, and details cleanly', () => {
      const hc = new HealthCheck();
      expect(hc.isHealthy()).toBe(true);
      expect(hc.hasErrors()).toBe(false);
      expect(hc.hasWarnings()).toBe(false);

      hc.addCheck('A', 'success', 'fine', undefined, { status: 'OK', info: 'fine' });
      hc.addCheck('B', 'warning', 'careful', 'fix B', { status: 'WARN', info: 'careful' });
      expect(hc.hasWarnings()).toBe(true);
      expect(hc.isHealthy()).toBe(true);

      hc.addCheck('C', 'error', 'broken', 'fix C', { status: 'ERROR', info: 'broken' });
      expect(hc.hasErrors()).toBe(true);
      expect(hc.isHealthy()).toBe(false);
      expect(hc.checks).toHaveLength(3);
      expect(hc.details['C']).toEqual({ status: 'ERROR', info: 'broken' });
    });
  });

  describe('System & Environment checkers', () => {
    it('reports error when Claude CLI is missing and when CCS directory is missing', async () => {
      const results = new HealthCheck();
      await new ClaudeCliChecker().run(results);
      new CcsDirectoryChecker().run(results);

      expect(results.errors.map((e) => e.name)).toEqual(['Claude CLI', 'CCS Directory']);
      expect(results.isHealthy()).toBe(false);
    });

    it('reports OK when CCS directory exists and Claude CLI executable outputs version', async () => {
      fs.mkdirSync(ccsDir(), { recursive: true });
      const fakeBin = path.join(tempRoot, 'fake-claude.sh');
      fs.writeFileSync(fakeBin, '#!/bin/sh\necho "2.1.12 (Claude Code)"\n', 'utf8');
      fs.chmodSync(fakeBin, 0o755);
      mockClaudePath = fakeBin;

      const results = new HealthCheck();
      await new ClaudeCliChecker().run(results);
      new CcsDirectoryChecker().run(results);

      expect(results.errors).toEqual([]);
      expect(results.details['Claude CLI']?.info).toContain('v2.1.12');
      expect(results.details['CCS Directory']?.status).toBe('OK');
    });

    it('records environment check and CCS dir source', () => {
      const results = new HealthCheck();
      new EnvironmentChecker().run(results);

      expect(results.checks.some((c) => c.name === 'Environment')).toBe(true);
      expect(logs.join('\n')).toContain('CCS Dir:');
    });
  });

  describe('ConfigFilesChecker & ProfilesChecker & InstancesChecker & DelegationChecker', () => {
    it('errors when neither config.yaml nor config.json exists', () => {
      fs.mkdirSync(ccsDir(), { recursive: true });
      const results = new HealthCheck();
      new ConfigFilesChecker().run(results);

      expect(results.errors).toHaveLength(1);
      expect(results.errors[0].name).toBe('config.yaml');
      expect(results.errors[0].message).toContain('No configuration file found');
    });

    it('validates config.yaml and detects invalid YAML single-line error', () => {
      fs.mkdirSync(ccsDir(), { recursive: true });
      fs.writeFileSync(path.join(ccsDir(), 'config.yaml'), 'version: 1\nprofiles:\n  glm: {}\n');
      fs.writeFileSync(path.join(ccsDir(), 'config.json'), '{"profiles":{}}\n');

      const validResults = new HealthCheck();
      new ConfigFilesChecker().run(validResults);
      new ProfilesChecker().run(validResults);
      expect(validResults.errors).toEqual([]);
      expect(validResults.details['config.yaml']?.status).toBe('OK');
      expect(validResults.details['Profiles']?.info).toContain('1 configured');

      fs.writeFileSync(path.join(ccsDir(), 'config.yaml'), 'profiles:\n  bad: [unterminated\n');
      const invalidResults = new HealthCheck();
      new ConfigFilesChecker().run(invalidResults);
      new ProfilesChecker().run(invalidResults);
      expect(invalidResults.errors).toHaveLength(2);
      expect(invalidResults.errors[0].message).toContain('Invalid YAML:');
      expect(invalidResults.errors[1].message).toContain('Invalid config.yaml:');
    });

    it('validates legacy config.json fallback and reports missing profiles object', () => {
      fs.mkdirSync(ccsDir(), { recursive: true });
      fs.writeFileSync(path.join(ccsDir(), 'config.json'), '{"version":1}\n');

      const results = new HealthCheck();
      new ConfigFilesChecker().run(results);
      new ProfilesChecker().run(results);

      expect(results.details['config.json']?.info).toBe('Valid (legacy)');
      expect(results.errors[0].message).toContain('config.json missing profiles object');

      fs.writeFileSync(path.join(ccsDir(), 'config.json'), '{bad json');
      const badJsonResults = new HealthCheck();
      new ConfigFilesChecker().run(badJsonResults);
      new ProfilesChecker().run(badJsonResults);
      expect(badJsonResults.errors).toHaveLength(2);
    });

    it('checks optional glm.settings.json validation states', () => {
      fs.mkdirSync(ccsDir(), { recursive: true });
      fs.writeFileSync(path.join(ccsDir(), 'config.yaml'), 'version: 1\nprofiles: {}\n');
      fs.writeFileSync(path.join(ccsDir(), 'glm.settings.json'), '{broken');

      const results = new HealthCheck();
      new ConfigFilesChecker().run(results);
      expect(results.errors.some((e) => e.name === 'glm.settings.json')).toBe(true);
    });

    it('counts instances and warns when delegation commands are missing', () => {
      fs.mkdirSync(path.join(ccsDir(), 'instances', 'work'), { recursive: true });
      fs.mkdirSync(path.join(ccsDir(), 'instances', 'play'), { recursive: true });

      const results = new HealthCheck();
      new InstancesChecker().run(results);
      new DelegationChecker().run(results);

      expect(results.checks.find((c) => c.name === 'Instances')?.message).toBe(
        '2 account profiles'
      );
      expect(results.warnings.find((w) => w.name === 'Delegation')?.message).toBe(
        'Delegation commands not found'
      );
    });
  });

  describe('Symlink & Permissions checkers', () => {
    it('verifies permissions write access in CCS dir', () => {
      fs.mkdirSync(ccsDir(), { recursive: true });
      const results = new HealthCheck();
      new PermissionsChecker().run(results);

      expect(results.errors).toEqual([]);
      expect(results.details['Permissions']?.status).toBe('OK');
      expect(fs.existsSync(path.join(ccsDir(), '.permission-test'))).toBe(false);
    });

    it('reports warnings for missing, non-symlink, wrong-target, and broken instance settings.json', () => {
      fs.mkdirSync(ccsDir(), { recursive: true });
      fs.mkdirSync(claudeDir(), { recursive: true });
      const sharedSettings = path.join(ccsDir(), 'shared', 'settings.json');
      const claudeSettings = path.join(claudeDir(), 'settings.json');

      const missingResults = new HealthCheck();
      new SettingsSymlinksChecker().run(missingResults);
      expect(missingResults.warnings[0].message).toBe('Shared settings.json not found');

      fs.mkdirSync(path.dirname(sharedSettings), { recursive: true });
      fs.writeFileSync(sharedSettings, '{}');
      const nonSymlinkResults = new HealthCheck();
      new SettingsSymlinksChecker().run(nonSymlinkResults);
      expect(nonSymlinkResults.warnings[0].message).toBe('Shared settings.json is not a symlink');

      fs.unlinkSync(sharedSettings);
      const wrongTarget = path.join(tempRoot, 'wrong.json');
      fs.writeFileSync(wrongTarget, '{}');
      fs.symlinkSync(wrongTarget, sharedSettings, 'file');
      const wrongResults = new HealthCheck();
      new SettingsSymlinksChecker().run(wrongResults);
      expect(wrongResults.warnings[0].message).toBe('Shared symlink points to wrong target');

      fs.unlinkSync(sharedSettings);
      fs.writeFileSync(claudeSettings, '{}');
      fs.symlinkSync(claudeSettings, sharedSettings, 'file');
      fs.mkdirSync(path.join(ccsDir(), 'instances', 'work'), { recursive: true });
      const brokenInstResults = new HealthCheck();
      new SettingsSymlinksChecker().run(brokenInstResults);
      expect(brokenInstResults.warnings[0].message).toContain('1 instance(s) have broken symlinks');
    });

    it('handles CcsSymlinksChecker gracefully when symlinks are missing', () => {
      fs.mkdirSync(ccsDir(), { recursive: true });
      const results = new HealthCheck();
      new CcsSymlinksChecker().run(results);
      expect(results.checks.some((c) => c.name === 'CCS Symlinks')).toBe(true);
    });
  });

  describe('CLIProxy & OAuth checkers', () => {
    it('reports binary, config, auth, and port status accurately', async () => {
      fs.mkdirSync(path.join(ccsDir(), 'cliproxy'), { recursive: true });
      mockPortProcessMap[8317] = { pid: 4444, processName: 'python3' };
      mockPortProcessMap[8085] = { pid: 5555, processName: 'node' };

      const results = new HealthCheck();
      new CLIProxyBinaryChecker().run(results);
      new CLIProxyConfigChecker().run(results);
      new CLIProxyAuthChecker().run(results);
      await new CLIProxyPortChecker().run(results);
      await new OAuthPortsChecker().run(results);

      expect(results.details['CLIProxy Binary']?.status).toBe('OK');
      expect(results.details['CLIProxy Config']?.status).toBe('OK');
      expect(results.details['CLIProxy Port']?.status).toBe('WARN');
      expect(results.details['OAuth Ports']?.status).toBe('WARN');
    });

    it('reports OK when CLIProxy is running on 8317 and OAuth ports are free', async () => {
      mockPortProcessMap[8317] = { pid: 999, processName: 'cli-proxy-api-plus' };

      const results = new HealthCheck();
      await new CLIProxyPortChecker().run(results);
      await new OAuthPortsChecker().run(results);

      expect(results.details['CLIProxy Port']?.info).toContain('CLIProxy running (PID 999)');
      expect(results.details['OAuth Ports']?.status).toBe('OK');
    });
  });

  describe('Doctor orchestrator', () => {
    it('runs all checks end-to-end and generates valid JSON report', async () => {
      fs.mkdirSync(path.join(ccsDir(), 'cliproxy'), { recursive: true });
      fs.mkdirSync(claudeDir(), { recursive: true });
      fs.writeFileSync(path.join(ccsDir(), 'config.yaml'), 'version: 1\nprofiles: {}\n');

      const Doctor = await loadDoctorClass();
      const doctor = new Doctor();
      const hc = await doctor.runAllChecks();
      const json = JSON.parse(doctor.generateJsonReport()) as {
        ccsVersion: string;
        healthy: boolean;
        checks: unknown[];
      };

      expect(hc).toBeDefined();
      expect(typeof json.ccsVersion).toBe('string');
      expect(json.healthy).toBe(doctor.isHealthy());
      expect(Array.isArray(json.checks)).toBe(true);
      expect(hc.details['Docker Key Rotation']?.status).toBe('OK');
    });

    it('surfaces active docker key rotation grace and corrupted bootstrap marker warnings', async () => {
      fs.mkdirSync(path.join(ccsDir(), 'cliproxy'), { recursive: true });
      fs.writeFileSync(path.join(ccsDir(), 'config.yaml'), 'version: 1\nprofiles: {}\n');

      const statePath = path.join(ccsDir(), 'cliproxy', DOCKER_BOOTSTRAP_STATE_FILENAME);
      fs.writeFileSync(statePath, '{corrupted', 'utf8');

      const Doctor = await loadDoctorClass();
      const docCorrupted = new Doctor();
      const resCorrupted = await docCorrupted.runAllChecks();
      expect(resCorrupted.details['Docker Key Rotation']).toEqual({
        status: 'WARN',
        info: 'state marker unreadable',
      });

      const futureIso = new Date(Date.now() + 86_400_000).toISOString();
      fs.writeFileSync(
        statePath,
        JSON.stringify({
          version: 1,
          apiKey: 'new-key',
          bootstrappedAt: new Date().toISOString(),
          legacyKeyGrace: {
            legacyKey: 'old-key',
            replacementKey: 'new-key',
            startedAt: new Date().toISOString(),
            expiresAt: futureIso,
          },
        }),
        'utf8'
      );

      const docGrace = new Doctor();
      const resGrace = await docGrace.runAllChecks();
      expect(resGrace.details['Docker Key Rotation']?.status).toBe('WARN');
      expect(resGrace.details['Docker Key Rotation']?.info).toContain(futureIso);
    });

    it('recovers gracefully in safe() when a check group throws unexpectedly', async () => {
      fs.mkdirSync(ccsDir(), { recursive: true });
      // Creating config.yaml as a directory forces ConfigFilesChecker / loaders to throw
      fs.mkdirSync(path.join(ccsDir(), 'config.yaml'), { recursive: true });

      const Doctor = await loadDoctorClass();
      const doctor = new Doctor();
      const results = await doctor.runAllChecks();

      expect(results.hasErrors()).toBe(true);
      expect(doctor.isHealthy()).toBe(false);
    });
  });
});
