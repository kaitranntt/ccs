/**
 * Account Routes - CRUD operations for Claude accounts
 *
 * Uses ProfileRegistry to read from both legacy (profiles.json)
 * and unified config (config.yaml) for consistent data with CLI.
 */

import { Router, Request, Response } from 'express';
import ProfileRegistry from '../../auth/profile-registry';
import InstanceManager from '../../management/instance-manager';

import {
  getAllAccountsSummary,
  setDefaultAccount as setCliproxyDefault,
  getDefaultAccount as getCliproxyDefaultAccount,
  removeAccount as removeCliproxyAccount,
  bulkPauseAccounts,
  bulkResumeAccounts,
  soloAccount,
} from '../../cliproxy/accounts/account-manager';
import { formatAccountDisplayName } from '../../cliproxy/accounts/email-account-identity';
import { isCLIProxyProvider } from '../../cliproxy/provider-capabilities';
import {
  DEFAULT_ACCOUNT_CONTINUITY_MODE,
  isValidContextGroupName,
  normalizeContextGroupName,
  resolveAccountContextPolicy,
} from '../../auth/account-context';
import {
  isSharedResourceMode,
  resolveSharedResourcePolicy,
  sharedResourceModeToMetadata,
} from '../../auth/shared-resource-policy';
import {
  buildCliproxyAccountKey,
  parseCliproxyKey,
  type MergedAccountEntry,
} from './account-route-helpers';
import type { AccountConfig } from '../../config/unified-config-types';
import { resolveConfiguredPlainCcsResumeLane } from '../../auth/resume-lane-diagnostics';
import {
  isUnifiedMode,
  loadOrCreateUnifiedConfig,
  mutateConfig,
} from '../../config/config-loader-facade';
import type { AccountTier } from '../../cliproxy/accounts/types';
import {
  isManagedQuotaProvider,
  MANAGED_QUOTA_PROVIDERS,
} from '../../cliproxy/quota/quota-manager';

/** Valid account tier values for tier-lock validation */
const VALID_ACCOUNT_TIERS: ReadonlySet<string> = new Set<AccountTier>([
  'free',
  'pro',
  'ultra',
  'unknown',
]);

const router = Router();

function createProfileRegistry(): ProfileRegistry {
  return new ProfileRegistry();
}

function createInstanceManager(): InstanceManager {
  return new InstanceManager();
}

function getUnifiedAccountsRaw(): Record<string, AccountConfig> {
  if (!isUnifiedMode()) {
    return {};
  }

  return loadOrCreateUnifiedConfig().accounts;
}

function hasAuthAccount(name: string): boolean {
  const registry = createProfileRegistry();
  return registry.hasAccountUnified(name) || registry.hasProfile(name);
}

/**
 * GET /api/accounts - List accounts from both profiles.json and config.yaml
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const registry = createProfileRegistry();

    // Get profiles from both legacy and unified config (same logic as CLI)
    const legacyProfiles = registry.getAllProfiles();
    const rawUnifiedAccounts = getUnifiedAccountsRaw();
    const unifiedAccounts = registry.getAllAccountsUnified();

    // Get CLIProxy OAuth accounts (gemini, codex, agy, etc.)
    const cliproxyAccounts = getAllAccountsSummary();

    // Merge profiles: unified config takes precedence
    const merged: Record<string, MergedAccountEntry> = {};

    // Add legacy profiles first
    for (const [name, meta] of Object.entries(legacyProfiles)) {
      const contextPolicy = resolveAccountContextPolicy(meta);
      const resourcePolicy = resolveSharedResourcePolicy(meta);
      const hasExplicitContextMode =
        meta.context_mode === 'isolated' || meta.context_mode === 'shared';
      const hasExplicitContinuityMode =
        meta.continuity_mode === 'standard' || meta.continuity_mode === 'deeper';
      merged[name] = {
        type: meta.type || 'account',
        created: meta.created,
        last_used: meta.last_used || null,
        context_mode: contextPolicy.mode,
        context_group: contextPolicy.group,
        continuity_mode: contextPolicy.mode === 'shared' ? contextPolicy.continuityMode : undefined,
        context_inferred: !hasExplicitContextMode,
        continuity_inferred:
          contextPolicy.mode === 'shared' ? !hasExplicitContinuityMode : undefined,
        shared_resource_mode: resourcePolicy.mode,
        shared_resource_inferred: resourcePolicy.inferred,
        ...(resourcePolicy.profileLocal ? { bare: true } : {}),
      };
    }

    // Override with unified config accounts (takes precedence)
    for (const [name, account] of Object.entries(unifiedAccounts)) {
      const rawAccount = rawUnifiedAccounts[name];
      const contextPolicy = resolveAccountContextPolicy(account);
      const resourcePolicy = resolveSharedResourcePolicy(account);
      const hasExplicitContextMode =
        rawAccount?.context_mode === 'isolated' || rawAccount?.context_mode === 'shared';
      const hasExplicitContinuityMode =
        rawAccount?.continuity_mode === 'standard' || rawAccount?.continuity_mode === 'deeper';
      merged[name] = {
        type: 'account',
        created: account.created,
        last_used: account.last_used,
        context_mode: contextPolicy.mode,
        context_group: contextPolicy.group,
        continuity_mode: contextPolicy.mode === 'shared' ? contextPolicy.continuityMode : undefined,
        context_inferred: !hasExplicitContextMode,
        continuity_inferred:
          contextPolicy.mode === 'shared' ? !hasExplicitContinuityMode : undefined,
        shared_resource_mode: resourcePolicy.mode,
        shared_resource_inferred: resourcePolicy.inferred,
        ...(resourcePolicy.profileLocal ? { bare: true } : {}),
      };
    }

    // Add CLIProxy OAuth accounts
    for (const [provider, accounts] of Object.entries(cliproxyAccounts)) {
      for (const acct of accounts) {
        // Skip accounts with no valid identifier
        if (!acct.id) {
          continue;
        }
        // Use unique ID for key to prevent collisions between accounts with same nickname/email
        const displayName = acct.nickname || formatAccountDisplayName(acct);
        const rawKey = `${provider}:${acct.id}`;
        const key = buildCliproxyAccountKey(rawKey, merged);
        if (!key) {
          continue;
        }
        merged[key] = {
          type: 'cliproxy',
          provider,
          displayName,
          created: acct.createdAt || new Date().toISOString(),
          last_used: null,
        };
      }
    }

    // Convert to array format
    const accounts = Object.entries(merged).map(([name, meta]) => ({
      name,
      ...meta,
    }));

    // Get default from unified config first, fallback to legacy
    const defaultProfile = registry.getDefaultUnified() ?? registry.getDefaultProfile() ?? null;
    const plainCcsLane = await resolveConfiguredPlainCcsResumeLane();

    res.json({
      accounts,
      default: defaultProfile,
      plain_ccs_lane: {
        kind: plainCcsLane.kind,
        label: plainCcsLane.label,
        account_name: plainCcsLane.accountName ?? null,
        profile_name: plainCcsLane.profileName ?? null,
        project_count: plainCcsLane.projectCount,
      },
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/accounts/default - Set default account
 */
router.post('/default', (req: Request, res: Response): void => {
  try {
    const registry = createProfileRegistry();
    const { name } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Missing required field: name' });
      return;
    }

    // Check if this is a CLIProxy account (format: "provider:accountId")
    const cliproxyKey = !hasAuthAccount(name) ? parseCliproxyKey(name) : null;
    if (cliproxyKey) {
      const success = setCliproxyDefault(cliproxyKey.provider, cliproxyKey.accountId);
      if (!success) {
        res.status(404).json({ error: `CLIProxy account not found: ${name}` });
        return;
      }
      res.json({ default: name });
      return;
    }

    // Use unified config if in unified mode, otherwise use legacy
    if (isUnifiedMode()) {
      registry.setDefaultUnified(name);
    } else {
      registry.setDefaultProfile(name);
    }

    res.json({ default: name });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * PUT /api/accounts/:name/context - Update account context mode/group
 */
router.put('/:name/context', async (req: Request, res: Response): Promise<void> => {
  try {
    const registry = createProfileRegistry();
    const instanceMgr = createInstanceManager();
    const { name } = req.params;

    if (!name) {
      res.status(400).json({ error: 'Missing account name' });
      return;
    }

    // CLIProxy OAuth accounts do not support local account context metadata.
    const cliproxyKey = !hasAuthAccount(name) ? parseCliproxyKey(name) : null;
    if (cliproxyKey) {
      res
        .status(400)
        .json({ error: `Context mode is not supported for CLIProxy account: ${name}` });
      return;
    }

    const existsUnified = isUnifiedMode() && registry.hasAccountUnified(name);
    const existsLegacy = registry.hasProfile(name);
    if (!existsUnified && !existsLegacy) {
      res.status(404).json({ error: `Account not found: ${name}` });
      return;
    }

    const mode = req.body?.context_mode;
    const rawGroup = req.body?.context_group;
    const rawContinuityMode = req.body?.continuity_mode;

    if (mode !== 'isolated' && mode !== 'shared') {
      res.status(400).json({ error: 'Missing or invalid context_mode: expected isolated|shared' });
      return;
    }

    if (mode !== 'shared' && rawGroup !== undefined) {
      res
        .status(400)
        .json({ error: 'Invalid payload: context_group requires context_mode=shared' });
      return;
    }

    if (mode !== 'shared' && rawContinuityMode !== undefined) {
      res
        .status(400)
        .json({ error: 'Invalid payload: continuity_mode requires context_mode=shared' });
      return;
    }

    let normalizedGroup: string | undefined;
    let continuityMode: 'standard' | 'deeper' | undefined;
    if (mode === 'shared') {
      if (typeof rawGroup !== 'string' || rawGroup.trim().length === 0) {
        res
          .status(400)
          .json({ error: 'Invalid payload: shared context_mode requires non-empty context_group' });
        return;
      }

      normalizedGroup = normalizeContextGroupName(rawGroup);
      if (!isValidContextGroupName(normalizedGroup)) {
        res.status(400).json({
          error:
            'Invalid context_group. Use letters/numbers/dash/underscore, start with a letter, max 64 chars.',
        });
        return;
      }

      if (
        rawContinuityMode !== undefined &&
        rawContinuityMode !== 'standard' &&
        rawContinuityMode !== 'deeper'
      ) {
        res.status(400).json({
          error: 'Invalid continuity_mode: expected standard|deeper',
        });
        return;
      }

      continuityMode = rawContinuityMode === 'deeper' ? 'deeper' : DEFAULT_ACCOUNT_CONTINUITY_MODE;
    }

    const metadata =
      mode === 'shared'
        ? {
            context_mode: 'shared' as const,
            context_group: normalizedGroup,
            continuity_mode: continuityMode,
          }
        : {
            context_mode: 'isolated' as const,
          };
    const policy = resolveAccountContextPolicy(metadata);

    const previousUnified = existsUnified ? registry.getAllAccountsUnified()[name] : undefined;
    const previousLegacy = existsLegacy ? registry.getProfile(name) : undefined;
    const resourcePolicy = resolveSharedResourcePolicy(previousUnified ?? previousLegacy);

    try {
      if (existsUnified) {
        registry.updateAccountUnified(name, metadata);
      }
      if (existsLegacy) {
        registry.updateProfile(name, metadata);
      }

      await instanceMgr.ensureInstance(name, policy, { bare: resourcePolicy.profileLocal });
    } catch (error) {
      if (existsUnified && previousUnified) {
        registry.updateAccountUnified(name, {
          ...previousUnified,
          shared_resource_mode: previousUnified.shared_resource_mode,
          bare: previousUnified.bare,
        });
      }
      if (existsLegacy && previousLegacy) {
        registry.updateProfile(name, {
          ...previousLegacy,
          shared_resource_mode: previousLegacy.shared_resource_mode,
          bare: previousLegacy.bare,
        });
      }
      throw error;
    }

    res.json({
      name,
      context_mode: policy.mode,
      context_group: policy.group ?? null,
      continuity_mode:
        policy.mode === 'shared'
          ? (policy.continuityMode ?? DEFAULT_ACCOUNT_CONTINUITY_MODE)
          : null,
      context_inferred: false,
      continuity_inferred: false,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * PUT /api/accounts/:name/shared-resources - Update account shared resource mode
 */
router.put('/:name/shared-resources', async (req: Request, res: Response): Promise<void> => {
  try {
    const registry = createProfileRegistry();
    const instanceMgr = createInstanceManager();
    const { name } = req.params;

    if (!name) {
      res.status(400).json({ error: 'Missing account name' });
      return;
    }

    const cliproxyKey = !hasAuthAccount(name) ? parseCliproxyKey(name) : null;
    if (cliproxyKey) {
      res.status(400).json({
        error: `Shared resource mode is not supported for CLIProxy account: ${name}`,
      });
      return;
    }

    const existsUnified = isUnifiedMode() && registry.hasAccountUnified(name);
    const existsLegacy = registry.hasProfile(name);
    if (!existsUnified && !existsLegacy) {
      res.status(404).json({ error: `Account not found: ${name}` });
      return;
    }

    const mode = req.body?.shared_resource_mode;
    if (!isSharedResourceMode(mode)) {
      res.status(400).json({
        error: 'Missing or invalid shared_resource_mode: expected shared|profile-local',
      });
      return;
    }

    const previousUnified = existsUnified ? registry.getAllAccountsUnified()[name] : undefined;
    const previousLegacy = existsLegacy ? registry.getProfile(name) : undefined;
    const previousMetadata = previousUnified ?? previousLegacy;
    const contextPolicy = resolveAccountContextPolicy(previousMetadata);
    const metadata = sharedResourceModeToMetadata(mode);

    try {
      if (existsUnified) {
        registry.updateAccountUnified(name, metadata);
      }
      if (existsLegacy) {
        registry.updateProfile(name, metadata);
      }

      await instanceMgr.ensureInstance(name, contextPolicy, {
        bare: mode === 'profile-local',
      });
    } catch (error) {
      if (existsUnified && previousUnified) {
        registry.updateAccountUnified(name, {
          ...previousUnified,
          shared_resource_mode: previousUnified.shared_resource_mode,
          bare: previousUnified.bare,
        });
      }
      if (existsLegacy && previousLegacy) {
        registry.updateProfile(name, {
          ...previousLegacy,
          shared_resource_mode: previousLegacy.shared_resource_mode,
          bare: previousLegacy.bare,
        });
      }
      throw error;
    }

    res.json({
      name,
      shared_resource_mode: mode,
      shared_resource_inferred: false,
      bare: mode === 'profile-local' ? true : undefined,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * DELETE /api/accounts/reset-default - Reset to CCS default
 */
router.delete('/reset-default', (_req: Request, res: Response): void => {
  try {
    const registry = createProfileRegistry();
    if (isUnifiedMode()) {
      registry.clearDefaultUnified();
    } else {
      registry.clearDefaultProfile();
    }
    res.json({ success: true, default: null });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * DELETE /api/accounts/:name - Delete an account
 */
router.delete('/:name', async (req: Request, res: Response): Promise<void> => {
  try {
    const registry = createProfileRegistry();
    const instanceMgr = createInstanceManager();
    const { name } = req.params;

    if (!name) {
      res.status(400).json({ error: 'Missing account name' });
      return;
    }

    // Check if trying to delete default (for non-CLIProxy accounts)
    const currentDefault = registry.getDefaultUnified() ?? registry.getDefaultProfile();
    if (name === currentDefault) {
      res
        .status(400)
        .json({ error: 'Cannot delete the default account. Set a different default first.' });
      return;
    }

    // Check if this is a CLIProxy account (format: "provider:accountId")
    const cliproxyKey = !hasAuthAccount(name) ? parseCliproxyKey(name) : null;
    if (cliproxyKey) {
      const defaultCliproxyAccount = getCliproxyDefaultAccount(cliproxyKey.provider);
      if (defaultCliproxyAccount?.id === cliproxyKey.accountId) {
        res.status(400).json({
          error: `Cannot delete default CLIProxy account: ${name}. Set another default first.`,
        });
        return;
      }

      const success = removeCliproxyAccount(cliproxyKey.provider, cliproxyKey.accountId);
      if (!success) {
        res.status(404).json({ error: `CLIProxy account not found: ${name}` });
        return;
      }
      res.json({ success: true, deleted: name });
      return;
    }

    const existsUnified = isUnifiedMode() && registry.hasAccountUnified(name);
    const existsLegacy = registry.hasProfile(name);

    if (!existsUnified && !existsLegacy) {
      res.status(404).json({ error: `Account not found: ${name}` });
      return;
    }

    // Match CLI remove ordering: delete instance first, metadata second.
    await instanceMgr.deleteInstance(name);

    if (existsUnified) {
      registry.removeAccountUnified(name);
    }
    if (existsLegacy) {
      registry.deleteProfile(name);
    }

    res.json({ success: true, deleted: name });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/accounts/bulk-pause - Bulk pause multiple accounts
 */
router.post('/bulk-pause', (req: Request, res: Response): void => {
  try {
    const { provider, accountIds } = req.body;

    if (!provider || !Array.isArray(accountIds)) {
      res.status(400).json({ error: 'Missing required fields: provider and accountIds (array)' });
      return;
    }

    if (!isCLIProxyProvider(provider)) {
      res.status(400).json({ error: `Invalid provider: ${provider}` });
      return;
    }

    // Allow empty arrays - return early success
    if (accountIds.length === 0) {
      res.json({ succeeded: [], failed: [] });
      return;
    }

    // Validate accountIds are non-empty strings
    const invalidIds = accountIds.filter((id) => typeof id !== 'string' || id.trim().length === 0);
    if (invalidIds.length > 0) {
      res.status(400).json({ error: 'Invalid accountIds: must be non-empty strings' });
      return;
    }

    const result = bulkPauseAccounts(provider, accountIds);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/accounts/bulk-resume - Bulk resume multiple accounts
 */
router.post('/bulk-resume', (req: Request, res: Response): void => {
  try {
    const { provider, accountIds } = req.body;

    if (!provider || !Array.isArray(accountIds)) {
      res.status(400).json({ error: 'Missing required fields: provider and accountIds (array)' });
      return;
    }

    if (!isCLIProxyProvider(provider)) {
      res.status(400).json({ error: `Invalid provider: ${provider}` });
      return;
    }

    // Allow empty arrays - return early success
    if (accountIds.length === 0) {
      res.json({ succeeded: [], failed: [] });
      return;
    }

    // Validate accountIds are non-empty strings
    const invalidIds = accountIds.filter((id) => typeof id !== 'string' || id.trim().length === 0);
    if (invalidIds.length > 0) {
      res.status(400).json({ error: 'Invalid accountIds: must be non-empty strings' });
      return;
    }

    const result = bulkResumeAccounts(provider, accountIds);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/accounts/solo - Solo mode: activate one account, pause all others
 */
router.post('/solo', async (req: Request, res: Response): Promise<void> => {
  try {
    const { provider, accountId } = req.body;

    if (!provider || !accountId) {
      res.status(400).json({ error: 'Missing required fields: provider and accountId' });
      return;
    }

    if (!isCLIProxyProvider(provider)) {
      res.status(400).json({ error: `Invalid provider: ${provider}` });
      return;
    }

    const result = await soloAccount(provider, accountId);
    if (!result) {
      res.status(404).json({ error: `Account not found: ${accountId}` });
      return;
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/accounts/tier-lock - Set or clear the tier_lock for a provider
 *
 * Body: { provider: string, tier: string | null }
 *   - tier: the tier name to lock to (e.g. "ultra", "pro"), or null to clear.
 *
 * Persists via the existing config write path (mutateConfig → quota_management.manual.tier_lock).
 * The quota-manager reads this on every preflight/findHealthyAccount call.
 */
router.post('/tier-lock', (req: Request, res: Response): void => {
  try {
    const { provider, tier } = req.body as { provider?: unknown; tier?: unknown };

    if (!provider || typeof provider !== 'string') {
      res.status(400).json({ error: 'Missing required field: provider (string)' });
      return;
    }

    if (!isCLIProxyProvider(provider)) {
      res.status(400).json({ error: `Invalid provider: ${provider}` });
      return;
    }

    // Fix #8: tier_lock is only enforced by quota-manager for managed-quota providers.
    // Locking a non-managed provider persists a silently-unenforced entry.
    // Reject with 400 to avoid misleading the caller.
    if (!isManagedQuotaProvider(provider)) {
      res.status(400).json({
        error:
          `Provider "${provider}" does not support tier-lock. ` +
          `Only managed-quota providers support it: ${[...MANAGED_QUOTA_PROVIDERS].join(', ')}.`,
      });
      return;
    }

    // tier must be explicitly present in body (key exists), and must be string or null
    if (!('tier' in req.body)) {
      res.status(400).json({ error: 'Missing required field: tier (string | null)' });
      return;
    }

    if (tier !== null && typeof tier !== 'string') {
      res.status(400).json({ error: 'Invalid tier: must be a string or null' });
      return;
    }

    // Validate tier against known AccountTier values (null means clear the lock)
    if (tier !== null && !VALID_ACCOUNT_TIERS.has(tier)) {
      res.status(400).json({
        error: `Invalid tier: "${tier}". Must be one of: ${[...VALID_ACCOUNT_TIERS].join(', ')}`,
      });
      return;
    }

    // Persist via existing config write path.
    // tier_lock is a per-provider map: { [provider]: tier | null }
    // Setting a provider's entry to null clears the lock for that provider only.
    mutateConfig((config) => {
      if (!config.quota_management) {
        config.quota_management = {
          mode: 'hybrid',
          auto: {
            preflight_check: true,
            exhaustion_threshold: 5,
            tier_priority: ['ultra', 'pro', 'free'],
            cooldown_minutes: 5,
          },
          manual: {
            paused_accounts: [],
            forced_default: null,
            tier_lock: { [provider]: tier ?? null },
          },
          runtime_monitor: {
            enabled: true,
            normal_interval_seconds: 300,
            critical_interval_seconds: 60,
            warn_threshold: 20,
            exhaustion_threshold: 5,
            cooldown_minutes: 5,
          },
        };
      } else {
        if (!config.quota_management.manual) {
          config.quota_management.manual = {
            paused_accounts: [],
            forced_default: null,
            tier_lock: { [provider]: tier ?? null },
          };
        } else {
          // Ensure config.quota_management.manual is an owned object, not a shared
          // reference from DEFAULT_MANUAL_QUOTA_CONFIG (which createEmptyUnifiedConfig
          // sets via shallow spread).  Replacing the reference prevents mutation of
          // the module-level default constant.
          config.quota_management.manual = { ...config.quota_management.manual };

          // Ensure tier_lock is a map (guard against legacy string shape or null)
          const existing = config.quota_management.manual.tier_lock;
          if (!existing || typeof existing !== 'object') {
            config.quota_management.manual.tier_lock = { [provider]: tier ?? null };
          } else {
            // Spread to own the map too before mutating it
            const ownedMap = { ...(existing as Record<string, string | null>) };
            ownedMap[provider] = tier ?? null;
            config.quota_management.manual.tier_lock = ownedMap;
          }
        }
      }
    });

    res.json({ provider, tier_lock: tier ?? null });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
