import { getWebSearchConfig } from '../../config/config-loader-facade';
import { getWebSearchHookEnv } from './hook-env';

export type WebSearchConfigSnapshot = ReturnType<typeof getWebSearchConfig>;

export interface WebSearchLaunchState {
  config: WebSearchConfigSnapshot;
  /** CCS-managed WebSearch (MCP tool + steering) is active for this launch */
  enabled: boolean;
  /** Profile is listed in `websearch.native_profiles`; Claude Code's native WebSearch stays available */
  native: boolean;
  hookEnv: Record<string, string>;
}

/**
 * Resolve WebSearch behavior for one launch.
 *
 * A profile listed in `websearch.native_profiles` keeps Claude Code's native
 * WebSearch, so CCS-managed WebSearch is treated as disabled for that launch:
 * no MCP provisioning requirement, no steering prompt, and the hook is skipped.
 */
export function resolveWebSearchLaunchState(profileName?: string): WebSearchLaunchState {
  const resolvedConfig = getWebSearchConfig();
  const native = Boolean(profileName && resolvedConfig.native_profiles.includes(profileName));
  const config = native ? { ...resolvedConfig, enabled: false } : resolvedConfig;
  return {
    config,
    enabled: config.enabled,
    native,
    hookEnv: getWebSearchHookEnv(config),
  };
}
