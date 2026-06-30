import type { BrowserConfig } from '../../config/unified-config-types';
import { getNodePlatformKey } from './platform';
import { type BrowserStatusPayload, getBrowserStatus } from './browser-status';
import { ensureBrowserMcp } from './mcp-installer';
import {
  ensureManagedBrowserUserDataDir,
  getEffectiveClaudeBrowserAttachConfig,
  getRecommendedBrowserUserDataDir,
  isManagedClaudeBrowserAttachConfig,
} from './browser-settings';
import {
  getBrowserConfig,
  hasExplicitClaudeBrowserDevtoolsPort,
  mutateConfig,
} from '../../config/config-loader-facade';

export interface BrowserSetupResult {
  configUpdated: boolean;
  createdUserDataDir: boolean;
  mcpReady: boolean;
  overrideActive: boolean;
  ready: boolean;
  launchCommand: string;
  status: BrowserStatusPayload;
  notes: string[];
}

export interface BrowserSetupDeps {
  getBrowserConfig: typeof getBrowserConfig;
  mutateConfig: typeof mutateConfig;
  ensureBrowserMcp: typeof ensureBrowserMcp;
  getBrowserStatus: typeof getBrowserStatus;
}

const defaultBrowserSetupDeps: BrowserSetupDeps = {
  getBrowserConfig,
  mutateConfig,
  ensureBrowserMcp,
  getBrowserStatus,
};

export async function runBrowserSetup(
  deps: BrowserSetupDeps = defaultBrowserSetupDeps
): Promise<BrowserSetupResult> {
  const initialConfig = deps.getBrowserConfig();
  const configUpdated = persistBrowserSetupConfig(deps, initialConfig);
  const persistedConfig = deps.getBrowserConfig();
  const effectiveConfig = getEffectiveClaudeBrowserAttachConfig(persistedConfig, process.env, {
    hasExplicitDevtoolsPort: hasExplicitClaudeBrowserDevtoolsPort(),
  });
  const createdUserDataDir = isManagedClaudeBrowserAttachConfig(effectiveConfig)
    ? ensureManagedBrowserUserDataDir(effectiveConfig).createdProfileDir
    : false;
  const mcpReady = deps.ensureBrowserMcp();
  const status = await deps.getBrowserStatus();
  const notes: string[] = [];

  if (effectiveConfig.overrideActive) {
    notes.push(
      `Current session is using ${effectiveConfig.source}; remove that override if you want saved browser settings to take effect in future shells.`
    );
  }

  if (!mcpReady) {
    notes.push('CCS could not fully prepare the local browser MCP runtime.');
  }

  if (!isManagedClaudeBrowserAttachConfig(effectiveConfig)) {
    notes.push(
      'Setup did not create the current browser user-data dir because it is not the CCS-managed default path.'
    );
  }

  const platform = getNodePlatformKey();
  return {
    configUpdated,
    createdUserDataDir,
    mcpReady,
    overrideActive: effectiveConfig.overrideActive,
    ready: status.claude.state === 'ready' && mcpReady,
    launchCommand: status.claude.launchCommands[platform],
    status,
    notes,
  };
}

function persistBrowserSetupConfig(deps: BrowserSetupDeps, currentConfig: BrowserConfig): boolean {
  const before = JSON.stringify(currentConfig);

  deps.mutateConfig((config) => {
    const existingBrowser = config.browser ?? currentConfig;
    const currentUserDataDir = existingBrowser.claude.user_data_dir?.trim();

    config.browser = {
      claude: {
        enabled: true,
        policy: existingBrowser.claude.policy,
        user_data_dir: currentUserDataDir || getRecommendedBrowserUserDataDir(),
        devtools_port: currentConfig.claude.devtools_port,
      },
      codex: {
        enabled: existingBrowser.codex.enabled,
        policy: existingBrowser.codex.policy,
      },
    };
  });

  return JSON.stringify(deps.getBrowserConfig()) !== before;
}
