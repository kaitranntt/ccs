/**
 * Codex local quota collector (zero network).
 *
 * Codex writes a `rate_limits` object into its rollout session logs
 * (~/.codex/sessions/<y>/<m>/<d>/rollout-*.jsonl). We surface the user's Codex
 * subscription quota WITHOUT any network call — pure local file read.
 *
 * Exec-mode sessions often never emit rate_limits (the field stays null). The
 * NEWEST session is frequently exec-mode, so reading only it would emit no row
 * even though an older interactive session still carries real quota. We instead
 * scan recent sessions newest-first and use the first one that yields a usable
 * rate_limits, marking the result stale when that source file is old. We only
 * return null when no scanned session has any rate_limits — then the bar omits
 * the row rather than inventing a fake one.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveCodexConfigPaths } from '../services/codex-dashboard-service';

/**
 * One Codex quota window normalized for the bar's per-window detail.
 * `key`/`label` map primary->five_hour/"5h", secondary->seven_day/"week".
 */
export interface CodexLocalQuotaWindow {
  /** Stable window key: "five_hour" | "seven_day". */
  key: string;
  /** Short display label: "5h" | "week". */
  label: string;
  /** Used percentage (0-100). */
  usedPercent: number;
  /** Remaining percentage (0-100) = 100 - usedPercent. */
  remainingPercent: number;
  /** ISO timestamp when this window resets, null if unknown. */
  resetAt: string | null;
  /** Window length in minutes (300 / 10080), null if absent in the raw log. */
  windowMinutes: number | null;
}

/** Normalized Codex quota snapshot from a local session log. */
export interface CodexLocalQuota {
  /** Remaining percentage (0-100): min across primary/secondary windows. */
  quotaPercentage: number;
  /** ISO timestamp of the soonest window reset, null if unknown. */
  nextReset: string | null;
  /** plan_type from the session (e.g. "pro"/"plus"), null if absent. */
  tier: string | null;
  /** True when the source file is older than the freshness window. */
  stale: boolean;
  /**
   * ISO mtime of the session file that SUPPLIED this data, present only when
   * stale. Lets the bar render an "as of HH:mm (older session)" footnote.
   */
  staleAsOf: string | null;
  /** Per-window detail (primary -> five_hour, secondary -> seven_day). */
  windows: CodexLocalQuotaWindow[];
}

/** Injectable seams for deterministic tests (no real fs / no tail subprocess). */
export interface CodexLocalQuotaDeps {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  existsSyncImpl?: (p: string) => boolean;
  readdirImpl?: (dir: string) => fs.Dirent[];
  statMtimeMsImpl?: (p: string) => number;
  /** Returns the last N lines of a file (default: Bun tail). */
  tailLinesImpl?: (file: string, lines: number) => Promise<string[]>;
  now?: number;
}

/** Lines to scan from the tail; rate_limits sits near the end of a session. */
const TAIL_LINES = 200;

/** A source older than this is reported stale (but still emitted). */
const STALE_AFTER_MS = 5 * 60 * 1000;

/**
 * Cap on how many recent session files we scan newest-first before giving up.
 * Bounds the walk when Codex genuinely never reported (avoids touching the whole
 * history) while still reaching past several exec-mode sessions to a real one.
 */
const MAX_SESSIONS_SCANNED = 20;

interface CodexRateWindow {
  usedPercent: number;
  resetsAtSeconds: number | null;
  windowMinutes: number | null;
}

interface CodexRateLimits {
  primary: CodexRateWindow | null;
  secondary: CodexRateWindow | null;
  planType: string | null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseWindow(value: unknown): CodexRateWindow | null {
  const obj = asObject(value);
  if (!obj) return null;
  const usedPercent = asFiniteNumber(obj['used_percent']);
  if (usedPercent === null) return null;
  return {
    usedPercent,
    resetsAtSeconds: asFiniteNumber(obj['resets_at']),
    windowMinutes: asFiniteNumber(obj['window_minutes']),
  };
}

/**
 * Extract a non-null rate_limits object from a parsed JSONL line.
 * rate_limits lives under `payload` in the token_count event.
 */
function extractRateLimits(line: string): CodexRateLimits | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  const root = asObject(parsed);
  if (!root) return null;

  const payload = asObject(root['payload']) ?? root;
  const rateLimits = asObject(payload['rate_limits']);
  if (!rateLimits) return null;

  const primary = parseWindow(rateLimits['primary']);
  const secondary = parseWindow(rateLimits['secondary']);
  // A rate_limits object with neither window carries no usable signal.
  if (!primary && !secondary) return null;

  const planType =
    typeof rateLimits['plan_type'] === 'string' && rateLimits['plan_type'].trim().length > 0
      ? (rateLimits['plan_type'] as string).trim()
      : null;

  return { primary, secondary, planType };
}

/** Recursive rollout-*.jsonl walker, lexicographically sorted (ISO ts in name). */
function collectRolloutFiles(
  dir: string,
  existsImpl: (p: string) => boolean,
  readdirImpl: (d: string) => fs.Dirent[]
): string[] {
  if (!existsImpl(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirImpl(dir)) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectRolloutFiles(entryPath, existsImpl, readdirImpl));
      continue;
    }
    if (entry.isFile() && entry.name.startsWith('rollout-') && entry.name.endsWith('.jsonl')) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

/**
 * Default tail via a pure fs read. Must work under BOTH node and bun: the `ccs`
 * CLI (and `ccs bar launch`) runs under node, where `Bun.spawn` is undefined —
 * the previous Bun-only implementation threw there, so Codex quota silently
 * never surfaced in real deployments (only under the bun-run dev harness).
 * Reading the JSONL and slicing the tail is cheap (session rollouts are small)
 * and carries no runtime/OS/subprocess dependency.
 */
async function defaultTailLines(file: string, lines: number): Promise<string[]> {
  const text = await fs.promises.readFile(file, 'utf8');
  return text
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .slice(-lines);
}

function computeQuotaPercentage(rate: CodexRateLimits): number {
  const remaining: number[] = [];
  if (rate.primary) remaining.push(100 - rate.primary.usedPercent);
  if (rate.secondary) remaining.push(100 - rate.secondary.usedPercent);
  // Clamp into [0,100] to guard against odd upstream values.
  return Math.max(0, Math.min(100, Math.min(...remaining)));
}

function computeNextReset(rate: CodexRateLimits): string | null {
  const resets: number[] = [];
  if (rate.primary?.resetsAtSeconds !== null && rate.primary?.resetsAtSeconds !== undefined) {
    resets.push(rate.primary.resetsAtSeconds);
  }
  if (rate.secondary?.resetsAtSeconds !== null && rate.secondary?.resetsAtSeconds !== undefined) {
    resets.push(rate.secondary.resetsAtSeconds);
  }
  if (resets.length === 0) return null;
  return new Date(Math.min(...resets) * 1000).toISOString();
}

function windowDetail(window: CodexRateWindow, key: string, label: string): CodexLocalQuotaWindow {
  const usedPercent = Math.max(0, Math.min(100, window.usedPercent));
  return {
    key,
    label,
    usedPercent,
    remainingPercent: 100 - usedPercent,
    resetAt:
      window.resetsAtSeconds !== null
        ? new Date(window.resetsAtSeconds * 1000).toISOString()
        : null,
    windowMinutes: window.windowMinutes,
  };
}

/** Build per-window detail (primary -> 5h, secondary -> week), omitting absent. */
function buildWindows(rate: CodexRateLimits): CodexLocalQuotaWindow[] {
  const windows: CodexLocalQuotaWindow[] = [];
  if (rate.primary) windows.push(windowDetail(rate.primary, 'five_hour', '5h'));
  if (rate.secondary) windows.push(windowDetail(rate.secondary, 'seven_day', 'week'));
  return windows;
}

/** Scan one session file's tail backward for the latest non-null rate_limits. */
async function readRateLimitsFromFile(
  file: string,
  tailLinesImpl: (file: string, lines: number) => Promise<string[]>
): Promise<CodexRateLimits | null> {
  let lines: string[];
  try {
    lines = await tailLinesImpl(file, TAIL_LINES);
  } catch {
    return null;
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    const found = extractRateLimits(lines[i]);
    if (found) return found;
  }
  return null;
}

/**
 * Scan recent Codex sessions newest-first and normalize the first usable
 * rate_limits. Staleness is computed from the mtime of the file that SUPPLIED
 * the data (not the newest file), so a real-but-old session reads correctly as
 * stale. Returns null only when none of the scanned sessions carries quota.
 */
export async function getCodexLocalQuota(
  deps: CodexLocalQuotaDeps = {}
): Promise<CodexLocalQuota | null> {
  const existsImpl = deps.existsSyncImpl ?? fs.existsSync;
  const readdirImpl =
    deps.readdirImpl ?? ((dir: string) => fs.readdirSync(dir, { withFileTypes: true }));
  const statMtimeMsImpl = deps.statMtimeMsImpl ?? ((p: string) => fs.statSync(p).mtimeMs);
  const tailLinesImpl = deps.tailLinesImpl ?? defaultTailLines;
  const now = deps.now ?? Date.now();

  const { baseDir } = resolveCodexConfigPaths({ env: deps.env, homeDir: deps.homeDir });
  const sessionsDir = path.join(baseDir, 'sessions');

  const rolloutFiles = collectRolloutFiles(sessionsDir, existsImpl, readdirImpl);
  if (rolloutFiles.length === 0) return null;

  // Filenames carry an ISO timestamp, so the lexicographic order is chronological.
  // Walk newest-first, bounded, until a session yields a usable rate_limits.
  const newestFirst = rolloutFiles.slice().reverse().slice(0, MAX_SESSIONS_SCANNED);

  let rate: CodexRateLimits | null = null;
  let sourceFile: string | null = null;
  for (const file of newestFirst) {
    const found = await readRateLimitsFromFile(file, tailLinesImpl);
    if (found) {
      rate = found;
      sourceFile = file;
      break;
    }
  }
  if (!rate || !sourceFile) return null;

  let stale = false;
  let staleAsOf: string | null = null;
  try {
    const mtimeMs = statMtimeMsImpl(sourceFile);
    stale = now - mtimeMs > STALE_AFTER_MS;
    if (stale) staleAsOf = new Date(mtimeMs).toISOString();
  } catch {
    // Unknown mtime -> treat as fresh; the data itself is still valid.
    stale = false;
  }

  return {
    quotaPercentage: computeQuotaPercentage(rate),
    nextReset: computeNextReset(rate),
    tier: rate.planType,
    stale,
    staleAsOf,
    windows: buildWindows(rate),
  };
}
