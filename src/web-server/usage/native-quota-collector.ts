/**
 * Native subscription quota collector — the ONLY server-side fetch surface for
 * the user's own Claude Code + Codex subscription quota.
 *
 * The macOS bar reads localhost /api/bar/summary and NEVER calls Anthropic or
 * ChatGPT. All upstream traffic originates here, under strict safety controls,
 * because these endpoints are undocumented and hostile to polling (persistent
 * 429s, no Retry-After, first-party-only policy). The controls below exist to
 * protect the user's accounts:
 *
 *   - long TTL (10 min) on-demand cache, never a tight timer loop
 *   - in-flight coalescing so concurrent /summary calls share one fetch
 *   - Retry-After honored; exponential backoff + jitter on 429/5xx
 *   - circuit breaker stops calling after repeated 429s for a cooldown
 *   - serve-stale-on-failure; only omit a row when there is genuinely no data
 *
 * Claude path: reads per-profile .credentials.json (file-only, NO keychain)
 * and polls api.anthropic.com/api/oauth/usage. If the file is absent the
 * profile is emitted as a parked row (paused:true) — never a keychain call.
 *
 * Codex path: PRIMARY = live network (chatgpt.com/backend-api/wham/usage, via
 * fetchCodexQuota), FALLBACK = local session logs (getCodexLocalQuota), mirroring
 * the same safety pattern as the Claude path.
 *
 * Multi-profile: each Claude or Codex profile gets its own ProviderState so a
 * 429 on one profile never trips the breaker of another. The active/default
 * profile for each surface is live-polled (paused:false); all other profiles are
 * cache-only (paused:true, force=false hardcoded) so the 2.5s /summary deadline
 * is maintained — at most 2 live upstream calls per /summary regardless of
 * profile count.
 *
 * NO macOS Keychain access anywhere in this module. The old global-default
 * Claude reader (readClaudeCredentials) is kept for back-compat but is no longer
 * used by the multi-profile path.
 */

import {
  readClaudeCredentials,
  getAccessToken,
  getSubscriptionTier,
  hasSupportedSubscription,
  type ClaudeNativeCredentials,
} from './claude-native-credentials';
import { fetchClaudeQuotaWithToken } from '../../cliproxy/quota/quota-fetcher-claude';
import { fetchCodexQuota } from '../../cliproxy/quota/quota-fetcher-codex';
import { getDefaultAccount } from '../../cliproxy/accounts/query';
import { getCodexLocalQuota, type CodexLocalQuota } from './codex-local-quota-collector';
import type { ClaudeQuotaResult, CodexQuotaResult } from '../../cliproxy/quota/quota-types';
import type { BarSummaryRow, QuotaWindowDetail } from '../routes/bar-routes';

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { getCcsDir } from '../../utils/config-manager';

// ============================================================================
// Safety constants (concrete, named, module-level)
// ============================================================================

/** On-demand cache TTL. Floor is 5 min; we use 10 min because the bar polls
 *  /summary far more often than a hook fires. */
const NATIVE_QUOTA_TTL_MS = 600_000; // 10 minutes
// After a 401/expired result, cache the reauth row and cool the profile down so
// an expired account is shown dimmed and re-checked at most this often instead
// of being re-polled (and re-401'd) on every /summary refresh.
const REAUTH_COOLDOWN_MS = NATIVE_QUOTA_TTL_MS; // 10 minutes
// Parked rows (no on-disk creds, quotaStatus 'unsupported') re-check on a short
// TTL — re-statting credentials is cheap, and this lets a profile that the user
// just logged into appear within seconds instead of staying dimmed for the full
// quota TTL. (Reauth/error rows keep the full TTL + cooldown to avoid re-401s.)
const PARKED_TTL_MS = 30_000; // 30 seconds

/** Exponential backoff base; delay = min(base * 2^n, MAX) + jitter. */
const RETRY_BASE_MS = 1_000;

/** Ceiling for any single backoff / Retry-After cooldown derived from one call. */
const MAX_BACKOFF_MS = 60_000; // 1 minute

/** Jitter added to backoff to avoid synchronized retries. */
const JITTER_MAX_MS = 500;

/** Consecutive 429s that trip the breaker open. */
const CB_TRIP_THRESHOLD = 3;

/** How long the breaker stays open (zero network) once tripped. */
const CB_COOLDOWN_MS = 900_000; // 15 minutes

// Surface identifiers
const SURFACE_CLAUDE = 'ccs';
const SURFACE_CODEX = 'ccsx';

// The "default way of running" a surface — the bare login (e.g. ~/.codex for
// ccsx), as opposed to a named `ccsx <profile>` profile. Rendered in the Bar as
// the base command ("ccsx") with a "default" badge, not as a named profile.
const DEFAULT_PROFILE = 'default';

// Provider values on the wire (unchanged from before)
const CLAUDE_NATIVE_PROVIDER = 'claude-code';
const CODEX_NATIVE_PROVIDER = 'codex';

// Keep old names as aliases to avoid breaking the existing global collector path
const CLAUDE_PROVIDER = CLAUDE_NATIVE_PROVIDER;
const CODEX_PROVIDER = CODEX_NATIVE_PROVIDER;

// ============================================================================
// Injectable dependencies (tests inject mocks; never live endpoints in CI)
// ============================================================================

export interface NativeQuotaDeps {
  /** Read the native Claude Code credentials (global default path). */
  readCredentials?: () => ClaudeNativeCredentials | null;
  /**
   * Read credentials for a specific Claude profile (file-only, no keychain).
   * Injected so tests never touch real fs or Keychain.
   * profile: the profile name (e.g. "work"); returns null when absent/unparseable.
   */
  readClaudeCredentialsForProfile?: (profile: string) => ClaudeNativeCredentials | null;
  /** Fetch Claude quota with a directly-supplied native token. */
  fetchClaudeQuota?: (accessToken: string, accountId?: string) => Promise<ClaudeQuotaResult>;
  /**
   * Resolve the default Codex account ID for network quota fetch.
   * Returns null when no Codex account is configured (bar omits the live path).
   */
  getDefaultCodexAccountId?: () => string | null;
  /**
   * Fetch Codex quota live from the network.
   * Injected so tests never hit chatgpt.com.
   */
  fetchCodexNetworkQuota?: (accountId: string) => Promise<CodexQuotaResult>;
  /** Read Codex quota from local session logs (zero network, fallback). */
  getCodexQuota?: () => Promise<CodexLocalQuota | null>;
  /**
   * Read the native Codex auth for a profile (file-only, no keychain).
   * DEFAULT_PROFILE ('default') reads ~/.codex/auth.json; other names read codex-instances/<name>/auth.json.
   * Returns null when absent/unparseable.
   */
  readCodexNativeAuth?: (profile: string) => { accessToken: string; accountId: string } | null;
  /** Enumerate Claude profile names. Injected so tests never touch real fs. */
  listClaudeProfiles?: () => string[];
  /** Enumerate Codex profile names (including DEFAULT_PROFILE for bare ~/.codex). */
  listCodexProfiles?: () => string[];
  /** Resolve the default Claude profile name. */
  defaultClaudeProfile?: () => string | null;
  /** Resolve the default Codex profile name. */
  defaultCodexProfile?: () => string | null;
  /** Clock seam for deterministic backoff/TTL/breaker tests. */
  now?: () => number;
  /** Sleep seam (no real delay in tests). */
  sleep?: (ms: number) => Promise<void>;
}

// ============================================================================
// Per-provider mutable state (module-scoped; reset() for tests)
// ============================================================================

interface ProviderState {
  /** Last successfully-built row, kept for stale-on-fail and TTL serving. */
  cachedRow: BarSummaryRow | null;
  /** Epoch ms when cachedRow was produced. */
  cachedAt: number;
  /** Shared in-flight promise; concurrent callers await this, not a new fetch. */
  pending: Promise<BarSummaryRow | null> | null;
  /** Consecutive 429 count toward the breaker threshold. */
  consecutive429: number;
  /** Epoch ms until which the breaker is open (no network). */
  breakerOpenUntil: number;
  /** Epoch ms until which a Retry-After / backoff cooldown holds. */
  cooldownUntil: number;
  /** Attempt counter feeding exponential backoff. */
  backoffAttempt: number;
}

function freshProviderState(): ProviderState {
  return {
    cachedRow: null,
    cachedAt: 0,
    pending: null,
    consecutive429: 0,
    breakerOpenUntil: 0,
    cooldownUntil: 0,
    backoffAttempt: 0,
  };
}

// Per-profile state maps (key = profile name)
const claudeProfileStates = new Map<string, ProviderState>();
const codexProfileStates = new Map<string, ProviderState>();

function getState(map: Map<string, ProviderState>, key: string): ProviderState {
  let s = map.get(key);
  if (!s) {
    s = freshProviderState();
    map.set(key, s);
  }
  return s;
}

/** Reset all module state. Tests call this to avoid cross-test pollution. */
export function resetNativeQuotaState(): void {
  claudeProfileStates.clear();
  codexProfileStates.clear();
}

// ============================================================================
// Helpers
// ============================================================================

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse Retry-After (seconds or HTTP-date) into ms, capped at MAX_BACKOFF_MS. */
function parseRetryAfterMs(detail: string | undefined, now: number): number | null {
  if (!detail) return null;
  const match = /retry-after:(.+)$/.exec(detail);
  if (!match) return null;
  const raw = match[1].trim();

  const asSeconds = Number(raw);
  if (Number.isFinite(asSeconds)) {
    return Math.min(Math.max(0, asSeconds) * 1000, MAX_BACKOFF_MS);
  }

  const asDate = Date.parse(raw);
  if (Number.isFinite(asDate)) {
    return Math.min(Math.max(0, asDate - now), MAX_BACKOFF_MS);
  }
  return null;
}

function computeBackoffMs(attempt: number): number {
  const exp = Math.min(RETRY_BASE_MS * 2 ** attempt, MAX_BACKOFF_MS);
  const jitter = Math.floor(Math.random() * JITTER_MAX_MS);
  return exp + jitter;
}

/**
 * Best-guess remaining percentage across the 5h + weekly core windows, mirroring
 * the CLIProxy quota-manager derivation: min of remaining across non-overage
 * windows, falling back to all windows if core summary is absent.
 */
function deriveClaudeQuotaPercentage(quota: ClaudeQuotaResult): number | null {
  const coreWindows = [quota.coreUsage?.fiveHour, quota.coreUsage?.weekly].filter(
    (w): w is NonNullable<typeof w> => !!w
  );
  if (coreWindows.length > 0) {
    return Math.min(...coreWindows.map((w) => w.remainingPercent));
  }
  const usageWindows = quota.windows.filter((w) => w.rateLimitType !== 'overage');
  if (usageWindows.length > 0) {
    return Math.min(...usageWindows.map((w) => w.remainingPercent));
  }
  return null;
}

/** Soonest non-null reset ISO across the two core windows. */
function deriveClaudeNextReset(quota: ClaudeQuotaResult): string | null {
  const resets = [quota.coreUsage?.fiveHour?.resetAt, quota.coreUsage?.weekly?.resetAt]
    .filter((r): r is string => typeof r === 'string')
    .map((r) => ({ iso: r, ms: new Date(r).getTime() }))
    .filter((r) => Number.isFinite(r.ms))
    .sort((a, b) => a.ms - b.ms);
  return resets.length > 0 ? resets[0].iso : null;
}

/** Window length in minutes by Claude rate-limit family. */
const FIVE_HOUR_MINUTES = 300;
const SEVEN_DAY_MINUTES = 10080;

/**
 * Build the per-window detail for a Claude subscription row.
 *
 * 5h + weekly come from coreUsage (the canonical core summary). Opus/Sonnet
 * weekly splits come from quota.windows[] and only exist on Max plans, so they
 * are omitted entirely when absent. Each window carries BOTH used and remaining
 * percent so the bar never re-derives them.
 */
function buildClaudeQuotaWindows(quota: ClaudeQuotaResult): QuotaWindowDetail[] {
  const windows: QuotaWindowDetail[] = [];

  const fiveHour = quota.coreUsage?.fiveHour;
  if (fiveHour) {
    windows.push({
      key: 'five_hour',
      label: '5h',
      usedPercent: 100 - fiveHour.remainingPercent,
      remainingPercent: fiveHour.remainingPercent,
      resetAt: fiveHour.resetAt,
      windowMinutes: FIVE_HOUR_MINUTES,
    });
  }

  const weekly = quota.coreUsage?.weekly;
  if (weekly) {
    windows.push({
      key: 'seven_day',
      label: 'week',
      usedPercent: 100 - weekly.remainingPercent,
      remainingPercent: weekly.remainingPercent,
      resetAt: weekly.resetAt,
      windowMinutes: SEVEN_DAY_MINUTES,
    });
  }

  // Opus/Sonnet weekly splits are Max-only; surface them when the API carries
  // them, otherwise omit so non-Max plans get exactly the two core windows.
  const splitLabels: Record<string, string> = {
    seven_day_opus: 'Opus · week',
    seven_day_sonnet: 'Sonnet · week',
  };
  for (const w of quota.windows) {
    const label = splitLabels[w.rateLimitType];
    if (!label) continue;
    windows.push({
      key: w.rateLimitType,
      label,
      usedPercent: w.usedPercent,
      remainingPercent: w.remainingPercent,
      resetAt: w.resetAt,
      windowMinutes: SEVEN_DAY_MINUTES,
    });
  }

  return windows;
}

function buildClaudeRow(
  quota: ClaudeQuotaResult,
  tier: string | null,
  now: number,
  surface: string,
  profile: string
): BarSummaryRow {
  const quotaWindows = buildClaudeQuotaWindows(quota);
  return {
    account_id: `${surface}:${profile}`,
    provider: CLAUDE_NATIVE_PROVIDER,
    surface,
    profile,
    is_subscription: true,
    displayName: profile,
    tier,
    paused: false,
    quota_percentage: deriveClaudeQuotaPercentage(quota),
    quotaStatus: 'ok',
    next_reset: deriveClaudeNextReset(quota),
    is_default: false,
    last_activity_at: null,
    today_cost: null,
    health: 'ok',
    cached: false,
    fetchedAt: new Date(now).toISOString(),
    needsReauth: false,
    // Omit the field entirely (rather than an empty array) when no windows
    // resolved, so the wire shape stays minimal.
    ...(quotaWindows.length > 0 ? { quotaWindows } : {}),
  };
}

/** Map the Codex local windows into the row's per-window detail shape. */
function buildCodexQuotaWindows(quota: CodexLocalQuota): QuotaWindowDetail[] {
  return quota.windows.map((w) => ({
    key: w.key,
    label: w.label,
    usedPercent: w.usedPercent,
    remainingPercent: w.remainingPercent,
    resetAt: w.resetAt,
    windowMinutes: w.windowMinutes,
  }));
}

function buildCodexRow(
  quota: CodexLocalQuota,
  now: number,
  surface: string,
  profile: string
): BarSummaryRow {
  const quotaWindows = buildCodexQuotaWindows(quota);
  return {
    account_id: `${surface}:${profile}`,
    provider: CODEX_NATIVE_PROVIDER,
    surface,
    profile,
    is_subscription: true,
    displayName: profile,
    tier: quota.tier,
    paused: false,
    quota_percentage: quota.quotaPercentage,
    quotaStatus: 'ok',
    next_reset: quota.nextReset,
    is_default: false,
    last_activity_at: null,
    today_cost: null,
    // Codex is a local read; a stale source still reflects real usage so we keep
    // quotaStatus 'ok' but flag health 'warning' to hint freshness.
    health: quota.stale ? 'warning' : 'ok',
    cached: false,
    fetchedAt: new Date(now).toISOString(),
    needsReauth: false,
    ...(quotaWindows.length > 0 ? { quotaWindows } : {}),
    // staleAsOf is only present (and serialized) when the source session is old.
    ...(quota.staleAsOf ? { staleAsOf: quota.staleAsOf } : {}),
  };
}

/**
 * Build the Codex row from a LIVE network quota result.
 *
 * Uses coreUsage (5h/weekly) to produce QuotaWindowDetail entries with the same
 * stable keys as the Claude path. quota_percentage = min remaining across present
 * core windows. next_reset = soonest core resetAt. No staleAsOf on a live result.
 */
function buildCodexNetworkRow(
  quota: CodexQuotaResult,
  now: number,
  surface: string,
  profile: string
): BarSummaryRow {
  const windows: QuotaWindowDetail[] = [];

  const fiveHour = quota.coreUsage?.fiveHour;
  if (fiveHour) {
    windows.push({
      key: 'five_hour',
      label: '5h',
      usedPercent: 100 - fiveHour.remainingPercent,
      remainingPercent: fiveHour.remainingPercent,
      resetAt: fiveHour.resetAt,
      windowMinutes: FIVE_HOUR_MINUTES,
    });
  }

  const weekly = quota.coreUsage?.weekly;
  if (weekly) {
    windows.push({
      key: 'seven_day',
      label: 'week',
      usedPercent: 100 - weekly.remainingPercent,
      remainingPercent: weekly.remainingPercent,
      resetAt: weekly.resetAt,
      windowMinutes: SEVEN_DAY_MINUTES,
    });
  }

  // quota_percentage = min remaining across the windows present (mirrors Claude derivation)
  const coreWindows = [fiveHour, weekly].filter((w): w is NonNullable<typeof w> => !!w);
  const quotaPercentage =
    coreWindows.length > 0 ? Math.min(...coreWindows.map((w) => w.remainingPercent)) : null;

  // next_reset = soonest resetAt across present core windows
  const resets = coreWindows
    .map((w) => w.resetAt)
    .filter((r): r is string => typeof r === 'string')
    .map((r) => ({ iso: r, ms: new Date(r).getTime() }))
    .filter((r) => Number.isFinite(r.ms))
    .sort((a, b) => a.ms - b.ms);
  const nextReset = resets.length > 0 ? resets[0].iso : null;

  return {
    account_id: `${surface}:${profile}`,
    provider: CODEX_NATIVE_PROVIDER,
    surface,
    profile,
    is_subscription: true,
    displayName: profile,
    tier: quota.planType ?? null,
    paused: false,
    quota_percentage: quotaPercentage,
    quotaStatus: 'ok',
    next_reset: nextReset,
    is_default: false,
    last_activity_at: null,
    today_cost: null,
    health: 'ok',
    cached: false,
    fetchedAt: new Date(now).toISOString(),
    needsReauth: false,
    // No staleAsOf — live data is always fresh.
    ...(windows.length > 0 ? { quotaWindows: windows } : {}),
  };
}

/** Return the cached row marked cached=true (used for TTL + stale serving). */
function serveCached(state: ProviderState): BarSummaryRow | null {
  if (!state.cachedRow) return null;
  return { ...state.cachedRow, cached: true };
}

// ============================================================================
// File-only Claude credentials reader for per-profile paths (NO keychain)
// ============================================================================

/**
 * Read credentials for a specific Claude Code profile (file-only, no keychain).
 *
 * Looks for .credentials.json in the profile's instance directory. If the file
 * is absent or unparseable, returns null — the caller emits a parked row.
 * Never calls security/Keychain — zero new keychain access from this feature.
 */
function readClaudeCredentialsForProfileFromDisk(profile: string): ClaudeNativeCredentials | null {
  // The bare `ccs` default login uses the standard global credential lookup:
  // ~/.claude/.credentials.json, falling back to the single global
  // "Claude Code-credentials" Keychain item that Claude Code itself maintains.
  // This is the ONE pre-existing global read the shipped Bar already performs --
  // NOT a per-profile Keychain scan. Isolated `ccs auth` profiles below stay
  // file-only and never touch the Keychain.
  if (profile === DEFAULT_PROFILE) {
    return readClaudeCredentials();
  }
  try {
    const instanceDir = path.join(getCcsDir(), 'instances', profile);
    const credFile = path.join(instanceDir, '.credentials.json');
    if (!fs.existsSync(credFile)) return null;
    const raw = fs.readFileSync(credFile, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ClaudeNativeCredentials;
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// Profile enumeration helpers (production implementations, DI-overridable)
// ============================================================================

/**
 * Read Codex native auth from the profile's on-disk auth.json.
 * 'personal' reads ~/.codex/auth.json; other names read codex-instances/<name>/auth.json.
 * Returns null when absent or unparseable.
 */
function readCodexNativeAuthFromDisk(
  profile: string
): { accessToken: string; accountId: string } | null {
  try {
    let authPath: string;
    if (profile === DEFAULT_PROFILE) {
      authPath = path.join(os.homedir(), '.codex', 'auth.json');
    } else {
      // resolveCodexProfileDir would validate, but we do it inline to avoid the
      // import coupling and to handle invalid names gracefully (return null).
      const instancesDir = path.join(getCcsDir(), 'codex-instances');
      authPath = path.join(instancesDir, profile, 'auth.json');
    }

    if (!fs.existsSync(authPath)) return null;
    const raw = fs.readFileSync(authPath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const tokens = parsed.tokens as Record<string, unknown> | undefined;
    if (!tokens) return null;
    const accessToken = tokens.access_token;
    const accountId = tokens.account_id;
    if (typeof accessToken !== 'string' || !accessToken) return null;
    return {
      accessToken,
      accountId: typeof accountId === 'string' ? accountId : '',
    };
  } catch {
    return null;
  }
}

/**
 * List all Claude profiles from the profile registry (merged legacy + unified).
 * Returns [] on any read error so the collector degrades gracefully.
 */
function listClaudeProfilesFromDisk(): string[] {
  try {
    // Import lazily inside function to avoid circular dep and DI override in tests
    const { ProfileRegistry } = require('../../auth/profile-registry') as {
      ProfileRegistry: new () => {
        getAllProfilesMerged: () => Record<string, unknown>;
      };
    };
    const registry = new ProfileRegistry();
    const profiles = Object.keys(registry.getAllProfilesMerged());
    // Add the bare `ccs` default login (DEFAULT_PROFILE) when ~/.claude exists --
    // the default way of running `ccs`, distinct from named `ccs <profile>`
    // profiles. unshift so it leads before alphabetical sorting downstream.
    if (fs.existsSync(path.join(os.homedir(), '.claude'))) {
      if (!profiles.includes(DEFAULT_PROFILE)) profiles.unshift(DEFAULT_PROFILE);
    }
    return profiles;
  } catch {
    return [];
  }
}

/**
 * Resolve the default Claude profile. A registry-designated default wins;
 * otherwise the bare ~/.claude login (DEFAULT_PROFILE) is the default `ccs`.
 */
function getDefaultClaudeProfileFromDisk(): string | null {
  try {
    const { ProfileRegistry } = require('../../auth/profile-registry') as {
      ProfileRegistry: new () => {
        getDefaultResolved: () => string | null;
      };
    };
    const registry = new ProfileRegistry();
    const reg = registry.getDefaultResolved();
    if (reg) return reg;
  } catch {
    // fall through to the bare default below
  }
  if (fs.existsSync(path.join(os.homedir(), '.claude'))) return DEFAULT_PROFILE;
  return null;
}

/**
 * List all Codex profiles from the registry, plus DEFAULT_PROFILE when the bare
 * ~/.codex/auth.json exists. Returns [] on any read error.
 */
function listCodexProfilesFromDisk(): string[] {
  try {
    const { CodexProfileRegistry } = require('../../codex-auth/codex-profile-registry') as {
      CodexProfileRegistry: new () => {
        listProfiles: () => string[];
      };
    };
    const registry = new CodexProfileRegistry();
    const profiles = registry.listProfiles();
    // Add the bare ~/.codex/auth.json (the default `ccsx` invocation) as the
    // DEFAULT_PROFILE account when it exists. It is the "default way of running",
    // distinct from named `ccsx <profile>` profiles.
    if (fs.existsSync(path.join(os.homedir(), '.codex', 'auth.json'))) {
      if (!profiles.includes(DEFAULT_PROFILE)) profiles.push(DEFAULT_PROFILE);
    }
    return profiles;
  } catch {
    return [];
  }
}

/**
 * Resolve the default Codex profile. Falls back to DEFAULT_PROFILE when the bare
 * ~/.codex/auth.json exists and no registry default is set.
 */
function getDefaultCodexProfileFromDisk(): string | null {
  try {
    const { CodexProfileRegistry } = require('../../codex-auth/codex-profile-registry') as {
      CodexProfileRegistry: new () => {
        getDefault: () => string | null;
      };
    };
    const registry = new CodexProfileRegistry();
    const def = registry.getDefault();
    if (def) return def;
    // Fall back to the bare ~/.codex account (DEFAULT_PROFILE) when no registry
    // default is set — it is the default `ccsx` invocation.
    if (fs.existsSync(path.join(os.homedir(), '.codex', 'auth.json'))) return DEFAULT_PROFILE;
    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// Per-profile collectors with full safety controls
// ============================================================================

/**
 * Tag a row with whether it is the surface's default profile (drives the
 * "active" badge only). The row's own `paused` flag is authoritative for
 * dimming: it is already set by the collector to reflect LIVENESS — parked
 * (no on-disk creds / unsupported) rows arrive with paused:true; profiles with
 * a usable token arrive with paused:false regardless of default status. We must
 * NOT override `paused` from `isDefault`, or a valid non-default subscription
 * (e.g. an isolated `ccsx` profile) would render dimmed despite live quota.
 */
function markDefault(row: BarSummaryRow, isDefault: boolean): BarSummaryRow {
  return { ...row, is_default: isDefault };
}

/**
 * Tag the row with is_default AND write the flag back onto the cached copy. The
 * collector caches a row before the default profile is known (the default is
 * resolved in the enumerator), so without this the cache-fallback path
 * (getCachedNativeAccountRows) would serve the default account with
 * is_default:false and the UI would stop ordering/tagging it as the default.
 */
function markDefaultAndSyncCache(
  map: Map<string, ProviderState>,
  profile: string,
  row: BarSummaryRow,
  isDefault: boolean
): BarSummaryRow {
  const state = map.get(profile);
  if (state?.cachedRow) {
    state.cachedRow = { ...state.cachedRow, is_default: isDefault };
  }
  return markDefault(row, isDefault);
}

async function collectClaudeRowForProfile(
  profile: string,
  deps: NativeQuotaDeps,
  force = false
): Promise<BarSummaryRow | null> {
  const now = (deps.now ?? Date.now)();
  const state = getState(claudeProfileStates, profile);

  // Serve from cache while within TTL — force bypasses the short-circuit. Parked
  // rows (no creds -> quotaStatus 'unsupported') use a short TTL so a fresh login
  // is picked up within seconds instead of staying dimmed for the full quota TTL.
  if (!force && state.cachedRow) {
    const ttl = state.cachedRow.quotaStatus === 'unsupported' ? PARKED_TTL_MS : NATIVE_QUOTA_TTL_MS;
    if (now - state.cachedAt < ttl) return serveCached(state);
  }

  // Breaker open or cooldown active -> zero network, serve stale (may be null).
  // Force does NOT bypass the breaker — it protects the account.
  if (now < state.breakerOpenUntil || now < state.cooldownUntil) {
    return serveCached(state);
  }

  // Coalesce: concurrent callers past TTL share one in-flight fetch.
  if (state.pending) {
    return state.pending;
  }

  // For per-profile reads: use the injected seam (file-only, no keychain).
  const readCreds =
    deps.readClaudeCredentialsForProfile ??
    ((p: string) => readClaudeCredentialsForProfileFromDisk(p));
  const fetchQuota = deps.fetchClaudeQuota ?? fetchClaudeQuotaWithToken;
  const sleep = deps.sleep ?? defaultSleep;

  state.pending = (async (): Promise<BarSummaryRow | null> => {
    try {
      // Yield once so the `state.pending = (...)()` assignment above completes
      // before any synchronous return below runs the finally that nulls it.
      // Without this, a sync return (e.g. the no-creds parked path) clears
      // pending DURING assignment, leaving a stale resolved promise that the
      // next call's coalescing check would return instead of re-evaluating.
      await Promise.resolve();
      const creds = readCreds(profile);

      // No credentials file found -> emit parked row (needs auth, file absent).
      // This is the expected case when the profile exists in the registry but the
      // user has not logged in via 'ccs auth' for this machine or the credentials
      // are stored only in keychain (which we deliberately do not access here).
      if (!creds) {
        const parkedRow: BarSummaryRow = {
          account_id: `${SURFACE_CLAUDE}:${profile}`,
          provider: CLAUDE_NATIVE_PROVIDER,
          surface: SURFACE_CLAUDE,
          profile,
          is_subscription: true,
          displayName: profile,
          tier: null,
          paused: true,
          quota_percentage: null,
          quotaStatus: 'unsupported',
          next_reset: null,
          is_default: false,
          last_activity_at: null,
          today_cost: null,
          health: 'ok',
          cached: false,
          fetchedAt: new Date(now).toISOString(),
          needsReauth: true,
        };
        // Cache the parked row so repeated calls don't re-stat the fs.
        state.cachedRow = parkedRow;
        state.cachedAt = now;
        return parkedRow;
      }

      // No token / unsupported subscription -> never spend a call, omit the row.
      if (!hasSupportedSubscription(creds)) {
        return serveCached(state);
      }
      const token = getAccessToken(creds);
      if (!token) {
        return serveCached(state);
      }
      const tier = getSubscriptionTier(creds);

      const quota = await fetchQuota(token, `${SURFACE_CLAUDE}:${profile}`);

      if (quota.success) {
        // Success closes the breaker and clears backoff.
        state.consecutive429 = 0;
        state.breakerOpenUntil = 0;
        state.cooldownUntil = 0;
        state.backoffAttempt = 0;
        const row = buildClaudeRow(quota, tier, now, SURFACE_CLAUDE, profile);
        state.cachedRow = row;
        state.cachedAt = now;
        return { ...row, cached: false };
      }

      // 401 -> token expired. Emit a dimmed reauth row so the bar can prompt.
      // Cache it and open a cooldown so the expired account is NOT re-polled
      // (and re-401'd) on every refresh; it re-checks after REAUTH_COOLDOWN_MS,
      // picking up a successful re-auth.
      if (quota.needsReauth) {
        const row: BarSummaryRow = {
          account_id: `${SURFACE_CLAUDE}:${profile}`,
          provider: CLAUDE_NATIVE_PROVIDER,
          surface: SURFACE_CLAUDE,
          profile,
          is_subscription: true,
          displayName: profile,
          tier,
          paused: true,
          quota_percentage: null,
          quotaStatus: 'error',
          next_reset: null,
          is_default: false,
          last_activity_at: null,
          today_cost: null,
          health: 'error',
          cached: false,
          fetchedAt: new Date(now).toISOString(),
          needsReauth: true,
        };
        state.cachedRow = row;
        state.cachedAt = now;
        state.cooldownUntil = now + REAUTH_COOLDOWN_MS;
        return { ...row, cached: false };
      }

      // 429 / 5xx / transient. Apply backoff + breaker, then serve stale.
      const is429 = quota.httpStatus === 429;
      if (is429) {
        state.consecutive429 += 1;
        if (state.consecutive429 >= CB_TRIP_THRESHOLD) {
          state.breakerOpenUntil = now + CB_COOLDOWN_MS;
        }
        const retryAfter = parseRetryAfterMs(quota.errorDetail, now);
        const backoff = retryAfter ?? computeBackoffMs(state.backoffAttempt);
        state.cooldownUntil = now + backoff;
        state.backoffAttempt += 1;
        // We do NOT sleep-then-retry inside the request path (that would burn
        // the request budget). The cooldown gates the NEXT call instead.
        void sleep; // retained as an injectable seam for future inline retry
      } else if (quota.retryable) {
        const backoff = computeBackoffMs(state.backoffAttempt);
        state.cooldownUntil = now + backoff;
        state.backoffAttempt += 1;
      }

      // Serve last good row on failure; omit if we never succeeded.
      return serveCached(state);
    } catch {
      // Network/parse rejection -> treat as transient, serve stale.
      const backoff = computeBackoffMs(state.backoffAttempt);
      state.cooldownUntil = now + backoff;
      state.backoffAttempt += 1;
      return serveCached(state);
    } finally {
      state.pending = null;
    }
  })();

  return state.pending;
}

async function collectCodexRowForProfile(
  profile: string,
  deps: NativeQuotaDeps,
  force = false
): Promise<BarSummaryRow | null> {
  const now = (deps.now ?? Date.now)();
  const state = getState(codexProfileStates, profile);

  // Serve from cache while within TTL — force bypasses the short-circuit. Parked
  // rows (no auth -> quotaStatus 'unsupported') use a short TTL so a fresh login
  // is picked up within seconds instead of staying dimmed for the full quota TTL.
  if (!force && state.cachedRow) {
    const ttl = state.cachedRow.quotaStatus === 'unsupported' ? PARKED_TTL_MS : NATIVE_QUOTA_TTL_MS;
    if (now - state.cachedAt < ttl) return serveCached(state);
  }

  // Breaker open or cooldown active -> skip network, go to LOCAL fallback.
  // Force does NOT bypass the breaker — it protects the account.
  const breakerOrCooldownActive = now < state.breakerOpenUntil || now < state.cooldownUntil;

  // Coalesce: concurrent callers past TTL share one in-flight resolution.
  if (state.pending) {
    return state.pending;
  }

  // Resolve the native auth for this profile to get a network accountId.
  const readNativeAuth =
    deps.readCodexNativeAuth ?? ((p: string) => readCodexNativeAuthFromDisk(p));

  // For the network fallback: the legacy getDefaultCodexAccountId is the
  // CLIProxy-registry path; for native profiles we use the on-disk auth directly.
  const fetchNetwork =
    deps.fetchCodexNetworkQuota ?? ((accountId: string) => fetchCodexQuota(accountId));
  const getCodex = deps.getCodexQuota ?? getCodexLocalQuota;
  const sleep = deps.sleep ?? defaultSleep;

  state.pending = (async (): Promise<BarSummaryRow | null> => {
    try {
      // Yield once so the `state.pending = (...)()` assignment completes before
      // any synchronous return below runs the finally that nulls it (otherwise a
      // sync return leaves a stale resolved promise the next call would reuse).
      await Promise.resolve();
      // ----------------------------------------------------------------
      // PRIMARY: live network fetch (skipped when breaker/cooldown active)
      // ----------------------------------------------------------------
      if (!breakerOrCooldownActive) {
        const nativeAuth = readNativeAuth(profile);
        // Use the on-disk accountId for the network call; fall through to local
        // when the auth file is absent (parked profile).
        if (nativeAuth) {
          const quota = await fetchNetwork(nativeAuth.accountId || profile);

          if (quota.success) {
            // A healthy response closes the breaker and clears backoff,
            // regardless of content.
            state.consecutive429 = 0;
            state.breakerOpenUntil = 0;
            state.cooldownUntil = 0;
            state.backoffAttempt = 0;
            // At least one core window (5h/weekly) resolved -> full quota row.
            if (quota.coreUsage?.fiveHour || quota.coreUsage?.weekly) {
              const row = buildCodexNetworkRow(quota, now, SURFACE_CODEX, profile);
              state.cachedRow = row;
              state.cachedAt = now;
              return { ...row, cached: false };
            }
            // Success but no core window. The token authenticated, so this is a
            // VALID active subscription with a sparse payload — emit an active
            // (quota-less) row instead of parking it. Only the bare default keeps
            // falling through to the global local session data below.
            if (profile !== DEFAULT_PROFILE) {
              const row = buildCodexNetworkRow(quota, now, SURFACE_CODEX, profile);
              state.cachedRow = row;
              state.cachedAt = now;
              return { ...row, cached: false };
            }
            // else (default): fall through to LOCAL fallback below.
          } else if (quota.needsReauth) {
            // Token expired -> dimmed reauth row. Cache it and cool down so the
            // expired account is NOT re-polled (and re-401'd) every refresh; it
            // re-checks after REAUTH_COOLDOWN_MS to pick up a re-auth.
            const reauthRow: BarSummaryRow = {
              account_id: `${SURFACE_CODEX}:${profile}`,
              provider: CODEX_NATIVE_PROVIDER,
              surface: SURFACE_CODEX,
              profile,
              is_subscription: true,
              displayName: profile,
              tier: null,
              paused: true,
              quota_percentage: null,
              quotaStatus: 'error',
              next_reset: null,
              is_default: false,
              last_activity_at: null,
              today_cost: null,
              health: 'error',
              cached: false,
              fetchedAt: new Date(now).toISOString(),
              needsReauth: true,
            };
            state.cachedRow = reauthRow;
            state.cachedAt = now;
            state.cooldownUntil = now + REAUTH_COOLDOWN_MS;
            return { ...reauthRow, cached: false };
          } else if (quota.httpStatus === 429) {
            // 429: apply breaker + backoff, then fall through to local.
            state.consecutive429 += 1;
            if (state.consecutive429 >= CB_TRIP_THRESHOLD) {
              state.breakerOpenUntil = now + CB_COOLDOWN_MS;
            }
            const retryAfter = parseRetryAfterMs(quota.errorDetail, now);
            const backoff = retryAfter ?? computeBackoffMs(state.backoffAttempt);
            state.cooldownUntil = now + backoff;
            state.backoffAttempt += 1;
            void sleep; // retained as an injectable seam for future inline retry
          } else if (quota.retryable) {
            // Other transient failure: set cooldown, fall through to local.
            const backoff = computeBackoffMs(state.backoffAttempt);
            state.cooldownUntil = now + backoff;
            state.backoffAttempt += 1;
          } else {
            // Terminal non-retryable failure (e.g. 403/404): back off so we
            // don't re-hit a dead endpoint every poll when no local data caches
            // a row to engage the TTL short-circuit. Then fall through to local.
            const backoff = computeBackoffMs(state.backoffAttempt);
            state.cooldownUntil = now + backoff;
            state.backoffAttempt += 1;
          }
          // Fall through to LOCAL fallback below.
        }
        // No on-disk auth for this profile -> fall through to the fallback below.
      }

      // ----------------------------------------------------------------
      // LOCAL FALLBACK: session-log read (zero network). The session logs live
      // in the GLOBAL ~/.codex, so they represent ONLY the bare default account,
      // never a named profile. Using them for a named profile would misattribute
      // the default's usage to the profile, so only the default falls back to
      // local; named profiles park instead.
      // ----------------------------------------------------------------
      if (profile === DEFAULT_PROFILE) {
        const localQuota = await getCodex();
        if (localQuota) {
          const row = buildCodexRow(localQuota, now, SURFACE_CODEX, profile);
          state.cachedRow = row;
          state.cachedAt = now;
          return { ...row, cached: false };
        }
      }

      // Named profile (or default with no local data): serve the last-known row
      // if any, else a dimmed parked row -- never global local data for a named
      // profile.
      const stale = serveCached(state);
      if (stale) return stale;
      const parkedRow: BarSummaryRow = {
        account_id: `${SURFACE_CODEX}:${profile}`,
        provider: CODEX_NATIVE_PROVIDER,
        surface: SURFACE_CODEX,
        profile,
        is_subscription: true,
        displayName: profile,
        tier: null,
        paused: true,
        quota_percentage: null,
        quotaStatus: 'unsupported',
        next_reset: null,
        is_default: false,
        last_activity_at: null,
        today_cost: null,
        health: 'ok',
        cached: false,
        fetchedAt: new Date(now).toISOString(),
        needsReauth: true,
      };
      state.cachedRow = parkedRow;
      state.cachedAt = now;
      return parkedRow;
    } catch {
      // Network/parse rejection -> treat as transient, serve stale.
      const backoff = computeBackoffMs(state.backoffAttempt);
      state.cooldownUntil = now + backoff;
      state.backoffAttempt += 1;
      return serveCached(state);
    } finally {
      state.pending = null;
    }
  })();

  return state.pending;
}

// ============================================================================
// Legacy single-profile collectors (unchanged; used by old tests + back-compat)
// ============================================================================

/**
 * @deprecated Use collectClaudeRowForProfile with the 'default' or appropriate
 * profile name. Kept for backward compatibility with existing tests that stub
 * readCredentials/getDefaultCodexAccountId directly.
 */
async function collectClaudeRow(
  deps: NativeQuotaDeps,
  force = false
): Promise<BarSummaryRow | null> {
  const now = (deps.now ?? Date.now)();

  // Use the legacy single-state approach via profile key '__legacy__' to avoid
  // breaking state isolation with the per-profile maps.
  const state = getState(claudeProfileStates, '__legacy__');

  // Serve from cache while within TTL — force bypasses TTL short-circuit.
  if (!force && state.cachedRow && now - state.cachedAt < NATIVE_QUOTA_TTL_MS) {
    return serveCached(state);
  }

  // Breaker open or cooldown active -> zero network, serve stale (may be null).
  if (now < state.breakerOpenUntil || now < state.cooldownUntil) {
    return serveCached(state);
  }

  // Coalesce: concurrent callers past TTL share one in-flight fetch.
  if (state.pending) {
    return state.pending;
  }

  const readCredentialsFn = deps.readCredentials ?? readClaudeCredentials;
  const fetchQuota = deps.fetchClaudeQuota ?? fetchClaudeQuotaWithToken;
  const sleep = deps.sleep ?? defaultSleep;

  state.pending = (async (): Promise<BarSummaryRow | null> => {
    try {
      const creds = readCredentialsFn();
      // No token / unsupported subscription -> never spend a call, omit the row.
      if (!creds || !hasSupportedSubscription(creds)) {
        return serveCached(state);
      }
      const token = getAccessToken(creds);
      if (!token) {
        return serveCached(state);
      }
      const tier = getSubscriptionTier(creds);

      const quota = await fetchQuota(token, CLAUDE_PROVIDER);

      if (quota.success) {
        // Success closes the breaker and clears backoff.
        state.consecutive429 = 0;
        state.breakerOpenUntil = 0;
        state.cooldownUntil = 0;
        state.backoffAttempt = 0;
        const row = buildClaudeRowLegacy(quota, tier, now);
        state.cachedRow = row;
        state.cachedAt = now;
        return { ...row, cached: false };
      }

      // 401 -> token expired.
      if (quota.needsReauth) {
        const row: BarSummaryRow = {
          account_id: CLAUDE_PROVIDER,
          provider: CLAUDE_PROVIDER,
          displayName: 'Claude Code',
          tier,
          paused: false,
          quota_percentage: null,
          quotaStatus: 'error',
          next_reset: null,
          is_default: false,
          last_activity_at: null,
          today_cost: null,
          health: 'error',
          cached: false,
          fetchedAt: new Date(now).toISOString(),
          needsReauth: true,
        };
        return row;
      }

      // 429 / 5xx / transient.
      const is429 = quota.httpStatus === 429;
      if (is429) {
        state.consecutive429 += 1;
        if (state.consecutive429 >= CB_TRIP_THRESHOLD) {
          state.breakerOpenUntil = now + CB_COOLDOWN_MS;
        }
        const retryAfter = parseRetryAfterMs(quota.errorDetail, now);
        const backoff = retryAfter ?? computeBackoffMs(state.backoffAttempt);
        state.cooldownUntil = now + backoff;
        state.backoffAttempt += 1;
        void sleep;
      } else if (quota.retryable) {
        const backoff = computeBackoffMs(state.backoffAttempt);
        state.cooldownUntil = now + backoff;
        state.backoffAttempt += 1;
      }

      return serveCached(state);
    } catch {
      const backoff = computeBackoffMs(state.backoffAttempt);
      state.cooldownUntil = now + backoff;
      state.backoffAttempt += 1;
      return serveCached(state);
    } finally {
      state.pending = null;
    }
  })();

  return state.pending;
}

/** Legacy row builder — no surface/profile/is_subscription fields. */
function buildClaudeRowLegacy(
  quota: ClaudeQuotaResult,
  tier: string | null,
  now: number
): BarSummaryRow {
  const quotaWindows = buildClaudeQuotaWindows(quota);
  return {
    account_id: CLAUDE_PROVIDER,
    provider: CLAUDE_PROVIDER,
    displayName: 'Claude Code',
    tier,
    paused: false,
    quota_percentage: deriveClaudeQuotaPercentage(quota),
    quotaStatus: 'ok',
    next_reset: deriveClaudeNextReset(quota),
    is_default: false,
    last_activity_at: null,
    today_cost: null,
    health: 'ok',
    cached: false,
    fetchedAt: new Date(now).toISOString(),
    needsReauth: false,
    ...(quotaWindows.length > 0 ? { quotaWindows } : {}),
  };
}

/**
 * Legacy Codex collector — uses the old getDefaultCodexAccountId dep.
 * Kept for backward compatibility with existing tests.
 */
async function collectCodexRow(
  deps: NativeQuotaDeps,
  force = false
): Promise<BarSummaryRow | null> {
  const now = (deps.now ?? Date.now)();
  const state = getState(codexProfileStates, '__legacy__');

  // Serve from cache while within TTL — force bypasses TTL short-circuit.
  if (!force && state.cachedRow && now - state.cachedAt < NATIVE_QUOTA_TTL_MS) {
    return serveCached(state);
  }

  // Breaker open or cooldown active -> skip network, go to LOCAL fallback.
  const breakerOrCooldownActive = now < state.breakerOpenUntil || now < state.cooldownUntil;

  // Coalesce: concurrent callers past TTL share one in-flight resolution.
  if (state.pending) {
    return state.pending;
  }

  const getDefaultAccountId =
    deps.getDefaultCodexAccountId ?? (() => getDefaultAccount('codex')?.id ?? null);
  const fetchNetwork =
    deps.fetchCodexNetworkQuota ?? ((accountId: string) => fetchCodexQuota(accountId));
  const getCodex = deps.getCodexQuota ?? getCodexLocalQuota;
  const sleep = deps.sleep ?? defaultSleep;

  state.pending = (async (): Promise<BarSummaryRow | null> => {
    try {
      // Yield once so the `state.pending = (...)()` assignment completes before
      // any synchronous return below runs the finally that nulls it (otherwise a
      // sync return leaves a stale resolved promise the next call would reuse).
      await Promise.resolve();
      // ----------------------------------------------------------------
      // PRIMARY: live network fetch (skipped when breaker/cooldown active)
      // ----------------------------------------------------------------
      if (!breakerOrCooldownActive) {
        const accountId = getDefaultAccountId();
        if (accountId) {
          const quota = await fetchNetwork(accountId);

          if (quota.success) {
            state.consecutive429 = 0;
            state.breakerOpenUntil = 0;
            state.cooldownUntil = 0;
            state.backoffAttempt = 0;
            if (quota.coreUsage?.fiveHour || quota.coreUsage?.weekly) {
              const row = buildCodexNetworkRowLegacy(quota, now);
              state.cachedRow = row;
              state.cachedAt = now;
              return { ...row, cached: false };
            }
            // else: fall through to LOCAL fallback below.
          } else if (quota.needsReauth) {
            return {
              account_id: CODEX_PROVIDER,
              provider: CODEX_PROVIDER,
              displayName: 'Codex',
              tier: null,
              paused: false,
              quota_percentage: null,
              quotaStatus: 'error',
              next_reset: null,
              is_default: false,
              last_activity_at: null,
              today_cost: null,
              health: 'error',
              cached: false,
              fetchedAt: new Date(now).toISOString(),
              needsReauth: true,
            };
          } else if (quota.httpStatus === 429) {
            state.consecutive429 += 1;
            if (state.consecutive429 >= CB_TRIP_THRESHOLD) {
              state.breakerOpenUntil = now + CB_COOLDOWN_MS;
            }
            const retryAfter = parseRetryAfterMs(quota.errorDetail, now);
            const backoff = retryAfter ?? computeBackoffMs(state.backoffAttempt);
            state.cooldownUntil = now + backoff;
            state.backoffAttempt += 1;
            void sleep;
          } else if (quota.retryable) {
            const backoff = computeBackoffMs(state.backoffAttempt);
            state.cooldownUntil = now + backoff;
            state.backoffAttempt += 1;
          } else {
            const backoff = computeBackoffMs(state.backoffAttempt);
            state.cooldownUntil = now + backoff;
            state.backoffAttempt += 1;
          }
          // Fall through to LOCAL fallback below.
        }
      }

      // ----------------------------------------------------------------
      // LOCAL FALLBACK
      // ----------------------------------------------------------------
      const localQuota = await getCodex();
      if (localQuota) {
        const row = buildCodexRowLegacy(localQuota, now);
        state.cachedRow = row;
        state.cachedAt = now;
        return { ...row, cached: false };
      }

      return serveCached(state);
    } catch {
      const backoff = computeBackoffMs(state.backoffAttempt);
      state.cooldownUntil = now + backoff;
      state.backoffAttempt += 1;
      return serveCached(state);
    } finally {
      state.pending = null;
    }
  })();

  return state.pending;
}

/** Legacy Codex row builder (local quota). */
function buildCodexRowLegacy(quota: CodexLocalQuota, now: number): BarSummaryRow {
  const quotaWindows = buildCodexQuotaWindows(quota);
  return {
    account_id: CODEX_PROVIDER,
    provider: CODEX_PROVIDER,
    displayName: 'Codex',
    tier: quota.tier,
    paused: false,
    quota_percentage: quota.quotaPercentage,
    quotaStatus: 'ok',
    next_reset: quota.nextReset,
    is_default: false,
    last_activity_at: null,
    today_cost: null,
    health: quota.stale ? 'warning' : 'ok',
    cached: false,
    fetchedAt: new Date(now).toISOString(),
    needsReauth: false,
    ...(quotaWindows.length > 0 ? { quotaWindows } : {}),
    ...(quota.staleAsOf ? { staleAsOf: quota.staleAsOf } : {}),
  };
}

/** Legacy Codex network row builder. */
function buildCodexNetworkRowLegacy(quota: CodexQuotaResult, now: number): BarSummaryRow {
  const windows: QuotaWindowDetail[] = [];
  const fiveHour = quota.coreUsage?.fiveHour;
  if (fiveHour) {
    windows.push({
      key: 'five_hour',
      label: '5h',
      usedPercent: 100 - fiveHour.remainingPercent,
      remainingPercent: fiveHour.remainingPercent,
      resetAt: fiveHour.resetAt,
      windowMinutes: FIVE_HOUR_MINUTES,
    });
  }
  const weekly = quota.coreUsage?.weekly;
  if (weekly) {
    windows.push({
      key: 'seven_day',
      label: 'week',
      usedPercent: 100 - weekly.remainingPercent,
      remainingPercent: weekly.remainingPercent,
      resetAt: weekly.resetAt,
      windowMinutes: SEVEN_DAY_MINUTES,
    });
  }
  const coreWindows = [fiveHour, weekly].filter((w): w is NonNullable<typeof w> => !!w);
  const quotaPercentage =
    coreWindows.length > 0 ? Math.min(...coreWindows.map((w) => w.remainingPercent)) : null;
  const resets = coreWindows
    .map((w) => w.resetAt)
    .filter((r): r is string => typeof r === 'string')
    .map((r) => ({ iso: r, ms: new Date(r).getTime() }))
    .filter((r) => Number.isFinite(r.ms))
    .sort((a, b) => a.ms - b.ms);
  const nextReset = resets.length > 0 ? resets[0].iso : null;
  return {
    account_id: CODEX_PROVIDER,
    provider: CODEX_PROVIDER,
    displayName: 'Codex',
    tier: quota.planType ?? null,
    paused: false,
    quota_percentage: quotaPercentage,
    quotaStatus: 'ok',
    next_reset: nextReset,
    is_default: false,
    last_activity_at: null,
    today_cost: null,
    health: 'ok',
    cached: false,
    fetchedAt: new Date(now).toISOString(),
    needsReauth: false,
    ...(windows.length > 0 ? { quotaWindows: windows } : {}),
  };
}

// ============================================================================
// Public entry point
// ============================================================================

/**
 * Build the native subscription rows for /summary.
 *
 * When profile-enumeration deps are injected (listClaudeProfiles / listCodexProfiles
 * etc.), all profiles are enumerated and the active/default profile is live-polled
 * while non-default profiles are cache-only (parked). This keeps the 2.5s deadline:
 * at most 2 live upstream calls per /summary regardless of profile count.
 *
 * When no enumeration deps are injected (legacy mode / old tests that stub only
 * readCredentials + getDefaultCodexAccountId), the old single-profile collectors
 * are used for backward compatibility.
 *
 * `opts.force` bypasses the TTL short-circuit on the ACTIVE profile. The circuit
 * breaker is always respected regardless of force (account protection).
 */
export async function getNativeAccountRows(
  deps: NativeQuotaDeps = {},
  opts?: { force?: boolean }
): Promise<BarSummaryRow[]> {
  const force = opts?.force ?? false;

  // Multi-profile enumeration is the DEFAULT (production) behavior. The legacy
  // single-profile path is retained ONLY for backward-compat with old tests that
  // inject readCredentials / getDefaultCodexAccountId and assert the original
  // single-row output. Those harnesses never inject the enumeration seams; the
  // new multi-profile tests pair both seams, and production injects neither — so
  // everything except the legacy harness takes the multi-profile path below.
  const hasProfileEnumeration =
    deps.listClaudeProfiles !== undefined ||
    deps.listCodexProfiles !== undefined ||
    deps.defaultClaudeProfile !== undefined ||
    deps.defaultCodexProfile !== undefined;

  const isLegacyTestHarness =
    !hasProfileEnumeration &&
    (deps.readCredentials !== undefined || deps.getDefaultCodexAccountId !== undefined);

  if (!isLegacyTestHarness) {
    return getNativeAccountRowsMultiProfile(deps, force);
  }

  // Legacy path: backward-compatible with old tests that only inject
  // readCredentials / getDefaultCodexAccountId. Produces the old single-row
  // output (account_id='claude-code'/'codex', no surface/profile).
  const [claude, codex] = await Promise.all([
    collectClaudeRow(deps, force).catch(() => null),
    collectCodexRow(deps, force).catch(() => null),
  ]);

  const rows: BarSummaryRow[] = [];
  if (claude) rows.push(claude);
  if (codex) rows.push(codex);
  return rows;
}

async function getNativeAccountRowsMultiProfile(
  deps: NativeQuotaDeps,
  force: boolean
): Promise<BarSummaryRow[]> {
  const listClaude = deps.listClaudeProfiles ?? listClaudeProfilesFromDisk;
  const listCodex = deps.listCodexProfiles ?? listCodexProfilesFromDisk;
  const defaultClaude = deps.defaultClaudeProfile ?? getDefaultClaudeProfileFromDisk;
  const defaultCodex = deps.defaultCodexProfile ?? getDefaultCodexProfileFromDisk;

  const claudeProfiles = (() => {
    try {
      return listClaude();
    } catch {
      return [];
    }
  })();
  const codexProfiles = (() => {
    try {
      return listCodex();
    } catch {
      return [];
    }
  })();
  const claudeDefault = (() => {
    try {
      return defaultClaude();
    } catch {
      return null;
    }
  })();
  const codexDefault = (() => {
    try {
      return defaultCodex();
    } catch {
      return null;
    }
  })();

  const tasks: Promise<BarSummaryRow | null>[] = [];

  // Forced refresh applies to every profile: parked profiles (no creds) short-
  // circuit to a parked row with zero network, so forcing them is free, while
  // every profile that has a usable token gets live quota — not just the
  // default. Per-profile TTL + breaker still protect each account.
  for (const p of claudeProfiles) {
    const isDefault = p === claudeDefault;
    tasks.push(
      collectClaudeRowForProfile(p, deps, force)
        .then((r) => (r ? markDefaultAndSyncCache(claudeProfileStates, p, r, isDefault) : null))
        .catch(() => null)
    );
  }

  for (const p of codexProfiles) {
    const isDefault = p === codexDefault;
    tasks.push(
      collectCodexRowForProfile(p, deps, force)
        .then((r) => (r ? markDefaultAndSyncCache(codexProfileStates, p, r, isDefault) : null))
        .catch(() => null)
    );
  }

  const results = await Promise.all(tasks);
  const rows = results.filter((r): r is BarSummaryRow => r !== null);

  // Sort by (surface, profile) for stable ordering.
  return rows.sort((a, b) => {
    const sa = (a.surface ?? '') + ':' + (a.profile ?? '');
    const sb = (b.surface ?? '') + ':' + (b.profile ?? '');
    return sa.localeCompare(sb);
  });
}

/**
 * Last-known native rows from cache, WITHOUT any fetch (instant, no network).
 *
 * Used as a non-blocking fallback by /summary: when a forced live re-pull
 * overruns the native side-load budget, the response serves these cached rows
 * instead of dropping the Claude/Codex cards entirely. The in-flight fetch keeps
 * warming the cache, so the next poll shows the fresh values.
 */
export function getCachedNativeAccountRows(): BarSummaryRow[] {
  const rows: BarSummaryRow[] = [];
  for (const state of claudeProfileStates.values()) {
    if (state.cachedRow) rows.push({ ...state.cachedRow, cached: true });
  }
  for (const state of codexProfileStates.values()) {
    if (state.cachedRow) rows.push({ ...state.cachedRow, cached: true });
  }
  return rows;
}
