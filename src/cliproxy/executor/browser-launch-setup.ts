/**
 * Browser Launch Setup — Executor-level browser initialization
 *
 * Extracted from executor/index.ts (Phase 04).
 * Handles:
 * 1. Browser launch flag resolution and override parsing
 * 2. Browser attach config + exposure resolution + blocked-override warning
 * 3. Optional browser attach runtime resolution (devtools WebSocket)
 * 4. Browser MCP ensure + sync-to-config-dir
 */

import { fail, warn } from '../../utils/ui';
import {
  type BrowserLaunchOverride,
  ensureBrowserMcpOrThrow,
  getBlockedBrowserOverrideWarning,
  getEffectiveClaudeBrowserAttachConfig,
  resolveBrowserExposure,
  resolveBrowserLaunchFlagResolution,
  resolveOptionalBrowserAttachRuntime,
  syncBrowserMcpToConfigDir,
} from '../../utils/browser';
import {
  getBrowserConfig,
  hasExplicitClaudeBrowserDevtoolsPort,
} from '../../config/config-loader-facade';

export interface BrowserLaunchSetupResult {
  /** CLI override flag if --browser-launch / --no-browser-launch was passed */
  browserLaunchOverride: BrowserLaunchOverride | undefined;
  /** args list with --browser-launch* flags removed */
  argsWithoutBrowserFlags: string[];
  /** Devtools WebSocket env vars if browser attach runtime is active */
  browserRuntimeEnv: Record<string, string> | undefined;
}

/**
 * Phase 1 — resolve browser CLI flags and attach config.
 * Call this immediately after resolveExecutorProxy so that
 * argsWithoutBrowserFlags is available for downstream parsing.
 *
 * @returns partial setup result (no async work yet)
 */
export function resolveBrowserLaunchFlags(argsWithoutProxy: string[]): {
  browserLaunchOverride: BrowserLaunchOverride | undefined;
  argsWithoutBrowserFlags: string[];
  parseFailed: boolean;
} {
  let browserLaunchOverride: BrowserLaunchOverride | undefined;
  let argsWithoutBrowserFlags = argsWithoutProxy;
  try {
    const browserLaunchFlags = resolveBrowserLaunchFlagResolution(argsWithoutProxy);
    browserLaunchOverride = browserLaunchFlags.override;
    argsWithoutBrowserFlags = browserLaunchFlags.argsWithoutFlags;
  } catch (error) {
    console.error(fail((error as Error).message));
    process.exitCode = 1;
    process.exit(1);
    return { browserLaunchOverride: undefined, argsWithoutBrowserFlags, parseFailed: true };
  }

  const browserConfig = getBrowserConfig();
  const browserAttachConfig = getEffectiveClaudeBrowserAttachConfig(browserConfig, process.env, {
    hasExplicitDevtoolsPort: hasExplicitClaudeBrowserDevtoolsPort(),
  });
  const claudeBrowserExposure = resolveBrowserExposure(
    {
      enabled: browserAttachConfig.enabled,
      policy: browserConfig.claude.policy,
    },
    browserLaunchOverride
  );
  const blockedBrowserOverrideWarning = getBlockedBrowserOverrideWarning(
    'Claude Browser Attach',
    claudeBrowserExposure
  );
  if (blockedBrowserOverrideWarning) {
    console.error(warn(blockedBrowserOverrideWarning));
  }

  return { browserLaunchOverride, argsWithoutBrowserFlags, parseFailed: false };
}

/**
 * Phase 2 — resolve async browser attach runtime and MCP setup.
 * Must be called AFTER phase-1 and AFTER ensureWebSearchMcpOrThrow().
 */
export async function resolveBrowserRuntime(
  browserLaunchOverride: BrowserLaunchOverride | undefined,
  inheritedClaudeConfigDir: string | undefined
): Promise<Pick<BrowserLaunchSetupResult, 'browserRuntimeEnv'>> {
  const browserConfig = getBrowserConfig();
  const browserAttachConfig = getEffectiveClaudeBrowserAttachConfig(browserConfig, process.env, {
    hasExplicitDevtoolsPort: hasExplicitClaudeBrowserDevtoolsPort(),
  });
  const claudeBrowserExposure = resolveBrowserExposure(
    {
      enabled: browserAttachConfig.enabled,
      policy: browserConfig.claude.policy,
    },
    browserLaunchOverride
  );

  const browserAttachRuntime =
    browserAttachConfig.enabled && claudeBrowserExposure.exposeForLaunch
      ? await resolveOptionalBrowserAttachRuntime(browserAttachConfig)
      : undefined;

  const browserRuntimeEnv = browserAttachRuntime?.runtimeEnv;
  if (browserAttachRuntime?.warning) {
    process.stderr.write(`${warn(browserAttachRuntime.warning)}\n`);
  }
  if (browserRuntimeEnv) {
    ensureBrowserMcpOrThrow();
  }

  // Sync browser MCP config into inherited Claude instance if browser is active
  if (browserRuntimeEnv && inheritedClaudeConfigDir) {
    if (!syncBrowserMcpToConfigDir(inheritedClaudeConfigDir)) {
      throw new Error(
        'Browser MCP is enabled, but CCS could not sync the browser MCP config into the inherited Claude instance.'
      );
    }
  }

  return { browserRuntimeEnv };
}
