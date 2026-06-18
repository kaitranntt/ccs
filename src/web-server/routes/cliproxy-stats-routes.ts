/**
 * CLIProxy Stats Routes - Stats, status, models, error logs for CLIProxyAPI
 *
 * THIN BARREL. The implementation has been decomposed into focused submodules
 * under `./cliproxy-stats-routes/`. This file preserves the original public
 * surface so consumers can keep importing from 'cliproxy-stats-routes' with
 * identical signatures.
 *
 * Public surface (verified by tests + callers):
 *   - default export               : Express Router  (routes/index.ts)
 *   - shouldCacheQuotaResult       : quota cache predicate (quota-caching test)
 *   - registerCliproxyRestartRoute : restart route registrar (restart test)
 *   - resolveCliproxyUpdateCheckPayload : update-check resolver (version-fallback test)
 *   - resolveCliproxyVersionsPayload    : versions resolver (version-fallback test)
 */

export { default } from './cliproxy-stats-routes/router';
export { shouldCacheQuotaResult } from './cliproxy-stats-routes/quota-helpers';
export { registerCliproxyRestartRoute } from './cliproxy-stats-routes/restart-route';
export {
  resolveCliproxyUpdateCheckPayload,
  resolveCliproxyVersionsPayload,
} from './cliproxy-stats-routes/version-helpers';
