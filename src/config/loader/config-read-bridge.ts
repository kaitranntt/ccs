import { ConfigError } from '../../errors/error-types';
import type { UnifiedConfig } from '../unified-config-types';

export interface ConfigReadBridge {
  loadUnifiedConfig: () => UnifiedConfig | null;
  loadOrCreateUnifiedConfig: () => UnifiedConfig;
}

let registeredBridge: ConfigReadBridge | null = null;

export function registerConfigReadBridge(bridge: ConfigReadBridge): void {
  registeredBridge = bridge;
}

export function getConfigReadBridge(): ConfigReadBridge {
  if (!registeredBridge) {
    throw new ConfigError('Unified config read bridge is not initialized');
  }
  return registeredBridge;
}
