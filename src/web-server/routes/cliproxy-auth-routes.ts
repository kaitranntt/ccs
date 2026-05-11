import { Router, Request, Response } from 'express';
import {
  getAllAuthStatus,
  getOAuthConfig,
  initializeAccounts,
  triggerOAuth,
} from '../../cliproxy/auth/auth-handler';
import {
  submitProjectSelection,
  getPendingSelection,
} from '../../cliproxy/auth/project-selection-handler';
import {
  cancelAllSessionsForProvider,
  hasActiveSession,
} from '../../cliproxy/auth/auth-session-manager';
import { fetchCliproxyStats } from '../../cliproxy/services/stats-fetcher';
import {
  getAllAccountsSummary,
  getProviderAccounts,
  setDefaultAccount as setDefaultAccountFn,
  removeAccount as removeAccountFn,
  pauseAccount as pauseAccountFn,
  resumeAccount as resumeAccountFn,
  touchAccount,
  hasAccountNameConflict,
  PROVIDERS_WITHOUT_EMAIL,
  validateNickname,
} from '../../cliproxy/accounts/account-manager';
import {
  getProxyTarget,
  buildProxyUrl,
  buildManagementHeaders,
} from '../../cliproxy/proxy/proxy-target-resolver';
import { fetchRemoteAuthStatus } from '../../cliproxy/services/remote-auth-fetcher';
import { ensureManagedModelPrefixes } from '../../cliproxy/ai-providers/managed-model-prefixes';
import { invalidateQuotaCache } from '../../cliproxy/quota/quota-response-cache';

import { tryKiroImport } from '../../cliproxy/auth/kiro-import';
import {
  type ProviderTokenSnapshot,
  findNewTokenSnapshot,
  getProviderTokenDir,
  listProviderTokenSnapshots,
  registerAccountFromToken,
} from '../../cliproxy/auth/token-manager';
import { parseGitLabPatAuthResponse } from '../../cliproxy/auth/gitlab-pat-response';
import {
  CLIPROXY_CALLBACK_PROVIDER_MAP,
  CLIPROXY_AUTH_URL_PROVIDER_MAP,
  isKiroAuthMethod,
  isKiroIDCFlow,
  isKiroDeviceCodeMethod,
  KiroIDCFlow,
  KiroAuthMethod,
  normalizeKiroIDCFlow,
  normalizeKiroAuthMethod,
  toKiroManagementMethod,
} from '../../cliproxy/auth/auth-types';
import {
  getOAuthFlowType,
  isBrowserUrlAuthProvider,
  mapExternalProviderName,
} from '../../cliproxy/provider-capabilities';
import type { CLIProxyProvider } from '../../cliproxy/types';
import { CLIPROXY_PROFILES } from '../../auth/profile-detector';
import {
  validateAntigravityRiskAcknowledgement,
  isAntigravityResponsibilityBypassEnabled,
} from '../../cliproxy/auth/antigravity-responsibility';
import { createRouteErrorHelpers } from './route-helpers';
import { requireLocalAccessWhenAuthDisabled } from '../middleware/auth-middleware';
import { loadOrCreateUnifiedConfig } from '../../config/config-loader-facade';
import {
  getPlusOAuthCredentialError,
  getPlusAuthUrlCredentialError,
} from '../../cliproxy/auth/oauth-handler';
import { buildOAuthStartFailureGuidance } from '../../cliproxy/auth/oauth-start-failure-guidance';
import { getStoredConfiguredBackend } from '../../cliproxy/binary-manager';

const router = Router();
const MANUAL_AUTH_STATE_TTL_MS = 10 * 60 * 1000;
const POLLED_AUTH_LOCAL_TOKEN_GRACE_MS = 15 * 1000;

const pendingManualAuthState = new Map<
  string,
  {
    nickname?: string;
    expectedAccountId?: string;
    createdAt: number;
    upstreamCompletedAt?: number;
    knownTokenFiles: ProviderTokenSnapshot[];
  }
>();

// Valid providers list - derived from canonical CLIPROXY_PROFILES
const validProviders: CLIProxyProvider[] = [...CLIPROXY_PROFILES];

const { respondInternalError } = createRouteErrorHelpers('cliproxy-auth-routes');

router.use((req: Request, res: Response, next) => {
  if (
    requireLocalAccessWhenAuthDisabled(
      req,
      res,
      'CLIProxy auth endpoints require localhost access when dashboard auth is disabled.'
    )
  ) {
    next();
  }
});

function pruneExpiredManualAuthState(now = Date.now()): void {
  for (const [state, pending] of pendingManualAuthState.entries()) {
    const authExpired = now - pending.createdAt > MANUAL_AUTH_STATE_TTL_MS;
    const withinLocalTokenGrace =
      pending.upstreamCompletedAt !== undefined &&
      now - pending.upstreamCompletedAt < POLLED_AUTH_LOCAL_TOKEN_GRACE_MS;

    if (authExpired && !withinLocalTokenGrace) {
      pendingManualAuthState.delete(state);
    }
  }
}

function rememberManualAuthState(
  state: string,
  pending: {
    nickname?: string;
    expectedAccountId?: string;
    knownTokenFiles: ProviderTokenSnapshot[];
  }
): void {
  pruneExpiredManualAuthState();
  pendingManualAuthState.set(state, {
    ...pending,
    createdAt: Date.now(),
  });
}

function getManualAuthState(state: string | undefined): {
  nickname?: string;
  expectedAccountId?: string;
  createdAt: number;
  upstreamCompletedAt?: number;
  knownTokenFiles: ProviderTokenSnapshot[];
} | null {
  if (!state) {
    return null;
  }

  pruneExpiredManualAuthState();
  const pending = pendingManualAuthState.get(state);
  if (!pending) {
    return null;
  }

  return {
    nickname: pending.nickname,
    expectedAccountId: pending.expectedAccountId,
    createdAt: pending.createdAt,
    upstreamCompletedAt: pending.upstreamCompletedAt,
    knownTokenFiles: pending.knownTokenFiles,
  };
}

function markManualAuthUpstreamCompleted(state: string, now = Date.now()): number | null {
  pruneExpiredManualAuthState(now);
  const pending = pendingManualAuthState.get(state);
  if (!pending) {
    return null;
  }

  if (pending.upstreamCompletedAt !== undefined) {
    return pending.upstreamCompletedAt;
  }

  pending.upstreamCompletedAt = now;
  pendingManualAuthState.set(state, pending);
  return now;
}

function findNewTokenSnapshotForPendingAuth(
  provider: CLIProxyProvider,
  pending: { expectedAccountId?: string; knownTokenFiles: ProviderTokenSnapshot[] }
): ProviderTokenSnapshot | null {
  return findNewTokenSnapshot(
    listProviderTokenSnapshots(provider),
    pending.knownTokenFiles,
    pending.expectedAccountId
  );
}

function shouldKeepWaitingForLocalToken(
  state: string,
  pending: { upstreamCompletedAt?: number },
  now = Date.now()
): boolean {
  const upstreamCompletedAt =
    pending.upstreamCompletedAt ?? markManualAuthUpstreamCompleted(state, now);

  return (
    upstreamCompletedAt !== null && now - upstreamCompletedAt < POLLED_AUTH_LOCAL_TOKEN_GRACE_MS
  );
}

function invalidateQuotaForRegisteredAccount(account: {
  provider: CLIProxyProvider;
  id: string;
}): void {
  invalidateQuotaCache(account.provider, account.id);
}

function parseKiroMethod(raw: unknown): { method: KiroAuthMethod; invalid: boolean } {
  if (raw === undefined || raw === null) {
    return { method: normalizeKiroAuthMethod(), invalid: false };
  }
  if (typeof raw !== 'string') {
    return { method: normalizeKiroAuthMethod(), invalid: true };
  }
  if (raw.trim() === '') {
    return { method: normalizeKiroAuthMethod(), invalid: false };
  }
  const normalized = raw.trim().toLowerCase();
  if (!isKiroAuthMethod(normalized)) {
    return { method: normalizeKiroAuthMethod(), invalid: true };
  }
  return { method: normalizeKiroAuthMethod(normalized), invalid: false };
}

function parseKiroIDCFlow(raw: unknown): { flow: KiroIDCFlow; invalid: boolean } {
  if (raw === undefined || raw === null || raw === '') {
    return { flow: normalizeKiroIDCFlow(), invalid: false };
  }
  if (typeof raw !== 'string') {
    return { flow: normalizeKiroIDCFlow(), invalid: true };
  }
  const normalized = raw.trim().toLowerCase();
  if (!isKiroIDCFlow(normalized)) {
    return { flow: normalizeKiroIDCFlow(), invalid: true };
  }
  return { flow: normalizeKiroIDCFlow(normalized), invalid: false };
}

function parseGitLabAuthMode(raw: unknown): { mode: 'oauth' | 'pat'; invalid: boolean } {
  if (raw === undefined || raw === null || raw === '') {
    return { mode: 'oauth', invalid: false };
  }
  if (typeof raw !== 'string') {
    return { mode: 'oauth', invalid: true };
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'oauth' || normalized === 'pat') {
    return { mode: normalized, invalid: false };
  }
  return { mode: 'oauth', invalid: true };
}

export function getKiroStartIDCValidationError(options: {
  kiroMethod: KiroAuthMethod;
  kiroIDCStartUrl?: string;
  invalidKiroIDCFlow?: boolean;
}): { error: string; code: string } | null {
  if (options.kiroMethod !== 'idc') {
    return null;
  }
  if (options.invalidKiroIDCFlow) {
    return {
      error: 'Invalid kiroIDCFlow. Supported: authcode, device',
      code: 'INVALID_KIRO_IDC_FLOW',
    };
  }
  if (!options.kiroIDCStartUrl) {
    return {
      error: 'Kiro IDC login requires kiroIDCStartUrl',
      code: 'MISSING_KIRO_IDC_START_URL',
    };
  }
  return null;
}

export function getStartUrlUnsupportedReason(
  provider: CLIProxyProvider,
  options?: { kiroMethod?: KiroAuthMethod }
): string | null {
  if (provider === 'kiro') {
    const kiroMethod = options?.kiroMethod ?? normalizeKiroAuthMethod();
    if (kiroMethod === 'idc') {
      return "Kiro method 'idc' uses CLI auth flow. Use /api/cliproxy/auth/kiro/start instead.";
    }
    if (kiroMethod === 'aws-authcode') {
      return "Kiro method 'aws-authcode' uses CLI auth flow. Use /api/cliproxy/auth/kiro/start instead.";
    }
    if (isKiroDeviceCodeMethod(kiroMethod)) {
      return "Kiro method 'aws' uses Device Code flow. Use /api/cliproxy/auth/kiro/start instead.";
    }
    return null;
  }

  if (isBrowserUrlAuthProvider(provider)) {
    return null;
  }

  if (getOAuthFlowType(provider) === 'device_code') {
    return `Provider '${provider}' uses Device Code flow. Use /api/cliproxy/auth/${provider}/start instead.`;
  }
  return null;
}

export function getStartAuthFailureMessage(provider: CLIProxyProvider): string {
  if (provider === 'ghcp') {
    return 'Authentication failed, was cancelled, or GitHub Copilot verification did not complete. Ensure the account has an active Copilot subscription and retry.';
  }
  return 'Authentication failed or was cancelled';
}

function getManualCallbackRegistrationError(provider: CLIProxyProvider): string {
  if (PROVIDERS_WITHOUT_EMAIL.includes(provider)) {
    return 'Authenticated token could not be matched to a new account. Retry the flow and choose a different nickname if needed.';
  }
  return 'Authenticated token could not be registered. Retry the flow.';
}

export function getStartAuthNicknameError(
  provider: CLIProxyProvider,
  nickname: string | undefined,
  existingAccounts: Array<{ id: string; nickname?: string }>,
  allowExistingAccountId?: string
): { error: string; code: 'INVALID_NICKNAME' | 'NICKNAME_EXISTS' } | null {
  if (!PROVIDERS_WITHOUT_EMAIL.includes(provider) || !nickname) {
    return null;
  }

  const validationError = validateNickname(nickname);
  if (validationError) {
    return {
      error: validationError,
      code: 'INVALID_NICKNAME',
    };
  }

  if (hasAccountNameConflict(existingAccounts, nickname, allowExistingAccountId)) {
    return {
      error: `Nickname "${nickname}" is already in use. Choose a different one.`,
      code: 'NICKNAME_EXISTS',
    };
  }

  return null;
}

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

    // Update lastUsedAt for providers with recent activity
    if (stats?.requestsByProvider) {
      for (const [statsProvider, requestCount] of Object.entries(stats.requestsByProvider)) {
        if (requestCount > 0) {
          const provider = mapExternalProviderName(statsProvider.toLowerCase());
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
        error: 'Failed to fetch remote auth status',
        authStatus: [],
        source: 'remote',
      });
    } else {
      respondInternalError(res, error, 'Failed to fetch auth status.');
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
      const accounts = authStatus.flatMap((status) => status.accounts);
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
        error: 'Failed to fetch remote account status',
        accounts: [],
        source: 'remote',
      });
    } else {
      respondInternalError(res, error, 'Failed to list accounts.');
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
    respondInternalError(res, error, 'Failed to get provider accounts.');
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
    respondInternalError(res, error, 'Failed to set default account.');
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
    respondInternalError(res, error, 'Failed to remove account.');
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
    respondInternalError(res, error, 'Failed to pause account.');
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
    respondInternalError(res, error, 'Failed to resume account.');
  }
});

/**
 * POST /api/cliproxy/auth/:provider/start - Start OAuth flow for a provider
 * Opens browser for authentication and returns account info when complete
 */
router.post('/:provider/start', async (req: Request, res: Response): Promise<void> => {
  const { provider } = req.params;
  const requestBody =
    req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
  const nicknameRaw = typeof requestBody.nickname === 'string' ? requestBody.nickname : undefined;
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
  // Trim nickname for consistency with CLI (oauth-handler.ts trims input)
  const nickname = nicknameRaw?.trim();
  const { method: kiroMethod, invalid: invalidKiroMethod } = parseKiroMethod(kiroMethodRaw);
  const { flow: kiroIDCFlow, invalid: invalidKiroIDCFlow } = parseKiroIDCFlow(kiroIDCFlowRaw);
  const { mode: gitlabAuthMode, invalid: invalidGitLabAuthMode } =
    parseGitLabAuthMode(gitlabAuthModeRaw);

  // Validate provider
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
    if (!gitlabPersonalAccessToken) {
      res.status(400).json({
        error: 'gitlabPersonalAccessToken is required when gitlabAuthMode=pat',
        code: 'MISSING_GITLAB_PAT',
      });
      return;
    }

    try {
      const localProvider = provider as CLIProxyProvider;
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
        knownTokenFiles
      );
      if (!tokenSnapshot) {
        res.status(409).json({
          error: 'GitLab PAT authentication completed, but CCS could not find the saved token.',
        });
        return;
      }

      const account = registerAccountFromToken(
        localProvider,
        getProviderTokenDir(localProvider),
        nickname,
        false,
        tokenSnapshot.file
      );
      if (!account) {
        res.status(409).json({
          error: 'GitLab PAT authentication succeeded, but account registration failed.',
        });
        return;
      }

      try {
        await ensureManagedModelPrefixes([account.provider]);
      } catch {
        // Keep auth success path non-fatal when prefix repair cannot run.
      }

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
      return;
    } catch (error) {
      respondInternalError(res, error, 'Failed to start GitLab PAT flow.');
      return;
    }
  }

  const existingAccounts = getProviderAccounts(provider as CLIProxyProvider);
  const nicknameError = getStartAuthNicknameError(
    provider as CLIProxyProvider,
    nickname,
    existingAccounts
  );
  if (nicknameError) {
    res.status(400).json(nicknameError);
    return;
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
      acceptAgyRisk: provider === 'agy',
      kiroMethod: provider === 'kiro' ? kiroMethod : undefined,
      kiroIDCStartUrl: provider === 'kiro' ? kiroIDCStartUrl : undefined,
      kiroIDCRegion: provider === 'kiro' ? kiroIDCRegion : undefined,
      kiroIDCFlow: provider === 'kiro' && kiroMethod === 'idc' ? kiroIDCFlow : undefined,
      gitlabAuthMode: provider === 'gitlab' ? gitlabAuthMode : undefined,
      gitlabBaseUrl: provider === 'gitlab' ? gitlabBaseUrl : undefined,
      fromUI: true, // Enable project selection prompt in UI
      noIncognito, // Kiro: use normal browser if enabled
    });

    if (account) {
      try {
        await ensureManagedModelPrefixes([account.provider]);
      } catch {
        // Keep OAuth success path non-fatal when prefix repair cannot run.
      }

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
      res.status(400).json({
        error: getStartAuthFailureMessage(provider as CLIProxyProvider),
      });
    }
  } catch (error) {
    respondInternalError(res, error, 'Failed to start OAuth flow.');
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
    respondInternalError(res, error, 'Failed to import Kiro token.');
  }
});

// ==================== Manual Callback Submission ====================

/**
 * POST /api/cliproxy/auth/:provider/start-url - Start OAuth and return auth URL immediately
 * Unlike /start which blocks until completion, this returns the URL for manual callback flow
 */
router.post('/:provider/start-url', async (req: Request, res: Response): Promise<void> => {
  const { provider } = req.params;
  const requestBody =
    req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
  const nicknameRaw = typeof requestBody.nickname === 'string' ? requestBody.nickname : undefined;
  const kiroMethodRaw = requestBody.kiroMethod;
  const gitlabAuthModeRaw = requestBody.gitlabAuthMode;
  const gitlabBaseUrl =
    typeof requestBody.gitlabBaseUrl === 'string' ? requestBody.gitlabBaseUrl.trim() : undefined;
  const riskAcknowledgement = requestBody.riskAcknowledgement;
  const nickname = nicknameRaw?.trim();
  const { method: kiroMethod, invalid: invalidKiroMethod } = parseKiroMethod(kiroMethodRaw);
  const { mode: gitlabAuthMode, invalid: invalidGitLabAuthMode } =
    parseGitLabAuthMode(gitlabAuthModeRaw);

  // Check remote mode
  const target = getProxyTarget();
  if (target.isRemote) {
    res.status(501).json({ error: 'Manual OAuth flow not available in remote mode' });
    return;
  }

  // Validate provider
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

  const existingAccounts = getProviderAccounts(provider as CLIProxyProvider);
  const nicknameError = getStartAuthNicknameError(
    provider as CLIProxyProvider,
    nickname,
    existingAccounts
  );
  if (nicknameError) {
    res.status(400).json(nicknameError);
    return;
  }

  // Phase 3: Pre-fetch credential guard for Plus-backend OAuth providers (gemini, agy).
  // Returns null for providers not in the table or when backend is not 'plus'.
  const credentialError = getPlusOAuthCredentialError(
    provider as CLIProxyProvider,
    getStoredConfiguredBackend()
  );
  if (credentialError) {
    console.error(
      `[cliproxy-auth-routes] start-url credential guard fired for provider=${provider}: ${credentialError}`
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

    // Call CLIProxyAPI to start OAuth and get auth URL
    // CLIProxyAPI management routes are under /v0/management prefix
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

    // Phase 4: Post-fetch auth-URL guard — detect Plus emitting an OAuth URL with empty client_id.
    // Only fires for table-listed providers (gemini, agy); returns null for all others.
    if (authUrl) {
      const authUrlError = getPlusAuthUrlCredentialError(provider as CLIProxyProvider, authUrl);
      if (authUrlError) {
        const redactedUrl = authUrl.split('?')[0];
        console.error(
          `[cliproxy-auth-routes] Plus emitted OAuth URL without client_id for provider=${provider} url=${redactedUrl}`
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

    // Some upstream flows return state first and provide auth_url in subsequent status polling.
    if (!authUrl && !oauthState) {
      res
        .status(500)
        .json({ error: 'No OAuth state or authorization URL received from CLIProxyAPI' });
      return;
    }

    if (oauthState) {
      rememberManualAuthState(oauthState, {
        nickname: nickname || undefined,
        knownTokenFiles: listProviderTokenSnapshots(provider as CLIProxyProvider),
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
      console.error(
        `[cliproxy-auth-routes] Invalid OAuth start response for provider=${provider}: ${error.message}`
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
    console.error(`[cliproxy-auth-routes] ${guidance.message} ${guidance.details}`);
    res.status(503).json(guidance);
  }
});

/**
 * GET /api/cliproxy/auth/:provider/status - Poll OAuth status
 * Checks if OAuth has completed for the given state
 */
router.get('/:provider/status', async (req: Request, res: Response): Promise<void> => {
  const { provider } = req.params;
  const { state } = req.query;

  if (!state || typeof state !== 'string') {
    res.status(400).json({ error: 'state query parameter required' });
    return;
  }

  // Validate provider
  if (!validProviders.includes(provider as CLIProxyProvider)) {
    res.status(400).json({ error: `Invalid provider: ${provider}` });
    return;
  }

  try {
    const target = getProxyTarget();

    // CLIProxyAPI management routes are under /v0/management prefix
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

        pendingManualAuthState.delete(state);
        res.status(409).json({
          status: 'error',
          error:
            'Authentication completed upstream, but no new local token was saved for this account. Update CCS/CLIProxy and retry.',
        });
        return;
      }

      const account = registerAccountFromToken(
        localProvider,
        getProviderTokenDir(localProvider),
        pendingAuth.nickname,
        false,
        tokenSnapshot.file
      );

      if (!account) {
        pendingManualAuthState.delete(state);
        res.status(409).json({
          status: 'error',
          error: getManualCallbackRegistrationError(localProvider),
        });
        return;
      }

      try {
        await ensureManagedModelPrefixes([account.provider]);
      } catch {
        // Keep manual callback success path non-fatal when prefix repair cannot run.
      }
      invalidateQuotaForRegisteredAccount(account);
      res.json({
        status: 'ok',
        account: {
          id: account.id,
          email: account.email,
          nickname: account.nickname,
          provider: account.provider,
          isDefault: account.isDefault,
        },
      });
      pendingManualAuthState.delete(state);
      return;
    }

    res.json(data);
  } catch {
    res.status(503).json({ status: 'error', error: 'CLIProxyAPI not reachable' });
  }
});

/**
 * Parse OAuth callback URL to extract code and state parameters.
 * @param url - The callback URL to parse
 * @returns Parsed components (code, state) or empty object on failure
 */
function parseCallbackUrl(url: string): { code?: string; state?: string } {
  try {
    const parsed = new URL(url);
    return {
      code: parsed.searchParams.get('code') || undefined,
      state: parsed.searchParams.get('state') || undefined,
    };
  } catch {
    return {};
  }
}

function parseAuthUrlState(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).searchParams.get('state');
  } catch {
    return null;
  }
}

/**
 * POST /api/cliproxy/auth/:provider/submit-callback - Submit OAuth callback URL manually
 * For cross-browser OAuth flows where callback cannot redirect directly
 */
router.post('/:provider/submit-callback', async (req: Request, res: Response): Promise<void> => {
  const { provider } = req.params;
  const { redirectUrl } = req.body;

  // Check remote mode
  const target = getProxyTarget();
  if (target.isRemote) {
    res.status(501).json({ error: 'Manual callback not available in remote mode' });
    return;
  }

  // Validate provider
  if (!validProviders.includes(provider as CLIProxyProvider)) {
    res.status(400).json({ error: `Invalid provider: ${provider}` });
    return;
  }

  // Validate redirectUrl
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

    // Forward to CLIProxyAPI /oauth-callback endpoint (under /v0/management prefix)
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
          pendingManualAuthState.delete(parsed.state);
        }
        res.status(409).json({
          error: getManualCallbackRegistrationError(localProvider),
        });
        return;
      }

      const account = registerAccountFromToken(
        localProvider,
        getProviderTokenDir(localProvider),
        pendingAuth.nickname,
        false,
        tokenSnapshot.file
      );

      if (!account) {
        if (parsed.state) {
          pendingManualAuthState.delete(parsed.state);
        }
        res.status(409).json({
          error: getManualCallbackRegistrationError(localProvider),
        });
        return;
      }

      if (parsed.state) {
        try {
          await ensureManagedModelPrefixes([account.provider]);
        } catch {
          // Keep manual callback success path non-fatal when prefix repair cannot run.
        }
      }
      invalidateQuotaForRegisteredAccount(account);

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
      if (parsed.state) {
        pendingManualAuthState.delete(parsed.state);
      }
      return;
    }

    const account = registerAccountFromToken(
      localProvider,
      getProviderTokenDir(localProvider),
      undefined,
      false,
      undefined
    );

    if (!account) {
      res.status(409).json({
        error: getManualCallbackRegistrationError(localProvider),
      });
      return;
    }

    invalidateQuotaForRegisteredAccount(account);

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
  } catch (error) {
    respondInternalError(res, error, 'CLIProxyAPI not reachable.', 503);
  }
});

export default router;
