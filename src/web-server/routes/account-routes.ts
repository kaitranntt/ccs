/**
 * Account Routes - CRUD operations for Claude accounts
 *
 * Uses ProfileRegistry to read from both legacy (profiles.json)
 * and unified config (config.yaml) for consistent data with CLI.
 */

import { Router, Request, Response } from 'express';
import ProfileRegistry from '../../auth/profile-registry';
import { isUnifiedMode } from '../../config/unified-config-loader';
import {
  getAllAccountsSummary,
  setDefaultAccount as setCliproxyDefault,
  removeAccount as removeCliproxyAccount,
} from '../../cliproxy/account-manager';
import { CLIProxyProvider } from '../../cliproxy/types';

const router = Router();
const registry = new ProfileRegistry();

/** Parse CLIProxy account key format: "provider:accountId" */
function parseCliproxyKey(key: string): { provider: CLIProxyProvider; accountId: string } | null {
  const providers: CLIProxyProvider[] = ['gemini', 'codex', 'agy', 'qwen', 'iflow', 'kiro', 'ghcp'];
  const colonIndex = key.indexOf(':');
  if (colonIndex === -1) return null;

  const provider = key.slice(0, colonIndex) as CLIProxyProvider;
  const accountId = key.slice(colonIndex + 1);

  if (!providers.includes(provider) || !accountId) return null;
  return { provider, accountId };
}

/**
 * GET /api/accounts - List accounts from both profiles.json and config.yaml
 */
router.get('/', (_req: Request, res: Response): void => {
  try {
    // Get profiles from both legacy and unified config (same logic as CLI)
    const legacyProfiles = registry.getAllProfiles();
    const unifiedAccounts = registry.getAllAccountsUnified();

    // Get CLIProxy OAuth accounts (gemini, codex, agy, etc.)
    const cliproxyAccounts = getAllAccountsSummary();

    // Merge profiles: unified config takes precedence
    const merged: Record<
      string,
      {
        type: string;
        created: string;
        last_used: string | null;
        provider?: string;
        displayName?: string;
      }
    > = {};

    // Add legacy profiles first
    for (const [name, meta] of Object.entries(legacyProfiles)) {
      merged[name] = {
        type: meta.type || 'account',
        created: meta.created,
        last_used: meta.last_used || null,
      };
    }

    // Override with unified config accounts (takes precedence)
    for (const [name, account] of Object.entries(unifiedAccounts)) {
      merged[name] = {
        type: 'account',
        created: account.created,
        last_used: account.last_used,
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
        const displayName = acct.nickname || acct.email || acct.id;
        const key = `${provider}:${acct.id}`;
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
    const { name } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Missing required field: name' });
      return;
    }

    // Check if this is a CLIProxy account (format: "provider:accountId")
    const cliproxyKey = parseCliproxyKey(name);
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
 * DELETE /api/accounts/reset-default - Reset to CCS default
 */
router.delete('/reset-default', (_req: Request, res: Response): void => {
  try {
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
router.delete('/:name', (req: Request, res: Response): void => {
  try {
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
    const cliproxyKey = parseCliproxyKey(name);
    if (cliproxyKey) {
      const success = removeCliproxyAccount(cliproxyKey.provider, cliproxyKey.accountId);
      if (!success) {
        res.status(404).json({ error: `CLIProxy account not found: ${name}` });
        return;
      }
      res.json({ success: true, deleted: name });
      return;
    }

    // Delete the profile (legacy/unified)
    registry.deleteProfile(name);

    res.json({ success: true, deleted: name });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
