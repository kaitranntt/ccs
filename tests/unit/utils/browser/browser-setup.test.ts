import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { UnifiedConfig } from '../../../../src/config/unified-config-types';
import {
  runBrowserSetup,
  type BrowserSetupDeps,
} from '../../../../src/utils/browser/browser-setup';

function createUnifiedConfig(userDataDir: string): UnifiedConfig {
  return {
    version: 12,
    default: undefined,
    profiles: {},
    profile_targets: {},
    copilot: {
      enabled: false,
      prompt: '',
      command: '',
      args: [],
      env: {},
      auto_install: false,
    },
    cursor: {
      enabled: false,
      model: '',
      port: 3891,
      daemon_mode: false,
      auth: {
        token: '',
      },
    },
    websearch: {
      enabled: false,
      providers: {},
    },
    browser: {
      claude: {
        enabled: false,
        user_data_dir: userDataDir,
        devtools_port: 9222,
      },
      codex: {
        enabled: true,
      },
    },
    image_analysis: {
      enabled: false,
      providers: {},
    },
    global_env: {},
    cliproxy_server: {
      mode: 'local',
      remote: {
        enabled: false,
        host: '',
        port: 0,
        protocol: 'http',
        auth_token: '',
        management_key: '',
      },
      local: {
        port: 8085,
        auto_start: true,
      },
    },
    cliproxy_safety: {
      concurrent_limit: 1,
      cooldown_seconds: 0,
      shared_responsibility: false,
    },
    quota_management: {
      enabled: false,
    },
    thinking: {
      mode: 'auto',
      show_warnings: true,
    },
    official_channels: {
      enabled: false,
      selected: [],
      unattended: false,
    },
    dashboard_auth: {
      enabled: false,
      users: [],
      session_secret: '',
    },
    logging: {
      enabled: true,
      profile_starts: true,
      delegation_calls: true,
      proxy_requests: false,
      quota_polls: false,
    },
  };
}

describe('browser setup', () => {
  let tempDir = '';
  let originalBrowserUserDataDir: string | undefined;
  let originalBrowserProfileDir: string | undefined;
  let originalBrowserDevtoolsPort: string | undefined;

  beforeEach(() => {
    originalBrowserUserDataDir = process.env.CCS_BROWSER_USER_DATA_DIR;
    originalBrowserProfileDir = process.env.CCS_BROWSER_PROFILE_DIR;
    originalBrowserDevtoolsPort = process.env.CCS_BROWSER_DEVTOOLS_PORT;
    delete process.env.CCS_BROWSER_USER_DATA_DIR;
    delete process.env.CCS_BROWSER_PROFILE_DIR;
    delete process.env.CCS_BROWSER_DEVTOOLS_PORT;
  });

  afterEach(() => {
    if (originalBrowserUserDataDir !== undefined) {
      process.env.CCS_BROWSER_USER_DATA_DIR = originalBrowserUserDataDir;
    } else {
      delete process.env.CCS_BROWSER_USER_DATA_DIR;
    }
    if (originalBrowserProfileDir !== undefined) {
      process.env.CCS_BROWSER_PROFILE_DIR = originalBrowserProfileDir;
    } else {
      delete process.env.CCS_BROWSER_PROFILE_DIR;
    }
    if (originalBrowserDevtoolsPort !== undefined) {
      process.env.CCS_BROWSER_DEVTOOLS_PORT = originalBrowserDevtoolsPort;
    } else {
      delete process.env.CCS_BROWSER_DEVTOOLS_PORT;
    }

    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('enables Claude browser attach and prepares the managed default path', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ccs-browser-setup-'));
    const config = createUnifiedConfig(join(tempDir, 'browser-profile'));
    config.browser.claude.user_data_dir = '';

    const deps: BrowserSetupDeps = {
      getBrowserConfig: () => config.browser,
      mutateConfig: (mutator) => {
        mutator(config);
        return config;
      },
      ensureBrowserMcp: () => true,
      getBrowserStatus: async () =>
        ({
          claude: {
            enabled: true,
            source: 'config',
            overrideActive: false,
            state: 'ready',
            title: 'Claude Browser Attach is ready.',
            detail: 'ready',
            nextStep: 'Launch Claude.',
            effectiveUserDataDir: config.browser.claude.user_data_dir,
            recommendedUserDataDir: config.browser.claude.user_data_dir,
            devtoolsPort: 9222,
            managedMcpServerName: 'ccs-browser',
            managedMcpServerPath: '/tmp/ccs-browser-server.cjs',
            launchCommands: {
              darwin: 'open -na "Google Chrome" --args',
              linux: 'google-chrome --remote-debugging-port=9222',
              win32: 'chrome.exe --remote-debugging-port=9222',
            },
          },
          codex: {
            enabled: true,
            state: 'enabled',
            title: 'Codex Browser Tools are enabled.',
            detail: 'ready',
            nextStep: 'Use Codex.',
            serverName: 'ccs_browser',
            supportsConfigOverrides: true,
            binaryPath: '/usr/local/bin/codex',
          },
        }) as Awaited<ReturnType<BrowserSetupDeps['getBrowserStatus']>>,
    };

    const result = await runBrowserSetup(deps);

    expect(result.configUpdated).toBe(true);
    expect(result.createdUserDataDir).toBe(true);
    expect(result.ready).toBe(true);
    expect(config.browser.claude.enabled).toBe(true);
    expect(config.browser.claude.user_data_dir).not.toBe('');
  });

  it('does not create a custom override path during setup', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ccs-browser-setup-'));
    const config = createUnifiedConfig(join(tempDir, 'browser-profile'));
    config.browser.claude.enabled = true;

    const deps: BrowserSetupDeps = {
      getBrowserConfig: () => config.browser,
      mutateConfig: (mutator) => {
        mutator(config);
        return config;
      },
      ensureBrowserMcp: () => true,
      getBrowserStatus: async () =>
        ({
          claude: {
            enabled: true,
            source: 'CCS_BROWSER_USER_DATA_DIR',
            overrideActive: true,
            state: 'browser_not_running',
            title: 'Claude Browser Attach could not find a running browser session.',
            detail: 'override active',
            nextStep: 'Run `ccs browser setup` to configure and start the managed browser session.',
            effectiveUserDataDir: config.browser.claude.user_data_dir,
            recommendedUserDataDir: config.browser.claude.user_data_dir,
            devtoolsPort: 9222,
            managedMcpServerName: 'ccs-browser',
            managedMcpServerPath: '/tmp/ccs-browser-server.cjs',
            launchCommands: {
              darwin: 'open -na "Google Chrome" --args',
              linux: 'google-chrome --remote-debugging-port=9222',
              win32: 'chrome.exe --remote-debugging-port=9222',
            },
          },
          codex: {
            enabled: true,
            state: 'enabled',
            title: 'Codex Browser Tools are enabled.',
            detail: 'ready',
            nextStep: 'Use Codex.',
            serverName: 'ccs_browser',
            supportsConfigOverrides: true,
            binaryPath: '/usr/local/bin/codex',
          },
        }) as Awaited<ReturnType<BrowserSetupDeps['getBrowserStatus']>>,
    };

    const result = await runBrowserSetup(deps);

    expect(result.createdUserDataDir).toBe(false);
    expect(result.overrideActive).toBe(false);
    expect(result.ready).toBe(false);
    expect(result.notes[0]).toContain('did not create the current browser user-data dir');
  });
});
