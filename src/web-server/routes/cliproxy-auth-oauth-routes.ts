/**
 * Interactive OAuth, GitLab PAT, project selection, and Kiro IDE import routes.
 */

import { Router, Request, Response } from 'express';
import { initializeAccounts, triggerOAuth } from '../../cliproxy/auth/auth-handler';
import {
  submitProjectSelection,
  getPendingSelection,
} from '../../cliproxy/auth/project-selection-handler';
import {
  cancelAllSessionsForProvider,
  hasActiveSession,
} from '../../cliproxy/auth/auth-session-manager';
import { getProviderAccounts } from '../../cliproxy/accounts/account-manager';
import {
  getProxyTarget,
  buildProxyUrl,
  buildManagementHeaders,
  type ProxyTarget,
} from '../../cliproxy/proxy/proxy-target-resolver';
import { ensureManagedModelPrefixes } from '../../cliproxy/ai-providers/managed-model-prefixes';
import { tryKiroImport } from '../../cliproxy/auth/kiro-import';
import {
  findNewTokenSnapshot,
  getProviderTokenDir,
  listProviderTokenSnapshots,
} from '../../cliproxy/auth/token-manager';
import { parseGitLabPatAuthResponse } from '../../cliproxy/auth/gitlab-pat-response';
import type { CLIProxyProvider } from '../../cliproxy/types';
import {
  validateAntigravityRiskAcknowledgement,
  isAntigravityResponsibilityBypassEnabled,
} from '../../cliproxy/auth/antigravity-responsibility';
import { createRouteErrorHelpers } from './route-helpers';
import { loadOrCreateUnifiedConfig } from '../../config/config-loader-facade';
import {
  getKiroStartIDCValidationError,
  getReauthAccountTarget,
  getStartAuthFailureMessage,
  getStartAuthNicknameError,
  getStartAuthUnsupportedReason,
  parseGitLabAuthMode,
  parseKiroIDCFlow,
  parseKiroMethod,
  validProviders,
} from './cliproxy-auth-validators';
import {
  finalizeAccountRegistration,
  formatAuthAccountSummary,
} from './cliproxy-manual-auth-store';

const { respondInternalError } = createRouteErrorHelpers('cliproxy-auth-routes');

async function handleGitLabPatStart(options: {
  res: Response;
  target: ProxyTarget;
  localProvider: CLIProxyProvider;
  gitlabBaseUrl?: string;
  gitlabPersonalAccessToken?: string;
  effectiveNickname?: string;
  targetAccountId?: string;
  reauthTokenFile?: string;
}): Promise<void> {
  const {
    res,
    target,
    localProvider,
    gitlabBaseUrl,
    gitlabPersonalAccessToken,
    effectiveNickname,
    targetAccountId,
    reauthTokenFile,
  } = options;

  if (!gitlabPersonalAccessToken) {
    res.status(400).json({
      error: 'gitlabPersonalAccessToken is required when gitlabAuthMode=pat',
      code: 'MISSING_GITLAB_PAT',
    });
    return;
  }

  try {
    const knownTokenFiles = listProviderTokenSnapshots(localProvider);
    const response = await fetch(buildProxyUrl(target, '/v0/management/gitlab-auth-url'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildManagementHeaders(target),
      },
      body: JSON.stringify({
        ...(gitlabBaseUrl ? { base_url: gitlabBaseUrl } : {}),
        personal_access_token: gitlabPersonalAccessToken,
      }),
    });

    const responseBody = await response.text();
    const parsedResponse = parseGitLabPatAuthResponse(
      response.ok,
      response.status,
      responseBody,
      gitlabPersonalAccessToken
    );
    if (!parsedResponse.ok) {
      res.status(response.ok ? 400 : response.status).json({
        error: parsedResponse.errorMessage || 'GitLab PAT authentication failed',
      });
      return;
    }

    const tokenSnapshot = findNewTokenSnapshot(
      listProviderTokenSnapshots(localProvider),
      knownTokenFiles,
      targetAccountId,
      reauthTokenFile
    );
    if (!tokenSnapshot) {
      res.status(409).json({
        error: 'GitLab PAT authentication completed, but CCS could not find the saved token.',
      });
      return;
    }

    const account = await finalizeAccountRegistration({
      provider: localProvider,
      nickname: effectiveNickname,
      targetAccountId: targetAccountId || tokenSnapshot.file,
    });
    if (!account) {
      res.status(409).json({
        error: 'GitLab PAT authentication succeeded, but account registration failed.',
      });
      return;
    }

    res.json({ success: true, account });
  } catch (error) {
    respondInternalError(res, error, 'Failed to start GitLab PAT flow.');
  }
}

export function registerCliproxyAuthOAuthRoutes(router: Router): void {
  /** POST /api/cliproxy/auth/:provider/start - Start OAuth flow for a provider */
  router.post('/:provider/start', async (req: Request, res: Response): Promise<void> => {
    const { provider } = req.params;
    const requestBody =
      req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const nicknameRaw = typeof requestBody.nickname === 'string' ? requestBody.nickname : undefined;
    const accountId =
      typeof requestBody.accountId === 'string' ? requestBody.accountId.trim() : undefined;
    const noIncognitoBody =
      typeof requestBody.noIncognito === 'boolean' ? requestBody.noIncognito : undefined;
    const kiroMethodRaw = requestBody.kiroMethod;
    const kiroIDCStartUrl =
      typeof requestBody.kiroIDCStartUrl === 'string'
        ? requestBody.kiroIDCStartUrl.trim()
        : undefined;
    const kiroIDCRegion =
      typeof requestBody.kiroIDCRegion === 'string' ? requestBody.kiroIDCRegion.trim() : undefined;
    const kiroIDCFlowRaw = requestBody.kiroIDCFlow;
    const gitlabAuthModeRaw = requestBody.gitlabAuthMode;
    const gitlabBaseUrl =
      typeof requestBody.gitlabBaseUrl === 'string' ? requestBody.gitlabBaseUrl.trim() : undefined;
    const gitlabPersonalAccessToken =
      typeof requestBody.gitlabPersonalAccessToken === 'string'
        ? requestBody.gitlabPersonalAccessToken.trim()
        : undefined;
    const riskAcknowledgement = requestBody.riskAcknowledgement;
    const target = getProxyTarget();
    if (target.isRemote) {
      res.status(501).json({ error: 'OAuth start flow not available in remote mode' });
      return;
    }

    const nickname = nicknameRaw?.trim();
    const { method: kiroMethod, invalid: invalidKiroMethod } = parseKiroMethod(kiroMethodRaw);
    const { flow: kiroIDCFlow, invalid: invalidKiroIDCFlow } = parseKiroIDCFlow(kiroIDCFlowRaw);
    const { mode: gitlabAuthMode, invalid: invalidGitLabAuthMode } =
      parseGitLabAuthMode(gitlabAuthModeRaw);

    if (!validProviders.includes(provider as CLIProxyProvider)) {
      res.status(400).json({ error: `Invalid provider: ${provider}` });
      return;
    }

    const localProvider = provider as CLIProxyProvider;
    const unsupportedReason = getStartAuthUnsupportedReason(localProvider);
    if (unsupportedReason) {
      res.status(400).json({ error: unsupportedReason, code: 'AUTH_START_UNSUPPORTED' });
      return;
    }

    const existingAccounts = getProviderAccounts(localProvider);
    const reauthTarget = getReauthAccountTarget(accountId, existingAccounts);
    if (reauthTarget.error) {
      res.status(404).json({ error: reauthTarget.error });
      return;
    }
    const targetAccountId = reauthTarget.account?.id;
    const effectiveNickname = nickname || reauthTarget.account?.nickname;

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

    if (provider === 'kiro') {
      const kiroIDCValidationError = getKiroStartIDCValidationError({
        kiroMethod,
        kiroIDCStartUrl,
        invalidKiroIDCFlow,
      });
      if (kiroIDCValidationError) {
        res.status(400).json(kiroIDCValidationError);
        return;
      }
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

    if (provider === 'gitlab' && gitlabAuthMode === 'pat') {
      await handleGitLabPatStart({
        res,
        target,
        localProvider,
        gitlabBaseUrl,
        gitlabPersonalAccessToken,
        effectiveNickname,
        targetAccountId,
        reauthTokenFile: reauthTarget.account?.tokenFile,
      });
      return;
    }

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

    let noIncognito = true;
    if (provider === 'kiro') {
      const config = loadOrCreateUnifiedConfig();
      noIncognito = noIncognitoBody ?? config.cliproxy?.kiro_no_incognito ?? true;
    }

    try {
      const account = await triggerOAuth(provider as CLIProxyProvider, {
        add: true,
        headless: false,
        nickname: effectiveNickname || undefined,
        expectedAccountId: targetAccountId,
        acceptAgyRisk: provider === 'agy',
        kiroMethod: provider === 'kiro' ? kiroMethod : undefined,
        kiroIDCStartUrl: provider === 'kiro' ? kiroIDCStartUrl : undefined,
        kiroIDCRegion: provider === 'kiro' ? kiroIDCRegion : undefined,
        kiroIDCFlow: provider === 'kiro' && kiroMethod === 'idc' ? kiroIDCFlow : undefined,
        gitlabAuthMode: provider === 'gitlab' ? gitlabAuthMode : undefined,
        gitlabBaseUrl: provider === 'gitlab' ? gitlabBaseUrl : undefined,
        fromUI: true,
        noIncognito,
      });

      if (account) {
        try {
          await ensureManagedModelPrefixes([account.provider]);
        } catch {
          // Keep OAuth success path non-fatal when prefix repair cannot run.
        }

        res.json({
          success: true,
          account: formatAuthAccountSummary(account),
        });
      } else {
        res.status(400).json({
          error: getStartAuthFailureMessage(provider as CLIProxyProvider),
        });
      }
    } catch (error) {
      respondInternalError(res, error, 'Failed to start OAuth flow.');
    }
  });

  /** POST /api/cliproxy/auth/:provider/cancel - Cancel in-progress OAuth flow */
  router.post('/:provider/cancel', (req: Request, res: Response): void => {
    const { provider } = req.params;

    if (!validProviders.includes(provider as CLIProxyProvider)) {
      res.status(400).json({ error: `Invalid provider: ${provider}` });
      return;
    }

    if (!hasActiveSession(provider)) {
      res.status(404).json({ error: 'No active authentication session for this provider' });
      return;
    }

    const cancelledCount = cancelAllSessionsForProvider(provider);

    res.json({
      success: true,
      cancelled: cancelledCount,
      provider,
    });
  });

  /** GET /api/cliproxy/auth/project-selection/:sessionId - Get pending project selection prompt */
  router.get('/project-selection/:sessionId', (req: Request, res: Response): void => {
    const { sessionId } = req.params;

    const pending = getPendingSelection(sessionId);
    if (pending) {
      res.json(pending);
    } else {
      res.status(404).json({ error: 'No pending project selection for this session' });
    }
  });

  /** POST /api/cliproxy/auth/project-selection/:sessionId - Submit project selection */
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

  /** POST /api/cliproxy/auth/kiro/import - Import Kiro token from Kiro IDE */
  router.post('/kiro/import', async (_req: Request, res: Response): Promise<void> => {
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
        initializeAccounts();
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
      respondInternalError(res, error, 'Failed to import Kiro token.');
    }
  });
}
