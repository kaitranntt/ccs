/**
 * Account Routes - CRUD operations for Claude accounts
 *
 * Uses ProfileRegistry to read from both legacy (profiles.json)
 * and unified config (config.yaml) for consistent data with CLI.
 */

import { Router, Request, Response } from 'express';
import ProfileRegistry from '../../auth/profile-registry';
import InstanceManager from '../../management/instance-manager';
import { isUnifiedMode, loadOrCreateUnifiedConfig } from '../../config/unified-config-loader';
import {
  getAllAccountsSummary,
  setDefaultAccount as setCliproxyDefault,
  getDefaultAccount as getCliproxyDefaultAccount,
  removeAccount as removeCliproxyAccount,
  bulkPauseAccounts,
  bulkResumeAccounts,
  soloAccount,
} from '../../cliproxy/account-manager';
import { formatAccountDisplayName } from '../../cliproxy/accounts/email-account-identity';
import { isCLIProxyProvider } from '../../cliproxy/provider-capabilities';
import {
  DEFAULT_ACCOUNT_CONTINUITY_MODE,
  isValidContextGroupName,
  normalizeContextGroupName,
  resolveAccountContextPolicy,
} from '../../auth/account-context';
import {
  buildCliproxyAccountKey,
  parseCliproxyKey,
  type MergedAccountEntry,
} from './account-route-helpers';
import type { AccountConfig } from '../../config/unified-config-types';

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
router.get('/', (_req: Request, res: Response): void => {
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
      };
    }

    // Override with unified config accounts (takes precedence)
    for (const [name, account] of Object.entries(unifiedAccounts)) {
      const rawAccount = rawUnifiedAccounts[name];
      const contextPolicy = resolveAccountContextPolicy(account);
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

    res.json({ accounts, default: defaultProfile });
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
    const isBare = previousUnified?.bare === true || previousLegacy?.bare === true;

    try {
      if (existsUnified) {
        registry.updateAccountUnified(name, metadata);
      }
      if (existsLegacy) {
        registry.updateProfile(name, metadata);
      }

      await instanceMgr.ensureInstance(name, policy, { bare: isBare });
    } catch (error) {
      if (existsUnified && previousUnified) {
        registry.updateAccountUnified(name, previousUnified);
      }
      if (existsLegacy && previousLegacy) {
        registry.updateProfile(name, previousLegacy);
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

export default router;
