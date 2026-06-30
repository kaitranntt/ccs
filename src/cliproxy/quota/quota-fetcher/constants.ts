/**
 * Constants for the Antigravity quota fetcher.
 *
 * Google Cloud Code internal API endpoints, fixed headers used by the
 * CLIProxyAPIPlus control-plane requests, and the shared timeout applied to
 * every Antigravity management API call.
 */

/** Google Cloud Code API endpoints */
export const ANTIGRAVITY_DAILY_API_BASE = 'https://daily-cloudcode-pa.googleapis.com';
export const ANTIGRAVITY_API_BASE = 'https://cloudcode-pa.googleapis.com';
export const ANTIGRAVITY_API_VERSION = 'v1internal';
export const ANTIGRAVITY_LOADCODEASSIST_BASE_URLS = [
  ANTIGRAVITY_DAILY_API_BASE,
  ANTIGRAVITY_API_BASE,
] as const;
export const MANAGEMENT_API_TIMEOUT_MS = 5000;

/** Headers for loadCodeAssist (matches current CLIProxyAPIPlus control-plane requests) */
export const LOADCODEASSIST_HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'antigravity/1.21.9 darwin/arm64 google-api-nodejs-client/10.3.0',
  'X-Goog-Api-Client': 'gl-node/22.21.1',
};

/** Headers for fetchAvailableModels (matches CLIProxyAPI antigravity_executor.go) */
export const FETCHMODELS_HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'antigravity/1.104.0 darwin/arm64',
};
