/**
 * Core config generation for CLIProxyAPI (Facade)
 * Handles unified config.yaml generation for all providers.
 */

export { CCS_INTERNAL_API_KEY, CCS_CONTROL_PANEL_SECRET } from '../auth/auth-constants';

export {
  CLIPROXY_CONFIG_VERSION,
  CLIPROXY_DEFAULT_HOST,
  ORIGINAL_MANAGEMENT_PANEL_REPOSITORY,
  PLUS_MANAGEMENT_PANEL_REPOSITORY,
  getProviderConfig,
  getManagementPanelRepository,
} from './generator/settings-readers';

export { parseUserApiKeys } from './generator/v8-layout-migration';

export {
  generateConfig,
  regenerateConfig,
  configNeedsRegeneration,
  configExists,
  deleteConfigForPort,
  deleteConfig,
} from './generator/config-writer';
