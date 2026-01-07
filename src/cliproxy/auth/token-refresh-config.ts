/**
 * Token Refresh Configuration
 *
 * Loads token refresh worker settings from unified config.
 * Returns null if disabled or not configured.
 */

import { loadOrCreateUnifiedConfig } from '../../config/unified-config-loader';
import type { TokenRefreshSettings } from '../../config/unified-config-types';

/**
 * Get token refresh configuration from unified config
 * @returns Config if enabled, null if disabled or not configured
 */
export function getTokenRefreshConfig(): TokenRefreshSettings | null {
  const config = loadOrCreateUnifiedConfig();

  // Return null if not configured or explicitly disabled
  if (!config.cliproxy?.token_refresh?.enabled) {
    return null;
  }

  // Return config with defaults
  return {
    enabled: true,
    interval_minutes: config.cliproxy.token_refresh.interval_minutes ?? 30,
    preemptive_minutes: config.cliproxy.token_refresh.preemptive_minutes ?? 45,
    max_retries: config.cliproxy.token_refresh.max_retries ?? 3,
    verbose: config.cliproxy.token_refresh.verbose ?? false,
  };
}
