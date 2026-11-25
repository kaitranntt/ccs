/**
 * CLIProxy auth status and account management route handlers.
 */

import { Router, Request, Response } from 'express';
import {
  getAllAuthStatus,
  getOAuthConfig,
  initializeAccounts,
} from '../../cliproxy/auth/auth-handler';
import { fetchCliproxyStats } from '../../cliproxy/services/stats-fetcher';
import {
  getAllAccountsSummary,
  getProviderAccounts,
  setDefaultAccount as setDefaultAccountFn,
  removeAccount as removeAccountFn,
  pauseAccount as pauseAccountFn,
  resumeAccount as resumeAccountFn,
  touchAccount,
} from '../../cliproxy/accounts/account-manager';
import { getProxyTarget } from '../../cliproxy/proxy/proxy-target-resolver';
import { fetchRemoteAuthStatus } from '../../cliproxy/services/remote-auth-fetcher';
import { mapExternalProviderName } from '../../cliproxy/provider-capabilities';
import type { CLIProxyProvider } from '../../cliproxy/types';
import { createRouteErrorHelpers } from './route-helpers';
import { validProviders } from './cliproxy-auth-validators';

const { respondInternalError } = createRouteErrorHelpers('cliproxy-auth-routes');

function handleAccountMutation(
  req: Request,
  res: Response,
  action: (provider: CLIProxyProvider, accountId: string) => boolean,
  onSuccess: (provider: CLIProxyProvider, accountId: string) => Record<string, unknown>,
  failureMessage: string
): void {
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
    const typedProvider = provider as CLIProxyProvider;
    const success = action(typedProvider, accountId);
    if (success) {
      res.json(onSuccess(typedProvider, accountId));
    } else {
      res
        .status(404)
        .json({ error: `Account '${accountId}' not found for provider '${provider}'` });
    }
  } catch (error) {
    respondInternalError(res, error, failureMessage);
  }
}

export function registerCliproxyAuthAccountRoutes(router: Router): void {
  /**
   * GET /api/cliproxy/auth - Get auth status for built-in CLIProxy profiles
   * Also fetches CLIProxyAPI stats to update lastUsedAt for active providers
   */
  router.get('/', async (_req: Request, res: Response): Promise<void> => {
    try {
      const target = getProxyTarget();
      if (target.isRemote) {
        const authStatus = await fetchRemoteAuthStatus(target);
        res.json({ authStatus, source: 'remote' });
        return;
      }

      initializeAccounts();
      const stats = await fetchCliproxyStats();

      if (stats?.requestsByProvider) {
        for (const [statsProvider, requestCount] of Object.entries(stats.requestsByProvider)) {
          if (requestCount > 0) {
            const provider = mapExternalProviderName(statsProvider.toLowerCase());
            if (provider) {
              const accounts = getProviderAccounts(provider);
              for (const account of accounts) {
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
      const target = getProxyTarget();
      if (target.isRemote) {
        res.status(503).json({
          error: 'Failed to fetch remote auth status',
          authStatus: [],
          source: 'remote',
        });
      } else {
        respondInternalError(res, error, 'Failed to fetch auth status.');
      }
    }
  });

  /** GET /api/cliproxy/accounts - Get all accounts across all providers */
  router.get('/accounts', async (_req: Request, res: Response): Promise<void> => {
    try {
      const target = getProxyTarget();
      if (target.isRemote) {
        const authStatus = await fetchRemoteAuthStatus(target);
        const accounts = authStatus.flatMap((status) => status.accounts);
        res.json({ accounts, source: 'remote' });
        return;
      }

      initializeAccounts();
      const accounts = getAllAccountsSummary();
      res.json({ accounts });
    } catch (error) {
      const target = getProxyTarget();
      if (target.isRemote) {
        res.status(503).json({
          error: 'Failed to fetch remote account status',
          accounts: [],
          source: 'remote',
        });
      } else {
        respondInternalError(res, error, 'Failed to list accounts.');
      }
    }
  });

  /** GET /api/cliproxy/accounts/:provider - Get accounts for a specific provider */
  router.get('/accounts/:provider', (req: Request, res: Response): void => {
    const { provider } = req.params;

    if (!validProviders.includes(provider as CLIProxyProvider)) {
      res.status(400).json({ error: `Invalid provider: ${provider}` });
      return;
    }

    try {
      const accounts = getProviderAccounts(provider as CLIProxyProvider);
      res.json({ provider, accounts });
    } catch (error) {
      respondInternalError(res, error, 'Failed to get provider accounts.');
    }
  });

  /** POST /api/cliproxy/accounts/:provider/default - Set default account for provider */
  router.post('/accounts/:provider/default', (req: Request, res: Response): void => {
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
      respondInternalError(res, error, 'Failed to set default account.');
    }
  });

  /** DELETE /api/cliproxy/accounts/:provider/:accountId - Remove an account */
  router.delete('/accounts/:provider/:accountId', (req: Request, res: Response): void => {
    handleAccountMutation(
      req,
      res,
      removeAccountFn,
      (provider, accountId) => ({ provider, accountId, deleted: true }),
      'Failed to remove account.'
    );
  });

  /** POST /api/cliproxy/accounts/:provider/:accountId/pause - Pause an account */
  router.post('/accounts/:provider/:accountId/pause', (req: Request, res: Response): void => {
    handleAccountMutation(
      req,
      res,
      pauseAccountFn,
      (provider, accountId) => ({ provider, accountId, paused: true }),
      'Failed to pause account.'
    );
  });

  /** POST /api/cliproxy/accounts/:provider/:accountId/resume - Resume a paused account */
  router.post('/accounts/:provider/:accountId/resume', (req: Request, res: Response): void => {
    handleAccountMutation(
      req,
      res,
      resumeAccountFn,
      (provider, accountId) => ({ provider, accountId, paused: false }),
      'Failed to resume account.'
    );
  });
}
