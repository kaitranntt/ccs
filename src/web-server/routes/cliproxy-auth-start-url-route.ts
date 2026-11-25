/**
 * Manual OAuth start-url route handler.
 */

import { Router, Request, Response } from 'express';
import { createLogger } from '../../services/logging';
import { getProviderAccounts } from '../../cliproxy/accounts/account-manager';
import {
  getProxyTarget,
  buildProxyUrl,
  buildManagementHeaders,
} from '../../cliproxy/proxy/proxy-target-resolver';
import { listProviderTokenSnapshots } from '../../cliproxy/auth/token-manager';
import {
  CLIPROXY_AUTH_URL_PROVIDER_MAP,
  toKiroManagementMethod,
} from '../../cliproxy/auth/auth-types';
import type { CLIProxyProvider } from '../../cliproxy/types';
import {
  validateAntigravityRiskAcknowledgement,
  isAntigravityResponsibilityBypassEnabled,
} from '../../cliproxy/auth/antigravity-responsibility';
import {
  getPlusOAuthCredentialError,
  getPlusAuthUrlCredentialError,
} from '../../cliproxy/auth/oauth-handler';
import { buildOAuthStartFailureGuidance } from '../../cliproxy/auth/oauth-start-failure-guidance';
import { getStoredConfiguredBackend } from '../../cliproxy/binary-manager';
import {
  getReauthAccountTarget,
  getStartAuthNicknameError,
  getStartUrlUnsupportedReason,
  parseAuthUrlState,
  parseGitLabAuthMode,
  parseKiroMethod,
  validProviders,
} from './cliproxy-auth-validators';
import { rememberManualAuthState } from './cliproxy-manual-auth-store';

const logger = createLogger('web-server:routes:cliproxy-auth');

export function registerCliproxyAuthStartUrlRoute(router: Router): void {
  /** POST /api/cliproxy/auth/:provider/start-url - Start OAuth and return auth URL immediately */
  router.post('/:provider/start-url', async (req: Request, res: Response): Promise<void> => {
    const { provider } = req.params;
    const requestBody =
      req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const nicknameRaw = typeof requestBody.nickname === 'string' ? requestBody.nickname : undefined;
    const accountId =
      typeof requestBody.accountId === 'string' ? requestBody.accountId.trim() : undefined;
    const kiroMethodRaw = requestBody.kiroMethod;
    const gitlabAuthModeRaw = requestBody.gitlabAuthMode;
    const gitlabBaseUrl =
      typeof requestBody.gitlabBaseUrl === 'string' ? requestBody.gitlabBaseUrl.trim() : undefined;
    const riskAcknowledgement = requestBody.riskAcknowledgement;
    const nickname = nicknameRaw?.trim();
    const { method: kiroMethod, invalid: invalidKiroMethod } = parseKiroMethod(kiroMethodRaw);
    const { mode: gitlabAuthMode, invalid: invalidGitLabAuthMode } =
      parseGitLabAuthMode(gitlabAuthModeRaw);

    const target = getProxyTarget();
    if (target.isRemote) {
      res.status(501).json({ error: 'Manual OAuth flow not available in remote mode' });
      return;
    }

    if (!validProviders.includes(provider as CLIProxyProvider)) {
      res.status(400).json({ error: `Invalid provider: ${provider}` });
      return;
    }

    if (provider === 'kiro' && invalidKiroMethod) {
      res.status(400).json({
        error: 'Invalid kiroMethod. Supported: aws, aws-authcode, google, github, idc',
        code: 'INVALID_KIRO_METHOD',
      });
      return;
    }

    if (provider === 'gitlab' && invalidGitLabAuthMode) {
      res.status(400).json({
        error: 'Invalid gitlabAuthMode. Supported: oauth, pat',
        code: 'INVALID_GITLAB_AUTH_MODE',
      });
      return;
    }

    if (provider === 'gitlab' && gitlabAuthMode === 'pat') {
      res.status(400).json({
        error: 'GitLab PAT login must use /api/cliproxy/auth/gitlab/start',
        code: 'GITLAB_PAT_REQUIRES_START',
      });
      return;
    }

    if (provider === 'agy' && !isAntigravityResponsibilityBypassEnabled()) {
      const validation = validateAntigravityRiskAcknowledgement(riskAcknowledgement);
      if (!validation.valid) {
        res.status(400).json({
          error: validation.error,
          code: 'AGY_RISK_ACK_REQUIRED',
        });
        return;
      }
    }

    const unsupportedReason = getStartUrlUnsupportedReason(provider as CLIProxyProvider, {
      kiroMethod: provider === 'kiro' ? kiroMethod : undefined,
    });
    if (unsupportedReason) {
      res.status(400).json({ error: unsupportedReason });
      return;
    }

    const localProvider = provider as CLIProxyProvider;
    const existingAccounts = getProviderAccounts(localProvider);
    const reauthTarget = getReauthAccountTarget(accountId, existingAccounts);
    if (reauthTarget.error) {
      res.status(404).json({ error: reauthTarget.error });
      return;
    }
    const targetAccountId = reauthTarget.account?.id;
    const effectiveNickname = nickname || reauthTarget.account?.nickname;
    const nicknameError = getStartAuthNicknameError(
      localProvider,
      effectiveNickname,
      existingAccounts,
      targetAccountId
    );
    if (nicknameError) {
      res.status(400).json(nicknameError);
      return;
    }

    const credentialError = getPlusOAuthCredentialError(
      provider as CLIProxyProvider,
      getStoredConfiguredBackend()
    );
    if (credentialError) {
      logger.warn(
        'cliproxy_auth.start_url.credential_guard_fired',
        'start-url credential guard fired for Plus-backend provider',
        { provider, reason: credentialError }
      );
      res.status(400).json({
        error: 'plus_oauth_credentials_missing',
        provider,
        message: credentialError,
      });
      return;
    }

    let startPath: string | null = null;
    try {
      const authUrlProvider =
        CLIPROXY_AUTH_URL_PROVIDER_MAP[provider as CLIProxyProvider] || provider;
      const kiroManagementMethod = provider === 'kiro' ? toKiroManagementMethod(kiroMethod) : null;
      const kiroQuery =
        provider === 'kiro' && kiroManagementMethod
          ? `&method=${encodeURIComponent(kiroManagementMethod)}`
          : '';
      const gitlabQuery =
        provider === 'gitlab' && gitlabBaseUrl
          ? `&base_url=${encodeURIComponent(gitlabBaseUrl)}`
          : '';
      startPath = `/v0/management/${authUrlProvider}-auth-url?is_webui=true${kiroQuery}${gitlabQuery}`;

      const response = await fetch(buildProxyUrl(target, startPath), {
        headers: buildManagementHeaders(target),
      });

      if (!response.ok) {
        const error = await response.text();
        const guidance = buildOAuthStartFailureGuidance(provider as CLIProxyProvider, {
          target,
          startPath,
          cause: error || `HTTP ${response.status}`,
        });
        res.status(response.status).json(guidance);
        return;
      }

      const data = (await response.json()) as {
        url?: string;
        auth_url?: string;
        state?: string;
        method?: string;
      };
      const authUrl = data.url || data.auth_url;

      if (authUrl) {
        const authUrlError = getPlusAuthUrlCredentialError(provider as CLIProxyProvider, authUrl);
        if (authUrlError) {
          const redactedUrl = authUrl.split('?')[0];
          logger.error(
            'cliproxy_auth.start_url.missing_client_id',
            'Plus emitted OAuth URL without client_id',
            { provider, urlOrigin: redactedUrl }
          );
          res.status(502).json({
            error: 'plus_oauth_url_missing_client_id',
            provider,
            message: authUrlError,
          });
          return;
        }
      }

      const oauthState = data.state || parseAuthUrlState(authUrl);

      if (!authUrl && !oauthState) {
        res
          .status(500)
          .json({ error: 'No OAuth state or authorization URL received from CLIProxyAPI' });
        return;
      }

      if (oauthState) {
        rememberManualAuthState(oauthState, {
          nickname: effectiveNickname || undefined,
          expectedAccountId: targetAccountId,
          expectedTokenFile: reauthTarget.account?.tokenFile,
          knownTokenFiles: listProviderTokenSnapshots(localProvider),
        });
      }

      res.json({
        success: true,
        authUrl: authUrl || null,
        state: oauthState,
        method: data.method || null,
      });
    } catch (error) {
      if (error instanceof SyntaxError) {
        logger.error(
          'cliproxy_auth.start_url.invalid_response',
          'Invalid OAuth start response from CLIProxyAPI',
          { provider, err: { name: error.name, message: error.message } }
        );
        res.status(502).json({
          error: 'cliproxy_oauth_start_invalid_response',
          provider,
          message: 'CLIProxyAPI returned an invalid OAuth start response.',
          details: error.message,
        });
        return;
      }

      const authUrlProvider =
        CLIPROXY_AUTH_URL_PROVIDER_MAP[provider as CLIProxyProvider] || provider;
      const guidance = buildOAuthStartFailureGuidance(provider as CLIProxyProvider, {
        target,
        startPath: startPath ?? `/v0/management/${authUrlProvider}-auth-url?is_webui=true`,
        cause: error,
      });
      logger.error(
        'cliproxy_auth.start_url.request_failed',
        guidance.message || 'OAuth start request failed',
        { provider, details: guidance.details }
      );
      res.status(503).json(guidance);
    }
  });
}
