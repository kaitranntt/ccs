/**
 * Environment variable builder for CLIProxy (Facade)
 * Handles env var construction, merging, and remote URL rewriting.
 */

export { buildCliproxyProviderPath, buildLocalProviderBaseUrl } from './provider-route';

export {
  type RemoteProxyRewriteConfig,
  type CompositeRemoteConfig,
  applyClaudeAutoCompactWindow,
  getModelMapping,
  getClaudeEnvVars,
} from './env-builder/shared-helpers';

export {
  resolveProviderSettingsPath,
  ensureProviderSettings,
} from './env-builder/settings-migration';

export {
  getEffectiveEnvVars,
  getRemoteEnvVars,
  getCompositeEnvVars,
} from './env-builder/env-resolvers';
