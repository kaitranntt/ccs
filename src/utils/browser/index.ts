/**
 * Browser Utilities
 */

export {
  getBrowserMcpServerName,
  getBrowserMcpServerPath,
  installBrowserMcpServer,
  ensureBrowserMcpConfig,
  ensureBrowserMcp,
  uninstallBrowserMcpServer,
  removeBrowserMcpConfig,
  uninstallBrowserMcp,
  syncBrowserMcpToConfigDir,
  ensureBrowserMcpOrThrow,
} from './mcp-installer';

export { appendBrowserToolArgs } from './claude-tool-args';

export {
  getRecommendedBrowserUserDataDir,
  getBrowserAttachOverride,
  getEffectiveClaudeBrowserAttachConfig,
  resolveOptionalBrowserAttachRuntime,
} from './browser-settings';
export type {
  BrowserAttachRuntimeResolution,
  EffectiveClaudeBrowserAttachConfig,
} from './browser-settings';

export {
  resolveBrowserRuntimeEnv,
  resolveDefaultChromeUserDataDir,
  resolveConfiguredBrowserProfileDir,
} from './chrome-reuse';
export type { BrowserReuseOptions, BrowserRuntimeEnv } from './chrome-reuse';

export { getBrowserStatus } from './browser-status';
export type {
  BrowserStatusPayload,
  ClaudeBrowserStatus,
  CodexBrowserStatus,
} from './browser-status';
