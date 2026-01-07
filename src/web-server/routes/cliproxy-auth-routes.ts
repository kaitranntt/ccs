/**
 * CLIProxy Auth Routes - Authentication and account management for CLIProxy providers
 */

import { Router, Request, Response } from 'express';
import {
  getAllAuthStatus,
  getOAuthConfig,
  initializeAccounts,
  triggerOAuth,
} from '../../cliproxy/auth-handler';
import {
  submitProjectSelection,
  getPendingSelection,
} from '../../cliproxy/project-selection-handler';
import {
  cancelAllSessionsForProvider,
  hasActiveSession,
} from '../../cliproxy/auth-session-manager';
import { fetchCliproxyStats } from '../../cliproxy/stats-fetcher';
import {
  getAllAccountsSummary,
  getProviderAccounts,
  setDefaultAccount as setDefaultAccountFn,
  removeAccount as removeAccountFn,
  pauseAccount as pauseAccountFn,
  resumeAccount as resumeAccountFn,
  touchAccount,
  PROVIDERS_WITHOUT_EMAIL,
  validateNickname,
} from '../../cliproxy/account-manager';
import { getProxyTarget } from '../../cliproxy/proxy-target-resolver';
import { fetchRemoteAuthStatus } from '../../cliproxy/remote-auth-fetcher';
import { loadOrCreateUnifiedConfig } from '../../config/unified-config-loader';
import { tryKiroImport } from '../../cliproxy/auth/kiro-import';
import { getProviderTokenDir } from '../../cliproxy/auth/token-manager';
import type { CLIProxyProvider } from '../../cliproxy/types';

const router = Router();

// Valid providers list
const validProviders: CLIProxyProvider[] = [
  'gemini',
  'codex',
  'agy',
  'qwen',
  'iflow',
  'kiro',
  'ghcp',
];

/**
 * GET /api/cliproxy/auth - Get auth status for built-in CLIProxy profiles
 * Also fetches CLIProxyAPI stats to update lastUsedAt for active providers
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    // Check if remote mode is enabled
    const target = getProxyTarget();
    if (target.isRemote) {
      const authStatus = await fetchRemoteAuthStatus(target);
      res.json({ authStatus, source: 'remote' });
      return;
    }

    // Local mode: Initialize accounts from existing tokens on first request
    initializeAccounts();

    // Fetch CLIProxyAPI usage stats to determine active providers
    const stats = await fetchCliproxyStats();

    // Map CLIProxyAPI provider names to our internal provider names
    const statsProviderMap: Record<string, CLIProxyProvider> = {
      gemini: 'gemini',
      antigravity: 'agy',
      codex: 'codex',
      qwen: 'qwen',
      iflow: 'iflow',
      kiro: 'kiro',
      copilot: 'ghcp', // CLIProxyAPI returns 'copilot', we map to 'ghcp'
    };

    // Update lastUsedAt for providers with recent activity
    if (stats?.requestsByProvider) {
      for (const [statsProvider, requestCount] of Object.entries(stats.requestsByProvider)) {
        if (requestCount > 0) {
          const provider = statsProviderMap[statsProvider.toLowerCase()];
          if (provider) {
            // Touch the default account for this provider (or all accounts)
            const accounts = getProviderAccounts(provider);
            for (const account of accounts) {
              // Only touch if this is the default account (most likely being used)
              if (account.isDefault) {
                touchAccount(provider, account.id);
              }
            }
          }
        }
      }
    }

    const statuses = getAllAuthStatus();

    const authStatus = statuses.map((status) => {
      const oauthConfig = getOAuthConfig(status.provider);
      return {
        provider: status.provider,
        displayName: oauthConfig.displayName,
        authenticated: status.authenticated,
        lastAuth: status.lastAuth?.toISOString() || null,
        tokenFiles: status.tokenFiles.length,
        accounts: status.accounts,
        defaultAccount: status.defaultAccount,
      };
    });

    res.json({ authStatus });
  } catch (error) {
    // Return appropriate error for remote vs local mode
    const target = getProxyTarget();
    if (target.isRemote) {
      res.status(503).json({
        error: (error as Error).message,
        authStatus: [],
        source: 'remote',
      });
    } else {
      res.status(500).json({ error: (error as Error).message });
    }
  }
});

// ==================== Account Management ====================

/**
 * GET /api/cliproxy/accounts - Get all accounts across all providers
 */
router.get('/accounts', async (_req: Request, res: Response): Promise<void> => {
  try {
    // Check if remote mode is enabled
    const target = getProxyTarget();
    if (target.isRemote) {
      const authStatus = await fetchRemoteAuthStatus(target);
      // Transform RemoteAuthStatus[] to account summary format
      const accounts = authStatus.flatMap((status) =>
        status.accounts.map((acc) => ({
          provider: status.provider,
          ...acc,
        }))
      );
      res.json({ accounts, source: 'remote' });
      return;
    }

    // Local mode: Initialize accounts from existing tokens
    initializeAccounts();

    const accounts = getAllAccountsSummary();
    res.json({ accounts });
  } catch (error) {
    const target = getProxyTarget();
    if (target.isRemote) {
      res.status(503).json({
        error: (error as Error).message,
        accounts: [],
        source: 'remote',
      });
    } else {
      const message = error instanceof Error ? error.message : 'Failed to list accounts';
      res.status(500).json({ error: message });
    }
  }
});

/**
 * GET /api/cliproxy/accounts/:provider - Get accounts for a specific provider
 */
router.get('/accounts/:provider', (req: Request, res: Response): void => {
  const { provider } = req.params;

  // Validate provider
  if (!validProviders.includes(provider as CLIProxyProvider)) {
    res.status(400).json({ error: `Invalid provider: ${provider}` });
    return;
  }

  try {
    const accounts = getProviderAccounts(provider as CLIProxyProvider);
    res.json({ provider, accounts });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get provider accounts';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/cliproxy/accounts/:provider/default - Set default account for provider
 */
router.post('/accounts/:provider/default', (req: Request, res: Response): void => {
  // Check if remote mode is enabled - account management not available
  const target = getProxyTarget();
  if (target.isRemote) {
    res.status(501).json({
      error: 'Account management not available in remote mode',
    });
    return;
  }

  const { provider } = req.params;
  const { accountId } = req.body;

  if (!accountId) {
    res.status(400).json({ error: 'Missing required field: accountId' });
    return;
  }

  // Validate provider
  if (!validProviders.includes(provider as CLIProxyProvider)) {
    res.status(400).json({ error: `Invalid provider: ${provider}` });
    return;
  }

  try {
    const success = setDefaultAccountFn(provider as CLIProxyProvider, accountId);

    if (success) {
      res.json({ provider, defaultAccount: accountId });
    } else {
      res
        .status(404)
        .json({ error: `Account '${accountId}' not found for provider '${provider}'` });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to set default account';
    res.status(500).json({ error: message });
  }
});

/**
 * DELETE /api/cliproxy/accounts/:provider/:accountId - Remove an account
 */
router.delete('/accounts/:provider/:accountId', (req: Request, res: Response): void => {
  // Check if remote mode is enabled - account management not available
  const target = getProxyTarget();
  if (target.isRemote) {
    res.status(501).json({
      error: 'Account management not available in remote mode',
    });
    return;
  }

  const { provider, accountId } = req.params;

  // Validate provider
  if (!validProviders.includes(provider as CLIProxyProvider)) {
    res.status(400).json({ error: `Invalid provider: ${provider}` });
    return;
  }

  try {
    const success = removeAccountFn(provider as CLIProxyProvider, accountId);

    if (success) {
      res.json({ provider, accountId, deleted: true });
    } else {
      res
        .status(404)
        .json({ error: `Account '${accountId}' not found for provider '${provider}'` });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to remove account';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/cliproxy/accounts/:provider/:accountId/pause - Pause an account
 * Paused accounts are skipped during quota rotation
 */
router.post('/accounts/:provider/:accountId/pause', (req: Request, res: Response): void => {
  const target = getProxyTarget();
  if (target.isRemote) {
    res.status(501).json({ error: 'Account management not available in remote mode' });
    return;
  }

  const { provider, accountId } = req.params;

  if (!validProviders.includes(provider as CLIProxyProvider)) {
    res.status(400).json({ error: `Invalid provider: ${provider}` });
    return;
  }

  try {
    const success = pauseAccountFn(provider as CLIProxyProvider, accountId);
    if (success) {
      res.json({ provider, accountId, paused: true });
    } else {
      res
        .status(404)
        .json({ error: `Account '${accountId}' not found for provider '${provider}'` });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to pause account';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/cliproxy/accounts/:provider/:accountId/resume - Resume a paused account
 */
router.post('/accounts/:provider/:accountId/resume', (req: Request, res: Response): void => {
  const target = getProxyTarget();
  if (target.isRemote) {
    res.status(501).json({ error: 'Account management not available in remote mode' });
    return;
  }

  const { provider, accountId } = req.params;

  if (!validProviders.includes(provider as CLIProxyProvider)) {
    res.status(400).json({ error: `Invalid provider: ${provider}` });
    return;
  }

  try {
    const success = resumeAccountFn(provider as CLIProxyProvider, accountId);
    if (success) {
      res.json({ provider, accountId, paused: false });
    } else {
      res
        .status(404)
        .json({ error: `Account '${accountId}' not found for provider '${provider}'` });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to resume account';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/cliproxy/auth/:provider/start - Start OAuth flow for a provider
 * Opens browser for authentication and returns account info when complete
 */
router.post('/:provider/start', async (req: Request, res: Response): Promise<void> => {
  const { provider } = req.params;
  const { nickname: nicknameRaw, noIncognito: noIncognitoBody } = req.body;
  // Trim nickname for consistency with CLI (oauth-handler.ts trims input)
  const nickname = typeof nicknameRaw === 'string' ? nicknameRaw.trim() : nicknameRaw;

  // Validate provider
  if (!validProviders.includes(provider as CLIProxyProvider)) {
    res.status(400).json({ error: `Invalid provider: ${provider}` });
    return;
  }

  // For kiro/ghcp: nickname is required
  if (PROVIDERS_WITHOUT_EMAIL.includes(provider as CLIProxyProvider)) {
    if (!nickname) {
      res.status(400).json({
        error: `Nickname is required for ${provider} accounts. Please provide a unique nickname.`,
        code: 'NICKNAME_REQUIRED',
      });
      return;
    }

    const validationError = validateNickname(nickname);
    if (validationError) {
      res.status(400).json({
        error: validationError,
        code: 'INVALID_NICKNAME',
      });
      return;
    }

    // Check uniqueness
    const existingAccounts = getProviderAccounts(provider as CLIProxyProvider);
    const existingNicknames = existingAccounts.map(
      (a) => a.nickname?.toLowerCase() || a.id.toLowerCase()
    );
    if (existingNicknames.includes(nickname.toLowerCase())) {
      res.status(400).json({
        error: `Nickname "${nickname}" is already in use. Choose a different one.`,
        code: 'NICKNAME_EXISTS',
      });
      return;
    }
  }

  // Check Kiro no-incognito setting from config (or request body)
  // Default to true (use normal browser) for reliability - incognito often fails
  let noIncognito = true;
  if (provider === 'kiro') {
    const config = loadOrCreateUnifiedConfig();
    noIncognito = noIncognitoBody ?? config.cliproxy?.kiro_no_incognito ?? true;
  }

  try {
    // Trigger OAuth flow - this opens browser and waits for completion
    const account = await triggerOAuth(provider as CLIProxyProvider, {
      add: true, // Always add mode from UI
      headless: false, // Force interactive mode
      nickname: nickname || undefined,
      fromUI: true, // Enable project selection prompt in UI
      noIncognito, // Kiro: use normal browser if enabled
    });

    if (account) {
      res.json({
        success: true,
        account: {
          id: account.id,
          email: account.email,
          nickname: account.nickname,
          provider: account.provider,
          isDefault: account.isDefault,
        },
      });
    } else {
      res.status(400).json({ error: 'Authentication failed or was cancelled' });
    }
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/cliproxy/auth/:provider/cancel - Cancel in-progress OAuth flow
 * Terminates the OAuth process for the specified provider
 */
router.post('/:provider/cancel', (req: Request, res: Response): void => {
  const { provider } = req.params;

  // Validate provider
  if (!validProviders.includes(provider as CLIProxyProvider)) {
    res.status(400).json({ error: `Invalid provider: ${provider}` });
    return;
  }

  // Check if there's an active session
  if (!hasActiveSession(provider)) {
    res.status(404).json({ error: 'No active authentication session for this provider' });
    return;
  }

  // Cancel all sessions for this provider
  const cancelledCount = cancelAllSessionsForProvider(provider);

  res.json({
    success: true,
    cancelled: cancelledCount,
    provider,
  });
});

/**
 * GET /api/cliproxy/auth/project-selection/:sessionId - Get pending project selection prompt
 * Returns project list for user to select from during OAuth flow
 */
router.get('/project-selection/:sessionId', (req: Request, res: Response): void => {
  const { sessionId } = req.params;

  const pending = getPendingSelection(sessionId);
  if (pending) {
    res.json(pending);
  } else {
    res.status(404).json({ error: 'No pending project selection for this session' });
  }
});

/**
 * POST /api/cliproxy/auth/project-selection/:sessionId - Submit project selection
 * Submits user's project choice during OAuth flow
 */
router.post('/project-selection/:sessionId', (req: Request, res: Response): void => {
  const { sessionId } = req.params;
  const { selectedId } = req.body;

  if (!selectedId && selectedId !== '') {
    res.status(400).json({ error: 'selectedId is required (use empty string for default)' });
    return;
  }

  const success = submitProjectSelection({ sessionId, selectedId });
  if (success) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'No pending project selection for this session' });
  }
});

/**
 * POST /api/cliproxy/auth/kiro/import - Import Kiro token from Kiro IDE
 * Alternative auth path when OAuth callback fails to redirect properly
 */
router.post('/kiro/import', async (_req: Request, res: Response): Promise<void> => {
  // Check if remote mode is enabled - import not available remotely
  const target = getProxyTarget();
  if (target.isRemote) {
    res.status(501).json({
      error: 'Kiro import not available in remote mode',
    });
    return;
  }

  try {
    const tokenDir = getProviderTokenDir('kiro');
    const result = await tryKiroImport(tokenDir, false);

    if (result.success) {
      // Re-initialize accounts to pick up new token
      initializeAccounts();

      // Get the newly added account
      const accounts = getProviderAccounts('kiro');
      const newAccount = accounts.find((a) => a.isDefault) || accounts[0];

      res.json({
        success: true,
        account: newAccount
          ? {
              id: newAccount.id,
              email: newAccount.email,
              provider: 'kiro',
              isDefault: newAccount.isDefault,
            }
          : null,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Failed to import Kiro token',
      });
    }
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
