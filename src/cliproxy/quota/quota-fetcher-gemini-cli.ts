/**
 * Quota Fetcher for Gemini CLI Accounts
 *
 * Fetches quota information from Google Cloud Code internal API.
 * Used for displaying bucket-based quotas grouped by model series.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getAuthDir } from '../config/config-generator';
import { getProviderAccounts, getPausedDir, setAccountTier } from '../accounts/account-manager';
import { getTokenExpiryTimestamp, sanitizeEmail, isTokenExpired } from '../auth/auth-utils';
import {
  buildGeminiCliBucketsFromParsedBuckets,
  type GeminiCliParsedBucket,
} from './gemini-cli-quota-normalizer';
import { mapExternalProviderName } from '../provider-capabilities';
import {
  buildManagementHeaders,
  buildProxyUrl,
  getProxyTarget,
} from '../proxy/proxy-target-resolver';
import type { GeminiCliQuotaResult, GeminiCliBucket } from './quota-types';
import {
  buildProviderEntitlementEvidence,
  getProviderTierLabel,
  isModelCapacityExhausted,
  normalizeProviderTierId,
} from '../auth/provider-entitlement-evidence';
import type { ProviderEntitlementEvidence } from '../auth/provider-entitlement-types';
import { createLogger } from '../../services/logging';

// Diagnostic-only logger: quota fetch progress, upstream HTTP status, and
// recovery hints. accountId is attached as provider context; token values
// are never logged (they live in auth files and are not read into messages).
const logger = createLogger('cliproxy:quota:gemini-cli');

/** Google Cloud Code API endpoints */
const GEMINI_CLI_API_BASE = 'https://cloudcode-pa.googleapis.com';
const GEMINI_CLI_API_VERSION = 'v1internal';
const GEMINI_CLI_QUOTA_URL = `${GEMINI_CLI_API_BASE}/${GEMINI_CLI_API_VERSION}:retrieveUserQuota`;
const GEMINI_CLI_CODE_ASSIST_URL = `${GEMINI_CLI_API_BASE}/${GEMINI_CLI_API_VERSION}:loadCodeAssist`;
const GEMINI_CLI_ERROR_DETAIL_MAX_LENGTH = 320;
const GEMINI_CLI_ERROR_DETAIL_TRUNCATION_SUFFIX = '...[truncated]';
const GEMINI_CLI_G1_CREDIT_TYPE = 'GOOGLE_ONE_AI';
const MANAGEMENT_API_TIMEOUT_MS = 5000;
const SECONDARY_REQUEST_TIMEOUT_MS = 2000;

/** Auth data extracted from Gemini CLI auth file */
interface GeminiCliAuthData {
  accessToken: string;
  projectId: string | null;
  isExpired: boolean;
  expiresAt: string | number | null;
}

/** Raw bucket from API response */
interface RawGeminiCliBucket {
  model_id?: string;
  modelId?: string;
  token_type?: string | null;
  tokenType?: string | null;
  remaining_fraction?: number;
  remainingFraction?: number;
  remaining_amount?: number;
  remainingAmount?: number;
  reset_time?: string | null;
  resetTime?: string | null;
}

/** Raw API response structure */
interface GeminiCliQuotaResponse {
  buckets?: RawGeminiCliBucket[];
}

interface GeminiCliCredits {
  creditType?: string;
  credit_type?: string;
  creditAmount?: string | number;
  credit_amount?: string | number;
}

interface GeminiCliUserTier {
  id?: string;
  availableCredits?: GeminiCliCredits[];
  available_credits?: GeminiCliCredits[];
}

interface GeminiCliCodeAssistResponse {
  currentTier?: GeminiCliUserTier | null;
  current_tier?: GeminiCliUserTier | null;
  paidTier?: GeminiCliUserTier | null;
  paid_tier?: GeminiCliUserTier | null;
}

interface ParsedGeminiCliErrorBody {
  errorCode?: string;
  errorDetail?: string;
  message?: string;
}

interface GeminiCliSupplementaryInfo {
  tierLabel: string | null;
  tierId: string | null;
  creditBalance: number | null;
  normalizedTier: 'free' | 'pro' | 'ultra' | 'unknown';
}

interface ManagementAuthFile {
  auth_index?: string | number;
  provider?: string;
  type?: string;
  email?: string;
  name?: string;
}

interface ManagementApiCallResponse {
  status_code?: number;
  body?: string;
}

interface ManagedResponse {
  status: number;
  bodyText: string;
  json: unknown;
  viaManagement: boolean;
}

interface ManagedGeminiAuthContext {
  authIndexLookupPromise?: Promise<ManagedGeminiAuthLookupResult>;
}

interface ManagedGeminiAuthLookupResult {
  authIndex: string | number | null;
  unavailable: boolean;
}

interface ManagedGeminiRequestResult {
  response: ManagedResponse | null;
  unavailable: boolean;
}

function getRemainingTimeoutMs(deadlineMs: number): number {
  return Math.max(1, deadlineMs - Date.now());
}

/**
 * Extract project ID from account field
 * Input: "user@example.com (cloudaicompanion-abc-123)"
 * Output: "cloudaicompanion-abc-123"
 */
function resolveGeminiCliProjectId(accountField: string): string | null {
  const regex = /\(([^()]+)\)/g;
  let match: RegExpExecArray | null;
  let lastMatch: string | null = null;
  while ((match = regex.exec(accountField)) !== null) {
    lastMatch = match[1];
  }
  return lastMatch;
}

/**
 * Extract access token from Gemini auth file data
 * Handles both flat (access_token) and nested (token.access_token) structures
 */
function extractAccessToken(data: Record<string, unknown>): string | null {
  // Flat structure: { access_token: "..." }
  if (typeof data.access_token === 'string') {
    return data.access_token;
  }
  // Nested structure: { token: { access_token: "..." } }
  if (data.token && typeof data.token === 'object') {
    const token = data.token as Record<string, unknown>;
    if (typeof token.access_token === 'string') {
      return token.access_token;
    }
  }
  return null;
}

/**
 * Extract expiry from Gemini auth file data
 * Handles both flat (expired) and nested (token.expiry) structures
 */
function extractExpiry(data: Record<string, unknown>): string | number | null {
  // Flat structure: { expired: "..." }
  if (typeof data.expired === 'string') {
    return data.expired;
  }
  if (typeof data.expired === 'number') {
    return data.expired;
  }
  // Nested structure: { token: { expiry: "..." } }
  if (data.token && typeof data.token === 'object') {
    const token = data.token as Record<string, unknown>;
    if (typeof token.expiry === 'string') {
      return token.expiry;
    }
    if (typeof token.expiry === 'number') {
      return token.expiry;
    }
  }
  return null;
}

/**
 * Check if file matches Gemini CLI auth file patterns
 * Patterns: gemini-*.json OR *-gen-lang-client-*.json OR email@domain.com-*.json with type=gemini
 */
function isGeminiAuthFile(filename: string): boolean {
  if (!filename.endsWith('.json')) return false;
  // Legacy pattern: gemini-email.json
  if (filename.startsWith('gemini-')) return true;
  // New pattern: email-gen-lang-client-projectId.json
  if (filename.includes('-gen-lang-client-')) return true;
  // Check if contains @ (email pattern) - will verify type inside
  if (filename.includes('@')) return true;
  return false;
}

function safeParseJson(bodyText: string): unknown {
  try {
    return JSON.parse(bodyText);
  } catch {
    return null;
  }
}

async function readManagedResponse(
  response: Response,
  viaManagement: boolean
): Promise<ManagedResponse> {
  const bodyText = await response.text();
  return {
    status: response.status,
    bodyText,
    json: safeParseJson(bodyText),
    viaManagement,
  };
}

function isGeminiAuthFileForAccount(file: ManagementAuthFile, accountId: string): boolean {
  const rawProvider = normalizeStringValue(file.provider ?? file.type);
  if (!rawProvider || mapExternalProviderName(rawProvider) !== 'gemini') {
    return false;
  }

  const email = normalizeStringValue(file.email);
  const normalizedAccountId = accountId.trim().toLowerCase();
  if (email?.toLowerCase() === normalizedAccountId) {
    return true;
  }

  const normalizedName = normalizeStringValue(file.name);
  if (!normalizedName) {
    return false;
  }

  const normalizedFileName = normalizedName.toLowerCase();
  const sanitizedAccount = sanitizeEmail(accountId).toLowerCase();
  return (
    normalizedFileName === `gemini-${sanitizedAccount}.json` ||
    normalizedFileName.startsWith(`${normalizedAccountId}-gen-lang-client-`) ||
    normalizedFileName.includes(sanitizedAccount)
  );
}

async function findManagedGeminiAuthIndex(
  accountId: string,
  timeoutMs: number
): Promise<ManagedGeminiAuthLookupResult> {
  const target = getProxyTarget();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(buildProxyUrl(target, '/v0/management/auth-files'), {
      signal: controller.signal,
      headers: buildManagementHeaders(target),
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return { authIndex: null, unavailable: true };
    }

    const data = (await response.json()) as { files?: ManagementAuthFile[] };
    const match = data.files?.find((file) => isGeminiAuthFileForAccount(file, accountId));
    return { authIndex: match?.auth_index ?? null, unavailable: false };
  } catch {
    clearTimeout(timeoutId);
    return { authIndex: null, unavailable: true };
  }
}

async function getManagedGeminiAuthIndex(
  accountId: string,
  timeoutMs: number,
  context?: ManagedGeminiAuthContext
): Promise<ManagedGeminiAuthLookupResult> {
  if (!context) {
    return await findManagedGeminiAuthIndex(accountId, timeoutMs);
  }

  context.authIndexLookupPromise ??= findManagedGeminiAuthIndex(accountId, timeoutMs);
  return await context.authIndexLookupPromise;
}

class GeminiManagedAuthUnavailableError extends Error {
  constructor() {
    super('CLIProxy managed Gemini auth is temporarily unavailable');
    this.name = 'GeminiManagedAuthUnavailableError';
  }
}

async function performManagedGeminiRequest(
  accountId: string,
  url: string,
  body: string,
  timeoutMs: number,
  authContext?: ManagedGeminiAuthContext
): Promise<ManagedGeminiRequestResult> {
  const deadlineMs = Date.now() + timeoutMs;
  const lookupResult = await getManagedGeminiAuthIndex(
    accountId,
    getRemainingTimeoutMs(deadlineMs),
    authContext
  );
  if (lookupResult.unavailable) {
    return { response: null, unavailable: true };
  }

  const authIndex = lookupResult.authIndex;
  if (authIndex === null || authIndex === undefined) {
    return { response: null, unavailable: false };
  }

  const target = getProxyTarget();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), getRemainingTimeoutMs(deadlineMs));

  try {
    const response = await fetch(buildProxyUrl(target, '/v0/management/api-call'), {
      method: 'POST',
      signal: controller.signal,
      headers: buildManagementHeaders(target, {
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({
        auth_index: authIndex,
        method: 'POST',
        url,
        header: {
          Authorization: 'Bearer $TOKEN$',
          'Content-Type': 'application/json',
        },
        data: body,
      }),
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return { response: null, unavailable: true };
    }

    const apiResponse = (await response.json()) as ManagementApiCallResponse;
    const bodyText = typeof apiResponse.body === 'string' ? apiResponse.body : '';
    return {
      response: {
        status: typeof apiResponse.status_code === 'number' ? apiResponse.status_code : 500,
        bodyText,
        json: safeParseJson(bodyText),
        viaManagement: true,
      },
      unavailable: false,
    };
  } catch {
    clearTimeout(timeoutId);
    return { response: null, unavailable: true };
  }
}

async function performGeminiCliRequest(
  accountId: string,
  accessToken: string,
  url: string,
  body: string,
  preferManagement = false,
  authContext?: ManagedGeminiAuthContext
): Promise<ManagedResponse> {
  let managementAttempted = false;
  let managementUnavailable = false;

  if (preferManagement) {
    managementAttempted = true;
    const managedResult = await performManagedGeminiRequest(
      accountId,
      url,
      body,
      MANAGEMENT_API_TIMEOUT_MS,
      authContext
    );
    managementUnavailable = managedResult.unavailable;
    if (managedResult.response) {
      return managedResult.response;
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    managementAttempted ? SECONDARY_REQUEST_TIMEOUT_MS : MANAGEMENT_API_TIMEOUT_MS
  );

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body,
    });
    clearTimeout(timeoutId);

    const directResult = await readManagedResponse(response, false);
    if (directResult.status !== 401) {
      return directResult;
    }

    if (managementAttempted) {
      if (managementUnavailable) {
        throw new GeminiManagedAuthUnavailableError();
      }
      return directResult;
    }

    const managedResult = await performManagedGeminiRequest(
      accountId,
      url,
      body,
      SECONDARY_REQUEST_TIMEOUT_MS,
      authContext
    );
    if (managedResult.response) {
      return managedResult.response;
    }
    if (managedResult.unavailable) {
      throw new GeminiManagedAuthUnavailableError();
    }
    return directResult;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Read auth data from Gemini CLI auth file
 * Supports multiple file naming conventions and JSON structures
 */
function readGeminiCliAuthData(accountId: string): GeminiCliAuthData | null {
  const authDirs = [getAuthDir(), getPausedDir()];
  const sanitizedId = sanitizeEmail(accountId);
  const expectedFiles = [
    `gemini-${sanitizedId}.json`, // Legacy format
    `${accountId}-gen-lang-client-`, // New format prefix (partial match)
  ];

  for (const authDir of authDirs) {
    if (!fs.existsSync(authDir)) continue;

    // Try exact legacy match first
    const legacyPath = path.join(authDir, expectedFiles[0]);
    if (fs.existsSync(legacyPath)) {
      try {
        const content = fs.readFileSync(legacyPath, 'utf-8');
        const data = JSON.parse(content) as Record<string, unknown>;
        const accessToken = extractAccessToken(data);
        if (accessToken) {
          const projectId =
            typeof data.project_id === 'string'
              ? data.project_id
              : resolveGeminiCliProjectId(String(data.account || ''));
          const expiry = extractExpiry(data);

          return {
            accessToken,
            projectId,
            isExpired: isTokenExpired(expiry ?? undefined),
            expiresAt: expiry,
          };
        }
      } catch {
        // Continue to fallback
      }
    }

    // Scan directory for matching files
    const files = fs.readdirSync(authDir);
    for (const file of files) {
      if (!isGeminiAuthFile(file)) continue;

      const candidatePath = path.join(authDir, file);
      try {
        const content = fs.readFileSync(candidatePath, 'utf-8');
        const data = JSON.parse(content) as Record<string, unknown>;

        // Check if this file matches our account
        const fileEmail = typeof data.email === 'string' ? data.email : null;
        const fileType = typeof data.type === 'string' ? data.type : null;
        const matchesEmail = fileEmail === accountId;
        const matchesFilename = file.startsWith(`${accountId}-`) || file.includes(sanitizedId);
        const isGeminiType = fileType === 'gemini' || fileType === 'gemini-cli';

        // Must match account AND be gemini type (or legacy gemini- prefix)
        if ((matchesEmail || matchesFilename) && (isGeminiType || file.startsWith('gemini-'))) {
          const accessToken = extractAccessToken(data);
          if (accessToken) {
            const projectId =
              typeof data.project_id === 'string'
                ? data.project_id
                : resolveGeminiCliProjectId(String(data.account || ''));
            const expiry = extractExpiry(data);

            return {
              accessToken,
              projectId,
              isExpired: isTokenExpired(expiry ?? undefined),
              expiresAt: expiry,
            };
          }
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

function normalizeStringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeNumberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function resolveGeminiCliTierId(payload: GeminiCliCodeAssistResponse | null): string | null {
  if (!payload) return null;
  const currentTier = payload.currentTier ?? payload.current_tier;
  const paidTier = payload.paidTier ?? payload.paid_tier;
  const rawId = normalizeStringValue(paidTier?.id) ?? normalizeStringValue(currentTier?.id);
  return rawId ? rawId.toLowerCase() : null;
}

function resolveGeminiCliTierLabel(payload: GeminiCliCodeAssistResponse | null): string | null {
  const tierId = resolveGeminiCliTierId(payload);
  return getProviderTierLabel(tierId);
}

function resolveGeminiCliCreditBalance(payload: GeminiCliCodeAssistResponse | null): number | null {
  if (!payload) return null;

  const paidTier = payload.paidTier ?? payload.paid_tier;
  const currentTier = payload.currentTier ?? payload.current_tier;
  const tier = paidTier ?? currentTier;
  if (!tier) return null;

  const credits = tier.availableCredits ?? tier.available_credits ?? [];
  let total = 0;
  let found = false;
  for (const credit of credits) {
    const creditType = normalizeStringValue(credit.creditType ?? credit.credit_type);
    if (creditType !== GEMINI_CLI_G1_CREDIT_TYPE) continue;

    const amount = normalizeNumberValue(credit.creditAmount ?? credit.credit_amount);
    if (amount !== null) {
      total += amount;
      found = true;
    }
  }

  return found ? total : null;
}

async function fetchGeminiCliSupplementary(
  accountId: string,
  accessToken: string,
  projectId: string,
  verbose: boolean,
  authContext?: ManagedGeminiAuthContext
): Promise<GeminiCliSupplementaryInfo> {
  const requestBody = JSON.stringify({
    cloudaicompanionProject: projectId,
    metadata: {
      ideType: 'IDE_UNSPECIFIED',
      platform: 'PLATFORM_UNSPECIFIED',
      pluginType: 'GEMINI',
      duetProject: projectId,
    },
  });

  try {
    const response = await performGeminiCliRequest(
      accountId,
      accessToken,
      GEMINI_CLI_CODE_ASSIST_URL,
      requestBody,
      false,
      authContext
    );

    if (response.status !== 200) {
      if (verbose) {
        const source = response.viaManagement ? 'managed' : 'direct';
        logger.info(
          'gemini_cli.supplementary_metadata_unavailable',
          `Gemini CLI supplementary metadata unavailable via ${source}: HTTP ${response.status}`,
          { provider: 'gemini', accountId, httpStatus: response.status, source }
        );
      }
      return { tierLabel: null, tierId: null, creditBalance: null, normalizedTier: 'unknown' };
    }

    const payload = response.json as GeminiCliCodeAssistResponse | null;
    return {
      tierLabel: resolveGeminiCliTierLabel(payload),
      tierId: resolveGeminiCliTierId(payload),
      creditBalance: resolveGeminiCliCreditBalance(payload),
      normalizedTier: normalizeProviderTierId(resolveGeminiCliTierId(payload)),
    };
  } catch (error) {
    if (verbose) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.info(
        'gemini_cli.supplementary_metadata_skipped',
        `Gemini CLI supplementary metadata skipped: ${message}`,
        {
          provider: 'gemini',
          accountId,
          err: error instanceof Error ? { name: error.name, message } : { message },
        }
      );
    }
    return { tierLabel: null, tierId: null, creditBalance: null, normalizedTier: 'unknown' };
  }
}

function buildGeminiCliFailureResult(
  accountId: string,
  projectId: string | null,
  options: {
    error: string;
    httpStatus?: number;
    errorCode?: string;
    errorDetail?: string;
    actionHint?: string;
    retryable?: boolean;
    needsReauth?: boolean;
    isForbidden?: boolean;
    entitlement?: ProviderEntitlementEvidence;
  }
): GeminiCliQuotaResult {
  return {
    success: false,
    buckets: [],
    projectId,
    tierLabel: null,
    tierId: null,
    creditBalance: null,
    lastUpdated: Date.now(),
    accountId,
    error: options.error,
    httpStatus: options.httpStatus,
    errorCode: options.errorCode,
    errorDetail: options.errorDetail,
    actionHint: options.actionHint,
    retryable: options.retryable,
    needsReauth: options.needsReauth,
    isForbidden: options.isForbidden,
    entitlement: options.entitlement,
  };
}

function sanitizeGeminiCliErrorDetail(bodyText: string): string | undefined {
  const trimmed = bodyText.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^<!doctype html/i.test(trimmed) || /^<html/i.test(trimmed) || /^<[^>]+>/.test(trimmed)) {
    return '[HTML error response omitted]';
  }

  let sanitized = trimmed
    .replace(
      /"(access[_-]?token|refresh[_-]?token|authorization|cookie|set-cookie|api[_-]?key|session[_-]?token|token)"\s*:\s*"[^"]*"/gi,
      '"$1":"[redacted]"'
    )
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]')
    .replace(/\s+/g, ' ');

  if (sanitized.length > GEMINI_CLI_ERROR_DETAIL_MAX_LENGTH) {
    sanitized = `${sanitized.slice(
      0,
      GEMINI_CLI_ERROR_DETAIL_MAX_LENGTH - GEMINI_CLI_ERROR_DETAIL_TRUNCATION_SUFFIX.length
    )}${GEMINI_CLI_ERROR_DETAIL_TRUNCATION_SUFFIX}`;
  }

  return sanitized;
}

function extractGeminiCliNestedMessage(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const nested = extractGeminiCliNestedMessage(entry);
      if (nested) return nested;
    }
    return undefined;
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const directMessage = [
    record.message,
    record.localizedMessage,
    record.description,
    record.reason,
    record.error,
  ].find(
    (candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0
  );
  if (directMessage) {
    return directMessage;
  }

  return undefined;
}

function parseGeminiCliErrorBody(bodyText: string): ParsedGeminiCliErrorBody {
  const trimmed = bodyText.trim();
  if (!trimmed) {
    return {};
  }

  const sanitizedDetail = sanitizeGeminiCliErrorDetail(trimmed);

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const topLevelMessage = [parsed.message, parsed.error].find(
      (candidate): candidate is string =>
        typeof candidate === 'string' && candidate.trim().length > 0
    );
    const topLevelCode = [parsed.code, parsed.status].find(
      (candidate): candidate is string =>
        typeof candidate === 'string' && candidate.trim().length > 0
    );

    if (parsed.error && typeof parsed.error === 'object') {
      const error = parsed.error as Record<string, unknown>;
      return {
        errorCode:
          [error.status, error.code, topLevelCode].find(
            (candidate): candidate is string =>
              typeof candidate === 'string' && candidate.trim().length > 0
          ) || undefined,
        errorDetail: sanitizedDetail,
        message:
          [
            error.message,
            error.error,
            extractGeminiCliNestedMessage(error.details),
            topLevelMessage,
          ].find(
            (candidate): candidate is string =>
              typeof candidate === 'string' && candidate.trim().length > 0
          ) || undefined,
      };
    }

    return {
      errorCode: topLevelCode,
      errorDetail: sanitizedDetail,
      message:
        [topLevelMessage, extractGeminiCliNestedMessage(parsed.details)].find(
          (candidate): candidate is string =>
            typeof candidate === 'string' && candidate.trim().length > 0
        ) || undefined,
    };
  } catch {
    return {
      errorDetail: sanitizedDetail,
      message: sanitizedDetail === '[HTML error response omitted]' ? undefined : trimmed,
    };
  }
}

function buildGeminiCliForbiddenActionHint(parsed: ParsedGeminiCliErrorBody): string {
  const combined = `${parsed.message || ''} ${parsed.errorDetail || ''}`.toLowerCase();
  if (combined.includes('verify') || combined.includes('verification')) {
    return 'Complete the Google account verification mentioned above, then retry quota refresh.';
  }
  if (combined.includes('project')) {
    return 'Confirm this Google project still has Gemini CLI quota access, then retry.';
  }
  return 'Check the Google account or workspace access shown above, then retry quota refresh.';
}

function buildGeminiCliHttpFailureResult(
  accountId: string,
  projectId: string | null,
  status: number,
  bodyText: string
): GeminiCliQuotaResult {
  const parsed = parseGeminiCliErrorBody(bodyText);

  if (status === 401) {
    return buildGeminiCliFailureResult(accountId, projectId, {
      error: parsed.message || 'Token expired or invalid',
      httpStatus: 401,
      errorCode: parsed.errorCode || 'reauth_required',
      errorDetail: parsed.errorDetail,
      actionHint: 'Run ccs gemini --auth to reconnect this account.',
      needsReauth: true,
      retryable: false,
    });
  }

  if (status === 403) {
    return buildGeminiCliFailureResult(accountId, projectId, {
      error: parsed.message || 'Quota access forbidden for this account',
      httpStatus: 403,
      errorCode: parsed.errorCode || 'quota_api_forbidden',
      errorDetail: parsed.errorDetail,
      actionHint: buildGeminiCliForbiddenActionHint(parsed),
      isForbidden: true,
      retryable: false,
      entitlement: buildProviderEntitlementEvidence({
        normalizedTier: 'unknown',
        source: 'runtime_inference',
        confidence: 'medium',
        accessState: 'not_entitled',
        capacityState: 'unknown',
      }),
    });
  }

  if (status === 429) {
    if (isModelCapacityExhausted(parsed.message, parsed.errorDetail, parsed.errorCode)) {
      return buildGeminiCliFailureResult(accountId, projectId, {
        error: parsed.message || 'Model capacity exhausted for this account right now',
        httpStatus: 429,
        errorCode: 'capacity_exhausted',
        errorDetail: parsed.errorDetail,
        actionHint:
          'Retry later or switch to another Gemini model. This indicates temporary model capacity, not an authentication failure.',
        retryable: true,
        entitlement: buildProviderEntitlementEvidence({
          normalizedTier: 'unknown',
          source: 'runtime_inference',
          confidence: 'medium',
          accessState: 'entitled',
          capacityState: 'capacity_exhausted',
          notes: 'Upstream returned MODEL_CAPACITY_EXHAUSTED for this model.',
        }),
      });
    }

    return buildGeminiCliFailureResult(accountId, projectId, {
      error: parsed.message || 'Rate limited - try again later',
      httpStatus: 429,
      errorCode: parsed.errorCode || 'rate_limited',
      errorDetail: parsed.errorDetail,
      actionHint: 'Retry after a short delay.',
      retryable: true,
      entitlement: buildProviderEntitlementEvidence({
        normalizedTier: 'unknown',
        source: 'runtime_inference',
        confidence: 'low',
        accessState: 'unknown',
        capacityState: 'rate_limited',
      }),
    });
  }

  if (status >= 500) {
    return buildGeminiCliFailureResult(accountId, projectId, {
      error: parsed.message || `Gemini quota service unavailable (HTTP ${status})`,
      httpStatus: status,
      errorCode: parsed.errorCode || 'provider_unavailable',
      errorDetail: parsed.errorDetail,
      actionHint: 'Retry later. This looks like a temporary Google upstream problem.',
      retryable: true,
    });
  }

  return buildGeminiCliFailureResult(accountId, projectId, {
    error: parsed.message || `Gemini quota request failed (HTTP ${status})`,
    httpStatus: status,
    errorCode: parsed.errorCode || 'quota_request_failed',
    errorDetail: parsed.errorDetail,
    actionHint: 'Inspect the upstream response details and retry if appropriate.',
    retryable: false,
  });
}

/**
 * Build GeminiCliBucket array from API response
 * Groups buckets by model series and token type
 */
function buildGeminiCliBuckets(rawBuckets: RawGeminiCliBucket[]): GeminiCliBucket[] {
  const parsedBuckets = rawBuckets
    .map((bucket): GeminiCliParsedBucket | null => {
      const modelId = normalizeStringValue(bucket.model_id ?? bucket.modelId);
      if (!modelId) return null;

      const tokenType = normalizeStringValue(bucket.token_type ?? bucket.tokenType);
      const remainingFractionRaw = normalizeNumberValue(
        bucket.remaining_fraction ?? bucket.remainingFraction
      );
      const remainingAmount = normalizeNumberValue(
        bucket.remaining_amount ?? bucket.remainingAmount
      );
      const resetTime = normalizeStringValue(bucket.reset_time ?? bucket.resetTime);

      let fallbackFraction: number | null = null;
      if (remainingAmount !== null) {
        fallbackFraction = remainingAmount <= 0 ? 0 : null;
      } else if (resetTime) {
        fallbackFraction = 0;
      }

      return {
        modelId,
        tokenType,
        remainingFraction: remainingFractionRaw ?? fallbackFraction ?? 1,
        remainingAmount,
        resetTime,
      };
    })
    .filter((bucket): bucket is GeminiCliParsedBucket => bucket !== null);

  return buildGeminiCliBucketsFromParsedBuckets(parsedBuckets);
}

/**
 * Internal helper: Fetch quota with validated auth data
 * Extracted to support auto-refresh retry logic
 */
async function fetchWithAuthData(
  authData: GeminiCliAuthData,
  accountId: string,
  verbose: boolean
): Promise<GeminiCliQuotaResult> {
  if (!authData.projectId) {
    const error = 'Cannot resolve project ID from auth file';
    if (verbose) {
      logger.error('gemini_cli.missing_project_id', `Error: ${error}`, {
        provider: 'gemini',
        accountId,
      });
    }
    return buildGeminiCliFailureResult(accountId, null, {
      error,
      errorCode: 'missing_project_id',
      actionHint: 'Run ccs gemini --auth to reconnect this account and recover the project ID.',
      retryable: false,
    });
  }

  const authContext: ManagedGeminiAuthContext = {};
  const supplementaryPromise = fetchGeminiCliSupplementary(
    accountId,
    authData.accessToken,
    authData.projectId,
    verbose,
    authContext
  );
  const requestBody = JSON.stringify({ project: authData.projectId });

  try {
    const response = await performGeminiCliRequest(
      accountId,
      authData.accessToken,
      GEMINI_CLI_QUOTA_URL,
      requestBody,
      authData.isExpired,
      authContext
    );

    if (verbose) {
      const source = response.viaManagement ? 'managed' : 'direct';
      logger.info(
        'gemini_cli.api_status',
        `Gemini CLI API status via ${source}: ${response.status}`,
        { provider: 'gemini', accountId, httpStatus: response.status, source }
      );
    }

    if (response.status !== 200) {
      return buildGeminiCliHttpFailureResult(
        accountId,
        authData.projectId,
        response.status,
        response.bodyText
      );
    }

    const data = response.json as GeminiCliQuotaResponse | null;
    const rawBuckets = data?.buckets || [];
    const buckets = buildGeminiCliBuckets(rawBuckets);
    const supplementary = await supplementaryPromise;

    if (verbose) {
      logger.info('gemini_cli.buckets_found', `Gemini CLI buckets found: ${buckets.length}`, {
        provider: 'gemini',
        accountId,
        bucketCount: buckets.length,
      });
    }

    if (supplementary.normalizedTier !== 'unknown') {
      setAccountTier('gemini', accountId, supplementary.normalizedTier);
    }

    return {
      success: true,
      buckets,
      projectId: authData.projectId,
      tierLabel: supplementary.tierLabel,
      tierId: supplementary.tierId,
      creditBalance: supplementary.creditBalance,
      entitlement: buildProviderEntitlementEvidence({
        normalizedTier: supplementary.normalizedTier,
        rawTierId: supplementary.tierId,
        rawTierLabel: supplementary.tierLabel,
        source: supplementary.tierId ? 'runtime_api' : 'runtime_inference',
        confidence: supplementary.tierId ? 'high' : 'medium',
        accessState: 'entitled',
        capacityState: 'available',
      }),
      lastUpdated: Date.now(),
      accountId,
    };
  } catch (err) {
    if (err instanceof GeminiManagedAuthUnavailableError) {
      return buildGeminiCliFailureResult(accountId, authData.projectId, {
        error: 'Gemini delegated auth refresh is temporarily unavailable',
        errorCode: 'managed_auth_unavailable',
        errorDetail: err.message,
        actionHint: 'Retry later. CLIProxy management could not refresh this Gemini account.',
        retryable: true,
      });
    }

    const errorMsg =
      err instanceof Error && err.name === 'AbortError'
        ? 'Request timeout'
        : err instanceof Error
          ? err.message
          : 'Unknown error';

    if (verbose) {
      logger.error('gemini_cli.quota_fetch_error', `Gemini CLI quota error: ${errorMsg}`, {
        provider: 'gemini',
        accountId,
        err: err instanceof Error ? { name: err.name, message: errorMsg } : { message: errorMsg },
      });
    }

    return buildGeminiCliFailureResult(accountId, authData.projectId, {
      error: errorMsg,
      errorCode:
        err instanceof Error && err.name === 'AbortError' ? 'network_timeout' : 'network_error',
      actionHint: 'Retry later. This looks temporary.',
      retryable: true,
      httpStatus: err instanceof Error && err.name === 'AbortError' ? 408 : undefined,
    });
  }
}

/**
 * Fetch quota for a single Gemini CLI account
 *
 * @param accountId - Account identifier (email)
 * @param verbose - Show detailed diagnostics
 * @returns Quota result with buckets and percentages
 */
export async function fetchGeminiCliQuota(
  accountId: string,
  verbose = false
): Promise<GeminiCliQuotaResult> {
  if (verbose) {
    logger.info('gemini_cli.fetch_start', `Fetching Gemini CLI quota for ${accountId}...`, {
      provider: 'gemini',
      accountId,
    });
  }

  const authData = readGeminiCliAuthData(accountId);
  if (!authData) {
    const error = 'Auth file not found for Gemini account';
    if (verbose) {
      logger.error('gemini_cli.auth_file_missing', `Error: ${error}`, {
        provider: 'gemini',
        accountId,
      });
    }
    return buildGeminiCliFailureResult(accountId, null, {
      error,
      errorCode: 'auth_file_missing',
      actionHint: 'Run ccs gemini --auth to reconnect this account.',
      retryable: false,
    });
  }

  if (authData.isExpired && verbose) {
    const expiresAt = getTokenExpiryTimestamp(authData.expiresAt);
    const expiryLabel = expiresAt ? new Date(expiresAt).toISOString() : 'unknown';
    logger.info(
      'gemini_cli.token_expired',
      `Gemini access token is expired (${expiryLabel}); quota requests will defer to managed auth when available.`,
      { provider: 'gemini', accountId, tokenExpired: true, expiresAt: expiryLabel }
    );
  }

  return await fetchWithAuthData(authData, accountId, verbose);
}

/**
 * Fetch quota for all Gemini CLI accounts
 *
 * @param verbose - Show detailed diagnostics
 * @returns Array of account quotas
 */
export async function fetchAllGeminiCliQuotas(
  verbose = false
): Promise<{ account: string; quota: GeminiCliQuotaResult }[]> {
  const accounts = getProviderAccounts('gemini');

  if (accounts.length === 0) {
    return [];
  }

  const results = await Promise.all(
    accounts.map(async (account) => ({
      account: account.id,
      quota: await fetchGeminiCliQuota(account.id, verbose),
    }))
  );

  return results;
}

export const __testExports = {
  sanitizeGeminiCliErrorDetail,
  extractGeminiCliNestedMessage,
  parseGeminiCliErrorBody,
  buildGeminiCliForbiddenActionHint,
};

// Export for testing
export { resolveGeminiCliProjectId, buildGeminiCliBuckets };
