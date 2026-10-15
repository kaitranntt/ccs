/**
 * Shared probe state for CLIProxy-managed Claude accounts.
 *
 * Anthropic's /api/oauth/usage endpoint rate-limits hard (429, usually with
 * `retry-after: 0`). Every CCS process probes it on its own: the dashboard
 * server, and the runtime quota monitor in each running `ccs claude` session.
 * In-memory caches can't coordinate those, so this state lives on disk under
 * ~/.ccs/cache/claude-quota/<account>.json and gives all of them:
 *
 *   - a short shared TTL, so N processes polling one account make one call
 *   - a 429 cooldown with exponential backoff, honored by every process
 *   - the last successful result, served (marked stale) while probes fail
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getCcsDir } from '../../utils/config-manager';
import { sanitizeEmail } from '../auth/auth-utils';
import type { ClaudeQuotaResult } from './quota-types';

/** Reuse another process's successful result for this long instead of probing. */
export const CLAUDE_PROBE_SHARED_TTL_MS = 60_000;
/** First 429 cooldown; doubles per consecutive 429 up to the max. */
export const CLAUDE_PROBE_COOLDOWN_BASE_MS = 2 * 60_000;
export const CLAUDE_PROBE_COOLDOWN_MAX_MS = 15 * 60_000;
/** Upper bound for a server-sent Retry-After. */
const CLAUDE_PROBE_RETRY_AFTER_MAX_MS = 60 * 60_000;
/** Never serve a last-good result older than this, even if no window reset has passed. */
export const CLAUDE_PROBE_STALE_MAX_AGE_MS = 6 * 60 * 60_000;

const STATE_VERSION = 1;

export interface ClaudeProbeState {
  version: number;
  /** Last successful usage result (success: true). */
  lastGood: ClaudeQuotaResult | null;
  /** Consecutive 429 responses since the last success. */
  consecutive429: number;
  /** Epoch ms; no process probes upstream before this. */
  cooldownUntil: number;
}

function emptyState(): ClaudeProbeState {
  return { version: STATE_VERSION, lastGood: null, consecutive429: 0, cooldownUntil: 0 };
}

function getStateFile(accountId: string): string {
  return path.join(getCcsDir(), 'cache', 'claude-quota', `${sanitizeEmail(accountId)}.json`);
}

export function readClaudeProbeState(accountId: string): ClaudeProbeState {
  try {
    const parsed = JSON.parse(fs.readFileSync(getStateFile(accountId), 'utf-8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return emptyState();
    const state = parsed as Partial<ClaudeProbeState>;
    if (state.version !== STATE_VERSION) return emptyState();
    const lastGood =
      state.lastGood && state.lastGood.success === true && Array.isArray(state.lastGood.windows)
        ? state.lastGood
        : null;
    return {
      version: STATE_VERSION,
      lastGood,
      consecutive429: Number.isFinite(state.consecutive429) ? Number(state.consecutive429) : 0,
      cooldownUntil: Number.isFinite(state.cooldownUntil) ? Number(state.cooldownUntil) : 0,
    };
  } catch {
    return emptyState();
  }
}

/** Atomic write (tmp + rename) so concurrent readers never see a partial file. */
export function writeClaudeProbeState(accountId: string, state: ClaudeProbeState): void {
  const file = getStateFile(accountId);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(tmp, file);
  } catch {
    // Best effort: losing the shared state only costs extra upstream calls.
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      // ignore
    }
  }
}

/** Parse `retry-after:<seconds|HTTP-date>` from errorDetail into ms. */
export function parseRetryAfterMs(detail: string | undefined, now: number): number | null {
  const match = detail ? /retry-after:(.+)$/.exec(detail) : null;
  if (!match) return null;
  const raw = match[1].trim();
  const seconds = Number(raw);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(raw) - now;
  if (!Number.isFinite(ms)) return null;
  return Math.min(Math.max(0, ms), CLAUDE_PROBE_RETRY_AFTER_MAX_MS);
}

/** Cooldown after the Nth consecutive 429 (1-based); Retry-After wins when longer. */
export function computeClaudeProbeCooldownMs(consecutive429: number, retryAfterMs: number | null) {
  const exponent = Math.max(0, consecutive429 - 1);
  const backoff = Math.min(
    CLAUDE_PROBE_COOLDOWN_BASE_MS * 2 ** exponent,
    CLAUDE_PROBE_COOLDOWN_MAX_MS
  );
  return Math.max(backoff, retryAfterMs ?? 0);
}

function hasReset(resetAt: string | null, now: number): boolean {
  if (!resetAt) return false;
  const parsed = Date.parse(resetAt);
  return Number.isFinite(parsed) && parsed <= now;
}

/**
 * Build the stale result served while probes fail. Windows whose reset time has
 * passed are dropped (their numbers are known to be wrong); returns null when
 * the result is too old or no window survives.
 */
export function buildStaleClaudeResult(
  lastGood: ClaudeQuotaResult,
  now: number
): ClaudeQuotaResult | null {
  if (now - lastGood.lastUpdated > CLAUDE_PROBE_STALE_MAX_AGE_MS) return null;
  const windows = lastGood.windows.filter((window) => !hasReset(window.resetAt, now));
  if (windows.length === 0) return null;
  const fiveHour = lastGood.coreUsage?.fiveHour ?? null;
  const weekly = lastGood.coreUsage?.weekly ?? null;
  return {
    ...lastGood,
    windows,
    coreUsage: {
      fiveHour: fiveHour && !hasReset(fiveHour.resetAt, now) ? fiveHour : null,
      weekly: weekly && !hasReset(weekly.resetAt, now) ? weekly : null,
    },
    stale: true,
  };
}
