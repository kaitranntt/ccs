import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import {
  formatEnvironmentDiagnostics,
  getEnvironmentDiagnostics,
  shouldUseHeadlessAuth,
} from '../../../src/management/environment-diagnostics';

describe('environment-diagnostics', () => {
  const originalPlatform = process.platform;
  const originalStdinIsTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  const originalStdoutIsTty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
  const savedEnv: Record<string, string | undefined> = {};

  const trackedEnvKeys = [
    'SHELL',
    'PSModulePath',
    'COMSPEC',
    'TERM_PROGRAM',
    'SSH_TTY',
    'SSH_CLIENT',
    'SSH_CONNECTION',
    'DISPLAY',
    'WAYLAND_DISPLAY',
    'WT_SESSION',
    'VSCODE_GIT_IPC_HANDLE',
    'VSCODE_IPC_HOOK_CLI',
    'CI',
    'GITHUB_ACTIONS',
    'GITLAB_CI',
    'JENKINS_URL',
  ];

  function setPlatform(value: NodeJS.Platform): void {
    Object.defineProperty(process, 'platform', { value, configurable: true });
  }

  function setTty(stdinValue: boolean | undefined, stdoutValue: boolean | undefined): void {
    Object.defineProperty(process.stdin, 'isTTY', { value: stdinValue, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: stdoutValue, configurable: true });
  }

  beforeEach(() => {
    for (const key of trackedEnvKeys) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    setPlatform(originalPlatform);

    if (originalStdinIsTty) {
      Object.defineProperty(process.stdin, 'isTTY', originalStdinIsTty);
    } else {
      delete (process.stdin as { isTTY?: boolean }).isTTY;
    }

    if (originalStdoutIsTty) {
      Object.defineProperty(process.stdout, 'isTTY', originalStdoutIsTty);
    } else {
      delete (process.stdout as { isTTY?: boolean }).isTTY;
    }

    for (const key of trackedEnvKeys) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  describe('SSH detection', () => {
    it.each([
      ['SSH_TTY', '/dev/pts/1', 'SSH_TTY set'],
      ['SSH_CLIENT', '10.0.0.1 1234 22', 'SSH_CLIENT set'],
      ['SSH_CONNECTION', '10.0.0.1 1234 10.0.0.2 22', 'SSH_CONNECTION set'],
    ])('treats %s as headless SSH session', (envKey, envValue, expectedReason) => {
      setPlatform('darwin');
      setTty(true, true);
      process.env[envKey] = envValue;

      const diag = getEnvironmentDiagnostics();

      expect(diag.sshSession).toBe(true);
      expect(diag.sshReason).toBe(expectedReason);
      expect(diag.detectedHeadless).toBe(true);
      expect(diag.headlessReasons).toEqual(['SSH session detected']);
      expect(diag.browserCapability).toBe('unlikely');
      expect(shouldUseHeadlessAuth()).toBe(true);
    });
  });

  describe('platform-specific browser & headless rules', () => {
    it('avoids Windows headless false positive even when stdin.isTTY is undefined', () => {
      setPlatform('win32');
      setTty(undefined, undefined);
      process.env.WT_SESSION = 'wt-guid';
      process.env.PSModulePath = 'C:\\Program Files\\PowerShell';

      const diag = getEnvironmentDiagnostics();

      expect(diag.platformName).toBe('Windows');
      expect(diag.shell).toBe('PowerShell');
      expect(diag.ttyStatus).toBe('undefined');
      expect(diag.stdoutTty).toBe('undefined');
      expect(diag.windowsTerminal).toBe(true);
      expect(diag.detectedHeadless).toBe(false);
      expect(diag.browserCapability).toBe('available');
      expect(diag.browserReason).toBe('Windows desktop terminal');
      expect(shouldUseHeadlessAuth()).toBe(false);
    });

    it('detects Windows COMSPEC and cmd.exe fallbacks', () => {
      setPlatform('win32');
      setTty(false, false);

      expect(getEnvironmentDiagnostics().shell).toBe('cmd.exe');

      process.env.COMSPEC = 'C:\\Windows\\System32\\cmd.exe';
      const diag = getEnvironmentDiagnostics();
      expect(diag.shell).toBe('C:\\Windows\\System32\\cmd.exe');
      expect(diag.browserReason).toBe('Windows desktop environment');
    });

    it('detects macOS interactive vs non-interactive stdin', () => {
      setPlatform('darwin');
      process.env.SHELL = '/bin/zsh';
      setTty(true, true);

      const interactive = getEnvironmentDiagnostics();
      expect(interactive.platformName).toBe('macOS');
      expect(interactive.detectedHeadless).toBe(false);
      expect(interactive.browserCapability).toBe('available');

      setTty(false, true);
      const nonInteractive = getEnvironmentDiagnostics();
      expect(nonInteractive.detectedHeadless).toBe(true);
      expect(nonInteractive.headlessReasons).toEqual(['Non-interactive stdin on macOS']);
    });

    it('detects Linux display, Wayland fallback, and headless mode', () => {
      setPlatform('linux');
      setTty(true, true);

      const noDisplay = getEnvironmentDiagnostics();
      expect(noDisplay.platformName).toBe('Linux');
      expect(noDisplay.display).toBeNull();
      expect(noDisplay.detectedHeadless).toBe(true);
      expect(noDisplay.browserCapability).toBe('unlikely');

      process.env.WAYLAND_DISPLAY = 'wayland-0';
      const waylandInteractive = getEnvironmentDiagnostics();
      expect(waylandInteractive.display).toBe('wayland-0');
      expect(waylandInteractive.detectedHeadless).toBe(false);
      expect(waylandInteractive.browserCapability).toBe('available');

      setTty(false, false);
      const waylandNonTty = getEnvironmentDiagnostics();
      expect(waylandNonTty.detectedHeadless).toBe(true);
      expect(waylandNonTty.headlessReasons).toEqual(['Non-interactive stdin on Linux']);
    });

    it('falls back to unknown browser capability and headless on unsupported platforms', () => {
      setPlatform('aix');
      setTty(true, true);

      const diag = getEnvironmentDiagnostics();
      expect(diag.platformName).toBe('aix');
      expect(diag.shell).toBe('unknown');
      expect(diag.browserCapability).toBe('unknown');
      expect(diag.detectedHeadless).toBe(true);
    });
  });

  describe('terminal and CI detection + formatting', () => {
    it('detects VS Code terminal, TERM_PROGRAM, and CI flags', () => {
      setPlatform('darwin');
      setTty(true, true);
      process.env.SHELL = '/bin/bash';
      process.env.TERM_PROGRAM = 'vscode';
      process.env.GITHUB_ACTIONS = 'true';

      const diag = getEnvironmentDiagnostics();

      expect(diag.termProgram).toBe('vscode');
      expect(diag.vsCodeTerminal).toBe(true);
      expect(diag.ciEnvironment).toBe(true);

      const formatted = formatEnvironmentDiagnostics(diag).join('\n');
      expect(formatted).toContain('Platform                macOS (darwin)');
      expect(formatted).toContain('Terminal Program        vscode');
      expect(formatted).toContain('VS Code Terminal        Yes');
      expect(formatted).toContain('CI Environment          Yes');
      expect(formatted).toContain('Browser Capability      [OK]');
      expect(formatted).toContain('Headless Mode           [OK] No');
    });

    it('formats SSH, Linux display, undefined TTY, and Windows Terminal lines', () => {
      setPlatform('linux');
      setTty(undefined, undefined);
      process.env.SSH_CLIENT = '1.2.3.4 22 22';
      process.env.WT_SESSION = '1';

      const lines = formatEnvironmentDiagnostics(getEnvironmentDiagnostics()).join('\n');

      expect(lines).toContain('Windows Terminal        Yes');
      expect(lines).toContain('SSH Session             Yes (SSH_CLIENT set)');
      expect(lines).toContain('stdin TTY               undefined [!]');
      expect(lines).toContain('Display                 Not set');
      expect(lines).toContain('Browser Capability      [!] SSH session detected');
      expect(lines).toContain('Headless Mode           [!] Yes');
      expect(lines).toContain('→ SSH session detected');
    });
  });
});
