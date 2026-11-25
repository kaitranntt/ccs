import { afterEach, beforeEach, describe, expect, test, spyOn } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as browserUtils from '../../../src/utils/browser';
import { handleBrowserCommand } from '../../../src/commands/browser-command';
import { getBrowserConfig } from '../../../src/config/unified-config-loader';

function stripAnsi(input: string): string {
  return input.replace(/\u001b\[[0-9;]*m/g, '');
}

async function renderLines(args: string[]): Promise<string> {
  const lines: string[] = [];
  await handleBrowserCommand(args, (line) => lines.push(line));
  return stripAnsi(lines.join('\n'));
}

function currentPlatform(): 'darwin' | 'linux' | 'win32' {
  if (process.platform === 'darwin') return 'darwin';
  if (process.platform === 'win32') return 'win32';
  return 'linux';
}

describe('browser command', () => {
  let tempHome = '';
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), 'ccs-browser-command-'));
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
    rmSync(tempHome, { recursive: true, force: true });
    process.exitCode = 0;
  });

  test('status renders both browser lanes from the shared status payload', async () => {
    const statusSpy = spyOn(browserUtils, 'getBrowserStatus').mockResolvedValue({
      claude: {
        enabled: true,
        policy: 'manual',
        evalMode: 'disabled',
        source: 'config',
        overrideActive: false,
        state: 'ready',
        title: 'Claude Browser Attach is ready.',
        detail: 'CCS can reach the configured Chrome DevTools endpoint.',
        nextStep: 'Launch Claude.',
        effectiveUserDataDir: '/tmp/browser-profile',
        recommendedUserDataDir: '/tmp/browser-profile',
        devtoolsPort: 9222,
        managedMcpServerName: 'ccs-browser',
        managedMcpServerPath: '/tmp/ccs-browser-server.cjs',
        launchCommands: {
          darwin: 'open -na "Google Chrome" --args',
          linux: 'google-chrome --remote-debugging-port=9222',
          win32: 'chrome.exe --remote-debugging-port=9222',
        },
        runtimeEnv: {
          CCS_BROWSER_USER_DATA_DIR: '/tmp/browser-profile',
          CCS_BROWSER_DEVTOOLS_HOST: '127.0.0.1',
          CCS_BROWSER_DEVTOOLS_PORT: '9222',
          CCS_BROWSER_DEVTOOLS_HTTP_URL: 'http://127.0.0.1:9222',
          CCS_BROWSER_DEVTOOLS_WS_URL: 'ws://127.0.0.1/devtools/browser/test',
        },
      },
      codex: {
        enabled: true,
        policy: 'manual',
        evalMode: 'disabled',
        state: 'enabled',
        title: 'Codex Browser Tools are enabled.',
        detail: 'CCS can inject the managed Playwright MCP overrides.',
        nextStep: 'Use a Codex-target launch.',
        serverName: 'ccs_browser',
        supportsConfigOverrides: true,
        binaryPath: '/usr/local/bin/codex',
        version: 'codex-cli 0.120.0',
      },
    });

    try {
      const rendered = await renderLines(['status']);

      expect(rendered.includes('ccs browser status')).toBe(true);
      expect(rendered.includes('Claude Browser Attach reuses a local Chrome session')).toBe(true);
      expect(rendered.includes('Codex Browser Tools inject managed Playwright MCP overrides')).toBe(
        true
      );
      expect(
        rendered.includes(
          'New installs, plus upgrades without saved browser settings, keep both lanes off by default'
        )
      ).toBe(true);
      expect(rendered.includes('Managed MCP: ccs-browser')).toBe(true);
      expect(rendered.includes('Managed server: ccs_browser')).toBe(true);
      expect(rendered.includes('Policy: manual')).toBe(true);
      expect(rendered.includes('Default launch behavior: hidden until `--browser`')).toBe(true);
      expect(rendered.includes('DevTools endpoint: http://127.0.0.1:9222')).toBe(true);
    } finally {
      statusSpy.mockRestore();
    }
  });

  test('doctor prints env override context and launch guidance when Claude attach is not ready', async () => {
    const launchCommands = {
      darwin: 'open -na "Google Chrome" --args --remote-debugging-port=9444',
      linux:
        'google-chrome --remote-debugging-port=9444 --user-data-dir="/tmp/browser-profile"',
      win32: 'chrome.exe --remote-debugging-port=9444 --user-data-dir="/tmp/browser-profile"',
    };
    const statusSpy = spyOn(browserUtils, 'getBrowserStatus').mockResolvedValue({
      claude: {
        enabled: true,
        policy: 'manual',
        evalMode: 'disabled',
        source: 'CCS_BROWSER_PROFILE_DIR',
        overrideActive: true,
        state: 'browser_not_running',
        title: 'Claude Browser Attach could not find a running browser session.',
        detail: 'Chrome reuse metadata not found: /tmp/browser-profile/DevToolsActivePort',
        nextStep: 'Start Chrome with remote debugging.',
        effectiveUserDataDir: '/tmp/browser-profile',
        recommendedUserDataDir: '/tmp/browser-profile',
        devtoolsPort: 9444,
        managedMcpServerName: 'ccs-browser',
        managedMcpServerPath: '/tmp/ccs-browser-server.cjs',
        launchCommands,
      },
      codex: {
        enabled: true,
        policy: 'manual',
        evalMode: 'disabled',
        state: 'unsupported_build',
        title: 'Codex Browser Tools need a Codex build with --config override support.',
        detail: 'Detected Codex at /usr/local/bin/codex, but it does not advertise --config overrides.',
        nextStep: 'Install or upgrade Codex, then rerun browser status/doctor.',
        serverName: 'ccs_browser',
        supportsConfigOverrides: false,
        binaryPath: '/usr/local/bin/codex',
        version: 'codex-cli 0.70.0',
      },
    });

    try {
      const rendered = await renderLines(['doctor']);

      expect(rendered.includes('Result: action required')).toBe(true);
      expect(rendered.includes('Default launch behavior: hidden until `--browser`')).toBe(true);
      expect(rendered.includes('Source: CCS_BROWSER_PROFILE_DIR (env override active)')).toBe(
        true
      );
      expect(
        rendered.includes(
          `Launch command (${currentPlatform()}): ${launchCommands[currentPlatform()]}`
        )
      ).toBe(true);
      expect(rendered.includes('Detected Codex at /usr/local/bin/codex')).toBe(true);
      expect(process.exitCode).toBe(1);
    } finally {
      statusSpy.mockRestore();
    }
  });

  test('doctor stays ready on Claude-only machines when Codex is not installed', async () => {
    const statusSpy = spyOn(browserUtils, 'getBrowserStatus').mockResolvedValue({
      claude: {
        enabled: false,
        policy: 'auto',
        evalMode: 'disabled',
        source: 'config',
        overrideActive: false,
        state: 'disabled',
        title: 'Claude Browser Attach is disabled.',
        detail: 'CCS will not provision the managed browser MCP runtime for Claude launches until this lane is enabled.',
        nextStep:
          'Enable Claude Browser Attach in Settings > Browser or in ~/.ccs/config.yaml, then rerun `ccs browser doctor`.',
        effectiveUserDataDir: '/tmp/browser-profile',
        recommendedUserDataDir: '/tmp/browser-profile',
        devtoolsPort: 9222,
        managedMcpServerName: 'ccs-browser',
        managedMcpServerPath: '/tmp/ccs-browser-server.cjs',
        launchCommands: {
          darwin: 'open -na "Google Chrome" --args --remote-debugging-port=9222',
          linux:
            'google-chrome --remote-debugging-port=9222 --user-data-dir="/tmp/browser-profile"',
          win32:
            'chrome.exe --remote-debugging-port=9222 --user-data-dir="/tmp/browser-profile"',
        },
      },
      codex: {
        enabled: true,
        policy: 'auto',
        evalMode: 'disabled',
        state: 'unsupported_build',
        title: 'Codex Browser Tools need a Codex build with --config override support.',
        detail: 'No Codex binary was detected, so CCS cannot confirm managed browser override support.',
        nextStep: 'Install or upgrade Codex, then rerun browser status/doctor.',
        serverName: 'ccs_browser',
        supportsConfigOverrides: false,
        binaryPath: null,
      },
    });

    try {
      const rendered = await renderLines(['doctor']);

      expect(rendered.includes('Result: partial')).toBe(true);
      expect(rendered.includes('run `ccs browser enable`')).toBe(false);
      expect(process.exitCode).toBe(0);
    } finally {
      statusSpy.mockRestore();
    }
  });

  test('setup runs the browser setup flow and prints remediation results', async () => {
    const setupSpy = spyOn(browserUtils, 'runBrowserSetup').mockResolvedValue({
      configUpdated: true,
      createdUserDataDir: true,
      mcpReady: true,
      overrideActive: false,
      ready: true,
      launchCommand: 'open -na "Google Chrome" --args --remote-debugging-port=9222',
      status: {
        claude: {
          enabled: true,
          policy: 'auto',
        evalMode: 'disabled',
          source: 'config',
          overrideActive: false,
          state: 'ready',
          title: 'Claude Browser Attach is ready.',
          detail: 'CCS can reach the configured Chrome DevTools endpoint.',
          nextStep: 'Launch Claude.',
          effectiveUserDataDir: '/tmp/browser-profile',
          recommendedUserDataDir: '/tmp/browser-profile',
          devtoolsPort: 9222,
          managedMcpServerName: 'ccs-browser',
          managedMcpServerPath: '/tmp/ccs-browser-server.cjs',
          launchCommands: {
            darwin: 'open -na "Google Chrome" --args',
            linux: 'google-chrome --remote-debugging-port=9222',
            win32: 'chrome.exe --remote-debugging-port=9222',
          },
          runtimeEnv: {
            CCS_BROWSER_USER_DATA_DIR: '/tmp/browser-profile',
            CCS_BROWSER_DEVTOOLS_HOST: '127.0.0.1',
            CCS_BROWSER_DEVTOOLS_PORT: '9222',
            CCS_BROWSER_DEVTOOLS_HTTP_URL: 'http://127.0.0.1:9222',
            CCS_BROWSER_DEVTOOLS_WS_URL: 'ws://127.0.0.1/devtools/browser/test',
          },
        },
        codex: {
          enabled: true,
          policy: 'auto',
        evalMode: 'disabled',
          state: 'enabled',
          title: 'Codex Browser Tools are enabled.',
          detail: 'CCS can inject the managed Playwright MCP overrides.',
          nextStep: 'Use a Codex-target launch.',
          serverName: 'ccs_browser',
          supportsConfigOverrides: true,
          binaryPath: '/usr/local/bin/codex',
          version: 'codex-cli 0.120.0',
        },
      },
      notes: [],
    });

    try {
      const rendered = await renderLines(['setup']);

      expect(rendered.includes('ccs browser setup')).toBe(true);
      expect(rendered.includes('Result: ready')).toBe(true);
      expect(rendered.includes('Config updated: yes')).toBe(true);
      expect(process.exitCode).toBe(0);
    } finally {
      setupSpy.mockRestore();
    }
  });

  test('doctor rejects --fix and points users to setup', async () => {
    const rendered = await renderLines(['doctor', '--fix']);

    expect(rendered.includes('`ccs browser doctor` is read-only.')).toBe(true);
    expect(rendered.includes('Run `ccs browser setup` for the browser remediation flow.')).toBe(
      true
    );
    expect(process.exitCode).toBe(1);
  });

  test('policy shows and updates the saved browser exposure mode', async () => {
    const rendered = await renderLines(['policy', '--all', 'manual']);

    expect(rendered.includes('ccs browser policy')).toBe(true);
    expect(
      rendered.includes(
        'New installs and upgrades without saved browser settings: both lanes start disabled and manual.'
      )
    ).toBe(true);
    expect(rendered.includes('Default launch behavior: hidden until `--browser`')).toBe(true);
    expect(getBrowserConfig().claude.policy).toBe('manual');
    expect(getBrowserConfig().codex.policy).toBe('manual');
  });

  test('policy shows safe default-off browser settings on a fresh install', async () => {
    const rendered = await renderLines(['policy']);

    expect(rendered.includes('ccs browser policy')).toBe(true);
    expect(
      rendered.includes(
        'New installs and upgrades without saved browser settings: both lanes start disabled and manual.'
      )
    ).toBe(true);
    expect(rendered.includes('Claude Browser Attach')).toBe(true);
    expect(rendered.includes('Codex Browser Tools')).toBe(true);
    expect(rendered.includes('Enabled: no')).toBe(true);
    expect(rendered.includes('Policy: manual')).toBe(true);
    expect(rendered.includes('Default launch behavior: hidden until `--browser`')).toBe(true);
  });

  test('enable updates a single browser lane', async () => {
    const rendered = await renderLines(['enable', 'codex']);
    expect(rendered.includes('Updated codex browser lane.')).toBe(true);
    expect(getBrowserConfig().codex.enabled).toBe(true);
    expect(getBrowserConfig().codex.policy).toBe('manual');
  });

  test('literal browser help still renders the help page', async () => {
    const rendered = await renderLines(['help']);

    expect(rendered.includes('CCS Browser Help')).toBe(true);
    expect(rendered.includes('ccs browser setup')).toBe(true);
    expect(rendered.includes('ccs browser policy')).toBe(true);
    expect(rendered.includes('--browser')).toBe(true);
    expect(
      rendered.includes(
        'New installs and upgrades without saved browser settings keep both lanes off by default'
      )
    ).toBe(true);
  });
});
