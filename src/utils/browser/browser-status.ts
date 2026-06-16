import * as path from 'path';
import type {
  BrowserConfig,
  BrowserEvalMode,
  BrowserToolPolicy,
} from '../../config/unified-config-types';

import { getCcsPathDisplay } from '../config-manager';
import { getCodexBinaryInfo } from '../../targets/codex-detector';
import { type BrowserRuntimeEnv, resolveBrowserRuntimeEnv } from './chrome-reuse';
import { getBrowserMcpServerName, getBrowserMcpServerPath } from './mcp-installer';
import { getNodePlatformKey } from './platform';
import {
  buildBrowserLaunchCommands,
  buildManagedBrowserAttachSetupOptions,
  describeManagedBrowserAttachNotReady,
  ensureManagedBrowserUserDataDir,
  type BrowserLaunchCommands,
  getEffectiveClaudeBrowserAttachConfig,
  getRecommendedBrowserUserDataDir,
} from './browser-settings';
import {
  getBrowserConfig,
  hasExplicitClaudeBrowserDevtoolsPort,
  loadUnifiedConfig,
} from '../../config/config-loader-facade';

export interface ClaudeBrowserStatus {
  enabled: boolean;
  policy: BrowserToolPolicy;
  evalMode: BrowserEvalMode;
  source: 'config' | 'CCS_BROWSER_USER_DATA_DIR' | 'CCS_BROWSER_PROFILE_DIR';
  overrideActive: boolean;
  state: 'disabled' | 'path_missing' | 'browser_not_running' | 'endpoint_unreachable' | 'ready';
  title: string;
  detail: string;
  nextStep: string;
  effectiveUserDataDir: string;
  recommendedUserDataDir: string;
  devtoolsPort: number;
  managedMcpServerName: string;
  managedMcpServerPath: string;
  launchCommands: BrowserLaunchCommands;
  runtimeEnv?: BrowserRuntimeEnv;
}

export interface CodexBrowserStatus {
  enabled: boolean;
  policy: BrowserToolPolicy;
  evalMode: BrowserEvalMode;
  state: 'disabled' | 'enabled' | 'unsupported_build';
  title: string;
  detail: string;
  nextStep: string;
  serverName: string;
  supportsConfigOverrides: boolean;
  binaryPath: string | null;
  version?: string;
}

export interface BrowserStatusPayload {
  claude: ClaudeBrowserStatus;
  codex: CodexBrowserStatus;
}

export async function getBrowserStatus(): Promise<BrowserStatusPayload> {
  const browserConfig = getUserFacingBrowserConfig();
  return {
    claude: await buildClaudeBrowserStatus(browserConfig),
    codex: buildCodexBrowserStatus(browserConfig),
  };
}

type PersistedBrowserConfig = {
  claude?: Partial<BrowserConfig['claude']>;
  codex?: Partial<BrowserConfig['codex']>;
};

function resolveSafeBrowserPolicy(policy: BrowserToolPolicy | undefined): BrowserToolPolicy {
  return policy === 'auto' || policy === 'manual' ? policy : 'manual';
}

function resolveSafeBrowserEvalMode(evalMode: BrowserEvalMode | undefined): BrowserEvalMode {
  return evalMode === 'disabled' || evalMode === 'readonly' || evalMode === 'readwrite'
    ? evalMode
    : 'readonly';
}

export function getUserFacingBrowserConfig(): BrowserConfig {
  const canonical = getBrowserConfig();
  const persisted = loadUnifiedConfig()?.browser as PersistedBrowserConfig | undefined;

  if (!persisted) {
    return {
      claude: {
        ...canonical.claude,
        enabled: false,
        policy: 'manual',
        eval_mode: resolveSafeBrowserEvalMode(canonical.claude.eval_mode),
      },
      codex: {
        ...canonical.codex,
        enabled: false,
        policy: 'manual',
        eval_mode: resolveSafeBrowserEvalMode(canonical.codex.eval_mode),
      },
    };
  }

  return {
    claude: {
      ...canonical.claude,
      enabled: persisted.claude?.enabled ?? false,
      policy: resolveSafeBrowserPolicy(persisted.claude?.policy),
      eval_mode: resolveSafeBrowserEvalMode(
        persisted.claude?.eval_mode ?? canonical.claude.eval_mode
      ),
    },
    codex: {
      ...canonical.codex,
      enabled: persisted.codex?.enabled ?? false,
      policy: resolveSafeBrowserPolicy(persisted.codex?.policy),
      eval_mode: resolveSafeBrowserEvalMode(
        persisted.codex?.eval_mode ?? canonical.codex.eval_mode
      ),
    },
  };
}

async function buildClaudeBrowserStatus(
  browserConfig = getUserFacingBrowserConfig(),
  hasExplicitDevtoolsPort = hasExplicitClaudeBrowserDevtoolsPort()
): Promise<ClaudeBrowserStatus> {
  const effective = getEffectiveClaudeBrowserAttachConfig(browserConfig, process.env, {
    hasExplicitDevtoolsPort,
  });
  const launchCommands = buildBrowserLaunchCommands(effective.userDataDir, effective.devtoolsPort);
  const base: Omit<ClaudeBrowserStatus, 'state' | 'title' | 'detail' | 'nextStep'> = {
    enabled: effective.enabled,
    policy: browserConfig.claude.policy,
    evalMode: resolveSafeBrowserEvalMode(browserConfig.claude.eval_mode),
    source: effective.source,
    overrideActive: effective.overrideActive,
    effectiveUserDataDir: effective.userDataDir,
    recommendedUserDataDir: getRecommendedBrowserUserDataDir(),
    devtoolsPort: effective.devtoolsPort,
    managedMcpServerName: getBrowserMcpServerName(),
    managedMcpServerPath: getBrowserMcpServerPath(),
    launchCommands,
  };

  if (!effective.enabled) {
    return {
      ...base,
      state: 'disabled',
      title: 'Claude Browser Attach is disabled.',
      detail:
        'CCS keeps Claude Browser Attach off by default and will not provision the managed browser MCP runtime until this lane is enabled.',
      nextStep: `Enable Claude Browser Attach in Settings > Browser or in ${getCcsPathDisplay('config.yaml')}, then run \`ccs browser setup\` when you are ready to opt in.`,
    };
  }

  const managedBootstrap = ensureManagedBrowserUserDataDir(effective);

  if (managedBootstrap.createdProfileDir) {
    const managedMessage = describeManagedBrowserAttachNotReady(
      effective,
      `Chrome reuse metadata not found: ${path.join(effective.userDataDir, 'DevToolsActivePort')}`,
      {
        createdProfileDir: true,
        launchCommand: launchCommands[getNodePlatformKey()],
      }
    );
    if (managedMessage) {
      return {
        ...base,
        state: managedMessage.state,
        title: managedMessage.title,
        detail: managedMessage.detail,
        nextStep: managedMessage.nextStep,
      };
    }
  }

  try {
    const runtimeEnv = await resolveBrowserRuntimeEnv({
      profileDir: effective.userDataDir,
      devtoolsPort: effective.hasExplicitDevtoolsPort ? String(effective.devtoolsPort) : undefined,
    });

    return {
      ...base,
      state: 'ready',
      title: 'Claude Browser Attach is ready.',
      detail:
        browserConfig.claude.policy === 'manual'
          ? 'CCS can reach the configured Chrome DevTools endpoint, and the lane stays hidden until a launch uses `--browser`.'
          : 'CCS can reach the configured Chrome DevTools endpoint for the current attach session.',
      nextStep:
        browserConfig.claude.policy === 'manual'
          ? 'Launch a Claude-target CCS session with `--browser` to use the managed browser MCP runtime.'
          : 'Launch a Claude-target CCS session to use the managed browser MCP runtime.',
      runtimeEnv,
    };
  } catch (error) {
    const message = (error as Error).message;
    const managedMessage = describeManagedBrowserAttachNotReady(effective, message, {
      createdProfileDir: managedBootstrap.createdProfileDir,
      launchCommand: launchCommands[getNodePlatformKey()],
    });
    if (managedMessage) {
      return {
        ...base,
        state: managedMessage.state,
        title: managedMessage.title,
        detail: managedMessage.detail,
        nextStep: managedMessage.nextStep,
      };
    }

    if (message.includes('Chrome profile directory is invalid')) {
      return {
        ...base,
        state: 'path_missing',
        title: 'Claude Browser Attach path is missing.',
        detail: message,
        nextStep: `Create or choose a Chrome user-data directory, then launch Chrome with attach mode enabled. Example: ${launchCommands[getNodePlatformKey()]}`,
      };
    }

    if (message.includes('Chrome reuse metadata')) {
      return {
        ...base,
        state: 'browser_not_running',
        title: 'Claude Browser Attach could not find a running browser session.',
        detail: message,
        nextStep: `Start Chrome with remote debugging and the configured user-data dir. Example: ${launchCommands[getNodePlatformKey()]}`,
      };
    }

    return {
      ...base,
      state: 'endpoint_unreachable',
      title: 'Claude Browser Attach could not reach the DevTools endpoint.',
      detail: message,
      nextStep: `Restart the attach browser session or confirm the configured port. Example: ${launchCommands[getNodePlatformKey()]}`,
    };
  }
}

function buildCodexBrowserStatus(browserConfig = getUserFacingBrowserConfig()): CodexBrowserStatus {
  if (!browserConfig.codex.enabled) {
    return {
      enabled: false,
      policy: browserConfig.codex.policy,
      evalMode: resolveSafeBrowserEvalMode(browserConfig.codex.eval_mode),
      state: 'disabled',
      title: 'Codex Browser Tools are disabled.',
      detail:
        'CCS keeps Codex Browser Tools off by default and will not inject Playwright MCP browser tooling until this lane is enabled.',
      nextStep:
        'Enable Codex Browser Tools in Settings > Browser when you want browser access on Codex-target launches.',
      serverName: 'ccs_browser',
      supportsConfigOverrides: false,
      binaryPath: null,
    };
  }

  const binaryInfo = getCodexBinaryInfo({ includeVersion: true, includeFeatures: true });
  const supportsConfigOverrides = Boolean(binaryInfo?.features?.includes('config-overrides'));
  if (!binaryInfo || !supportsConfigOverrides) {
    return {
      enabled: true,
      policy: browserConfig.codex.policy,
      evalMode: resolveSafeBrowserEvalMode(browserConfig.codex.eval_mode),
      state: 'unsupported_build',
      title: 'Codex Browser Tools need a Codex build with --config override support.',
      detail: binaryInfo
        ? `Detected Codex at ${binaryInfo.path}, but it does not advertise --config overrides.`
        : 'No Codex binary was detected, so CCS cannot confirm managed browser override support.',
      nextStep: 'Install or upgrade Codex, then rerun browser status/doctor.',
      serverName: 'ccs_browser',
      supportsConfigOverrides,
      binaryPath: binaryInfo?.path ?? null,
      version: binaryInfo?.version,
    };
  }

  return {
    enabled: true,
    policy: browserConfig.codex.policy,
    evalMode: resolveSafeBrowserEvalMode(browserConfig.codex.eval_mode),
    state: 'enabled',
    title: 'Codex Browser Tools are enabled.',
    detail:
      browserConfig.codex.policy === 'manual'
        ? 'CCS can inject the managed Playwright MCP overrides when a Codex-target launch opts in with `--browser`.'
        : 'CCS can inject the managed Playwright MCP overrides into Codex-target launches.',
    nextStep:
      browserConfig.codex.policy === 'manual'
        ? 'Use `--browser` on a Codex-target CCS launch to access browser tools.'
        : 'Use a Codex-target CCS launch to access browser tools.',
    serverName: 'ccs_browser',
    supportsConfigOverrides,
    binaryPath: binaryInfo.path,
    version: binaryInfo.version,
  };
}

export function getManagedBrowserSetupHint(): string {
  return buildManagedBrowserAttachSetupOptions({
    enabled: true,
    source: 'config',
    overrideActive: false,
    userDataDir: getRecommendedBrowserUserDataDir(),
    devtoolsPort: 9222,
    hasExplicitDevtoolsPort: true,
    evalMode: 'readonly',
  }).join('\n');
}
