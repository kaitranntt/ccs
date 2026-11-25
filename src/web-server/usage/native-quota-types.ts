/**
 * Shared types and safety constants for native subscription quota collection.
 */

import type { ClaudeQuotaResult, CodexQuotaResult } from '../../cliproxy/quota/quota-types';
import type { BarSummaryRow } from '../routes/bar-routes';
import type { ClaudeNativeCredentials } from './claude-native-credentials';
import type { CodexLocalQuota } from './codex-local-quota-collector';

/** On-demand cache TTL. Floor is 5 min; we use 10 min because the bar polls
 *  /summary far more often than a hook fires. */
export const NATIVE_QUOTA_TTL_MS = 600_000; // 10 minutes
export const REAUTH_COOLDOWN_MS = NATIVE_QUOTA_TTL_MS; // 10 minutes
export const PARKED_TTL_MS = 30_000; // 30 seconds

/** Exponential backoff base; delay = min(base * 2^n, MAX) + jitter. */
export const RETRY_BASE_MS = 1_000;

/** Ceiling for any single backoff / Retry-After cooldown derived from one call. */
export const MAX_BACKOFF_MS = 60_000; // 1 minute

/** Jitter added to backoff to avoid synchronized retries. */
export const JITTER_MAX_MS = 500;

/** Consecutive 429s that trip the breaker open. */
export const CB_TRIP_THRESHOLD = 3;

/** How long the breaker stays open (zero network) once tripped. */
export const CB_COOLDOWN_MS = 900_000; // 15 minutes

// Surface identifiers
export const SURFACE_CLAUDE = 'ccs';
export const SURFACE_CODEX = 'ccsx';

// The "default way of running" a surface — the bare login (e.g. ~/.codex for ccsx).
export const DEFAULT_PROFILE = 'default';

// Provider values on the wire
export const CLAUDE_NATIVE_PROVIDER = 'claude-code';
export const CODEX_NATIVE_PROVIDER = 'codex';
export const CLAUDE_PROVIDER = CLAUDE_NATIVE_PROVIDER;
export const CODEX_PROVIDER = CODEX_NATIVE_PROVIDER;

/** Window length in minutes by rate-limit family. */
export const FIVE_HOUR_MINUTES = 300;
export const SEVEN_DAY_MINUTES = 10080;

export interface NativeQuotaDeps {
  /** Read the native Claude Code credentials (global default path). */
  readCredentials?: () => ClaudeNativeCredentials | null | Promise<ClaudeNativeCredentials | null>;
  /**
   * Read credentials for a specific Claude profile (file-first, Keychain fallback).
   * Injected so tests never touch real fs or Keychain.
   * profile: the profile name (e.g. "work"); returns null when absent/unparseable.
   */
  readClaudeCredentialsForProfile?: (
    profile: string
  ) => ClaudeNativeCredentials | null | Promise<ClaudeNativeCredentials | null>;
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

export interface ProviderState {
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
