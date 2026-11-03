import { ConfigError } from '../../errors/error-types';
import type { AccountInfo, DrainOrderConfig } from './types';
import type { ClaudeQuotaResult } from '../quota/quota-types';
import { getProviderAccounts } from './query';
import { loadDrainOrderConfig, saveDrainOrderConfig, clearDrainOrderConfig } from './registry';
import { fetchClaudeQuota } from '../quota/quota-fetcher-claude';
import { loadOrCreateUnifiedConfig } from '../../config/config-loader-facade';
import { getProxyTarget, type ProxyTarget } from '../proxy/proxy-target-resolver';
import { detectRunningProxy } from '../proxy/proxy-detector';
import {
  createClaudePoolManagementApi,
  type ClaudePoolManagementApi,
} from './claude-pool-policy-api';
import { getClaudePoolPolicyStatePath } from './claude-pool-policy-state';

export interface ClaudePoolPolicyDependencies {
  file: string;
  now: () => number;
  target: () => ProxyTarget;
  accounts: () => AccountInfo[];
  quota: (accountId: string, signal?: AbortSignal) => Promise<ClaudeQuotaResult>;
  poolEnabled: () => boolean;
  drainOrder: () => DrainOrderConfig | undefined;
  saveDrainOrder: (config: DrainOrderConfig | null) => void;
  verifyProxy: (target: ProxyTarget) => Promise<boolean>;
  management: (target: ProxyTarget, signal?: AbortSignal) => ClaudePoolManagementApi;
  regenerate: (target: ProxyTarget) => Promise<void>;
}

export function createClaudePoolPolicyDependencies(
  overrides: Partial<ClaudePoolPolicyDependencies>
): ClaudePoolPolicyDependencies {
  return {
    file: getClaudePoolPolicyStatePath(),
    now: Date.now,
    target: getProxyTarget,
    accounts: () => getProviderAccounts('claude'),
    quota: (accountId, signal) => fetchClaudeQuota(accountId, false, signal),
    poolEnabled: () => loadOrCreateUnifiedConfig().cliproxy?.pool_routing?.enabled === true,
    drainOrder: () => loadDrainOrderConfig('claude'),
    saveDrainOrder: (config) => {
      const saved = config
        ? saveDrainOrderConfig('claude', config)
        : clearDrainOrderConfig('claude');
      if (config && !saved)
        throw new ConfigError(
          'No Claude account registry is available. Add an account before enabling quota ordering.'
        );
    },
    verifyProxy: async (target) => {
      const status = await detectRunningProxy(target.port);
      return status.running && status.verified;
    },
    management: createClaudePoolManagementApi,
    regenerate: async (target) => {
      const { regenerateConfig } = await import('../config/generator');
      regenerateConfig(target.port);
    },
    ...overrides,
  };
}
