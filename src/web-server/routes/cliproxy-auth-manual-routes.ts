/**
 * Manual OAuth URL generation, status polling, and callback submission routes.
 */

import { Router, Request, Response } from 'express';
import {
  getProxyTarget,
  buildProxyUrl,
  buildManagementHeaders,
} from '../../cliproxy/proxy/proxy-target-resolver';
import { CLIPROXY_CALLBACK_PROVIDER_MAP } from '../../cliproxy/auth/auth-types';
import type { CLIProxyProvider } from '../../cliproxy/types';
import { createRouteErrorHelpers } from './route-helpers';
import {
  getManualCallbackRegistrationError,
  parseCallbackUrl,
  validProviders,
} from './cliproxy-auth-validators';
import {
  deleteManualAuthState,
  finalizeAccountRegistration,
  findNewTokenSnapshotForPendingAuth,
  getManualAuthState,
  shouldKeepWaitingForLocalToken,
} from './cliproxy-manual-auth-store';
import { registerCliproxyAuthStartUrlRoute } from './cliproxy-auth-start-url-route';

const { respondInternalError } = createRouteErrorHelpers('cliproxy-auth-routes');

export function registerCliproxyAuthManualRoutes(router: Router): void {
  registerCliproxyAuthStartUrlRoute(router);

  /** GET /api/cliproxy/auth/:provider/status - Poll OAuth status */
  router.get('/:provider/status', async (req: Request, res: Response): Promise<void> => {
    const { provider } = req.params;
    const { state } = req.query;

    if (!state || typeof state !== 'string') {
      res.status(400).json({ error: 'state query parameter required' });
      return;
    }

    if (!validProviders.includes(provider as CLIProxyProvider)) {
      res.status(400).json({ error: `Invalid provider: ${provider}` });
      return;
    }

    try {
      const target = getProxyTarget();
      const response = await fetch(
        buildProxyUrl(target, `/v0/management/get-auth-status?state=${encodeURIComponent(state)}`),
        { headers: buildManagementHeaders(target) }
      );
      const data = (await response.json()) as { status?: string; error?: string };

      if (data.status === 'ok') {
        const localProvider = provider as CLIProxyProvider;
        const pendingAuth = getManualAuthState(state);

        if (!pendingAuth) {
          res.status(409).json({
            status: 'error',
            error:
              'Authentication completed upstream, but CCS could not match it to the active add-account session. Retry the flow from the dashboard.',
          });
          return;
        }

        const now = Date.now();
        const tokenSnapshot = findNewTokenSnapshotForPendingAuth(localProvider, pendingAuth);
        if (!tokenSnapshot) {
          if (shouldKeepWaitingForLocalToken(state, pendingAuth, now)) {
            res.json({ status: 'wait' });
            return;
          }

          deleteManualAuthState(state);
          res.status(409).json({
            status: 'error',
            error:
              'Authentication completed upstream, but no new local token was saved for this account. Update CCS/CLIProxy and retry.',
          });
          return;
        }

        const account = await finalizeAccountRegistration({
          provider: localProvider,
          nickname: pendingAuth.nickname,
          targetAccountId: pendingAuth.expectedAccountId || tokenSnapshot.file,
          invalidateQuota: true,
        });

        if (!account) {
          deleteManualAuthState(state);
          res.status(409).json({
            status: 'error',
            error: getManualCallbackRegistrationError(localProvider),
          });
          return;
        }

        res.json({ status: 'ok', account });
        deleteManualAuthState(state);
        return;
      }

      res.json(data);
    } catch {
      res.status(503).json({ status: 'error', error: 'CLIProxyAPI not reachable' });
    }
  });

  /** POST /api/cliproxy/auth/:provider/submit-callback - Submit OAuth callback URL manually */
  router.post('/:provider/submit-callback', async (req: Request, res: Response): Promise<void> => {
    const { provider } = req.params;
    const { redirectUrl } = req.body;

    const target = getProxyTarget();
    if (target.isRemote) {
      res.status(501).json({ error: 'Manual callback not available in remote mode' });
      return;
    }

    if (!validProviders.includes(provider as CLIProxyProvider)) {
      res.status(400).json({ error: `Invalid provider: ${provider}` });
      return;
    }

    if (!redirectUrl || typeof redirectUrl !== 'string') {
      res.status(400).json({ error: 'redirectUrl is required' });
      return;
    }

    const parsed = parseCallbackUrl(redirectUrl);
    if (!parsed.code) {
      res.status(400).json({ error: 'Invalid callback URL: missing code parameter' });
      return;
    }
    const pendingAuth = getManualAuthState(parsed.state);

    try {
      const callbackProvider =
        CLIPROXY_CALLBACK_PROVIDER_MAP[provider as CLIProxyProvider] || provider;

      const response = await fetch(buildProxyUrl(target, '/v0/management/oauth-callback'), {
        method: 'POST',
        headers: buildManagementHeaders(target, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          provider: callbackProvider,
          redirect_url: redirectUrl,
        }),
      });

      const data = (await response.json()) as { status?: string; error?: string };

      if (!response.ok || data.status === 'error') {
        res.status(response.status >= 400 ? response.status : 400).json({
          error: data.error || 'OAuth callback failed',
        });
        return;
      }

      const localProvider = provider as CLIProxyProvider;
      const now = Date.now();

      if (pendingAuth) {
        const tokenSnapshot = findNewTokenSnapshotForPendingAuth(localProvider, pendingAuth);
        if (!tokenSnapshot) {
          if (parsed.state && shouldKeepWaitingForLocalToken(parsed.state, pendingAuth, now)) {
            res.json({ status: 'wait' });
            return;
          }

          if (parsed.state) {
            deleteManualAuthState(parsed.state);
          }
          res.status(409).json({
            error: getManualCallbackRegistrationError(localProvider),
          });
          return;
        }

        const account = await finalizeAccountRegistration({
          provider: localProvider,
          nickname: pendingAuth.nickname,
          targetAccountId: pendingAuth.expectedAccountId || tokenSnapshot.file,
          repairManagedPrefixes: Boolean(parsed.state),
          invalidateQuota: true,
        });

        if (!account) {
          if (parsed.state) {
            deleteManualAuthState(parsed.state);
          }
          res.status(409).json({
            error: getManualCallbackRegistrationError(localProvider),
          });
          return;
        }

        res.json({ success: true, account });
        if (parsed.state) {
          deleteManualAuthState(parsed.state);
        }
        return;
      }

      const account = await finalizeAccountRegistration({
        provider: localProvider,
        repairManagedPrefixes: false,
        invalidateQuota: true,
      });

      if (!account) {
        res.status(409).json({
          error: getManualCallbackRegistrationError(localProvider),
        });
        return;
      }

      res.json({ success: true, account });
    } catch (error) {
      respondInternalError(res, error, 'CLIProxyAPI not reachable.', 503);
    }
  });
}
