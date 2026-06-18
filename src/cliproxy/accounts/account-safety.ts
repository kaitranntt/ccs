/**
 * Account Safety Guards
 *
 * Prevents Google account bans by:
 * 1. Cross-provider isolation (auto-pause conflicting accounts at launch, restore on exit)
 * 2. Ban/disable detection (auto-pauses affected accounts on error response)
 * 3. Crash recovery (restores stale auto-pauses from dead sessions)
 *
 * Ref: https://github.com/kaitranntt/ccs/issues/509
 */

import * as fs from 'fs';
import * as path from 'path';
import { warn, info } from '../../utils/ui';
import { CLIProxyProvider } from '../types';
import { loadAccountsRegistry, pauseAccount, resumeAccount } from './registry';
import { getCcsDir } from '../../config/config-loader-facade';

const ISSUE_509_URL = 'https://github.com/kaitranntt/ccs/issues/509';

/** Providers that use Google OAuth (ban risk when overlapping) */
const GOOGLE_OAUTH_PROVIDERS: CLIProxyProvider[] = ['gemini', 'agy', 'codex'];
/** Providers that should display direct CLI warnings for #509 */
const BAN_WARNING_PROVIDERS: CLIProxyProvider[] = ['gemini', 'agy'];
const shownBanWarnings = new Set<CLIProxyProvider>();

// --- Auto-pause persistence (crash recovery) ---

interface AutoPausedSession {
  initiator: CLIProxyProvider;
  pid: number;
  pausedAt: string;
  accounts: Array<{ provider: CLIProxyProvider; accountId: string }>;
}

interface AutoPausedFile {
  sessions: AutoPausedSession[];
}

interface QuotaPausedEntry {
  provider: CLIProxyProvider;
  accountId: string;
  pausedAt: string;
  until: number;
  reason: 'quota_exhausted';
}

interface QuotaPausedFile {
  entries: QuotaPausedEntry[];
}

function getAutoPausedPath(): string {
  return path.join(getCcsDir(), 'cliproxy', 'auto-paused.json');
}

function getQuotaPausedPath(): string {
  return path.join(getCcsDir(), 'cliproxy', 'quota-paused.json');
}

function loadAutoPaused(): AutoPausedFile {
  try {
    const filePath = getAutoPausedPath();
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (Array.isArray(data.sessions)) return { sessions: data.sessions };
    }
  } catch {
    // Corrupted or malformed file — start fresh
  }
  return { sessions: [] };
}

function saveAutoPaused(data: AutoPausedFile): void {
  const filePath = getAutoPausedPath();
  if (data.sessions.length === 0) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* already gone */
    }
    return;
  }
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
}

function loadQuotaPaused(): QuotaPausedFile {
  try {
    const filePath = getQuotaPausedPath();
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as {
        entries?: unknown;
      };
      if (Array.isArray(data.entries)) {
        return {
          entries: data.entries.filter(
            (entry): entry is QuotaPausedEntry =>
              typeof entry === 'object' &&
              entry !== null &&
              typeof (entry as QuotaPausedEntry).provider === 'string' &&
              typeof (entry as QuotaPausedEntry).accountId === 'string' &&
              typeof (entry as QuotaPausedEntry).pausedAt === 'string' &&
              Number.isFinite((entry as QuotaPausedEntry).until)
          ),
        };
      }
    }
  } catch {
    // Corrupted or malformed file — start fresh
  }
  return { entries: [] };
}

/**
 * Read-only view of a persisted quota-cooldown pause.
 * Exposed for visibility surfaces (e.g. `ccs cliproxy quota` pool section)
 * that must distinguish a quota cooldown (with a reset time) from a manual pause.
 */
export interface QuotaCooldownEntry {
  provider: CLIProxyProvider;
  accountId: string;
  /** ISO timestamp when the account was paused (matches AccountInfo.pausedAt) */
  pausedAt: string;
  /** Epoch ms when the cooldown is eligible to be lifted */
  until: number;
  reason: 'quota_exhausted';
}

/**
 * Return the persisted quota-cooldown pauses recorded on disk.
 *
 * This is the cross-process source of truth for quota cooldowns: the in-memory
 * cooldown map in quota-manager is process-local, but quota-paused.json is
 * written by the long-lived proxy/monitor process and read by short-lived CLI
 * invocations. Callers use it to label an account as cooling (vs manually
 * paused) and to show the reset time.
 *
 * Entries are returned as-is (including expired ones); callers decide whether to
 * treat `until <= now` as already cooled down.
 */
export function readQuotaCooldownEntries(): QuotaCooldownEntry[] {
  return loadQuotaPaused().entries.map((entry) => ({ ...entry }));
}

function saveQuotaPaused(data: QuotaPausedFile): void {
  const filePath = getQuotaPausedPath();
  if (data.entries.length === 0) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* already gone */
    }
    return;
  }
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
}

/**
 * Check if a process is alive. NOTE: PIDs can be recycled by the OS.
 * If a stale PID is reused by an unrelated process, cleanup is deferred until that process exits.
 * This is acceptable — next CCS launch will self-heal via cleanupStaleAutoPauses().
 */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect same email registered under multiple Google OAuth providers.
 * This is the primary cause of account bans — Google sees concurrent
 * OAuth usage from different client IDs as suspicious activity.
 *
 * Returns map of email -> providers it appears in (only duplicates).
 */
export function detectCrossProviderDuplicates(): Map<string, CLIProxyProvider[]> {
  const registry = loadAccountsRegistry();

  // Build email -> providers mapping (only Google OAuth providers)
  const emailProviders = new Map<string, CLIProxyProvider[]>();

  for (const provider of GOOGLE_OAUTH_PROVIDERS) {
    const providerAccounts = registry.providers[provider];
    if (!providerAccounts) continue;

    for (const [, account] of Object.entries(providerAccounts.accounts)) {
      const email = account.email;
      if (!email || account.paused) continue;

      const normalized = email.toLowerCase();
      const existing = emailProviders.get(normalized) ?? [];
      existing.push(provider);
      emailProviders.set(normalized, existing);
    }
  }

  // Filter to only duplicates (email in 2+ providers)
  const duplicates = new Map<string, CLIProxyProvider[]>();
  for (const [email, providers] of emailProviders) {
    if (providers.length > 1) {
      duplicates.set(email, providers);
    }
  }

  return duplicates;
}

/**
 * Check if a newly registered account creates a cross-provider conflict.
 * Returns the conflicting providers, or null if no conflict.
 */
export function checkNewAccountConflict(
  provider: CLIProxyProvider,
  email: string | undefined
): CLIProxyProvider[] | null {
  if (!email || !GOOGLE_OAUTH_PROVIDERS.includes(provider)) return null;

  const registry = loadAccountsRegistry();
  const normalized = email.toLowerCase();
  const conflicts: CLIProxyProvider[] = [];

  for (const other of GOOGLE_OAUTH_PROVIDERS) {
    if (other === provider) continue;

    const providerAccounts = registry.providers[other];
    if (!providerAccounts) continue;

    for (const [, account] of Object.entries(providerAccounts.accounts)) {
      if (account.email?.toLowerCase() === normalized && !account.paused) {
        conflicts.push(other);
        break;
      }
    }
  }

  return conflicts.length > 0 ? conflicts : null;
}

/**
 * Display cross-provider duplicate warning at session launch.
 * Returns true if warning was shown.
 */
export function warnCrossProviderDuplicates(provider: CLIProxyProvider): boolean {
  if (!GOOGLE_OAUTH_PROVIDERS.includes(provider)) return false;

  const duplicates = detectCrossProviderDuplicates();
  if (duplicates.size === 0) return false;

  process.stderr.write('\n');
  process.stderr.write(String(warn('Account safety: cross-provider duplicate detected')) + '\n');
  process.stderr.write(
    '    Same Google account across "ccs gemini" + "ccs agy" is a known suspension/ban risk (ref: #509).\n'
  );
  process.stderr.write(
    '    This risk applies to both CLI sessions and accounts added from "ccs config".\n'
  );
  process.stderr.write(
    '    If provider requests start returning 403/Forbidden, treat it as a possible account disable/ban.\n'
  );
  process.stderr.write(
    '    If you want to keep Google AI access on this account, do not continue this shared-account setup.\n'
  );
  process.stderr.write(
    '    CCS is provided as-is and cannot take responsibility for suspension/ban/access-loss decisions.\n'
  );
  process.stderr.write(`    Details: ${ISSUE_509_URL}\n`);
  process.stderr.write('\n');

  for (const [email, providers] of duplicates) {
    process.stderr.write(`    ${maskEmail(email)} -> ${providers.join(', ')}\n`);
  }

  process.stderr.write('\n');
  process.stderr.write(
    '    Immediate action: pause duplicate account and use separate Google accounts.\n'
  );
  process.stderr.write('    Fix command: "ccs cliproxy pause <account> --provider <provider>"\n');
  process.stderr.write('\n');

  return true;
}

/**
 * Warn about a specific new account conflict during OAuth registration.
 */
export function warnNewAccountConflict(
  email: string,
  conflictingProviders: CLIProxyProvider[]
): void {
  process.stderr.write('\n');
  process.stderr.write(
    String(warn('Account safety: this email is used by another provider')) + '\n'
  );
  process.stderr.write(
    `    ${maskEmail(email)} is also registered under: ${conflictingProviders.join(', ')}\n`
  );
  process.stderr.write(
    '    Reusing one Google account between "ccs gemini" and "ccs agy" can trigger bans.\n'
  );
  process.stderr.write(
    '    This applies to both CLI auth and "ccs config" dashboard auth for these providers.\n'
  );
  process.stderr.write(
    '    403/Forbidden responses can be an early sign of account disablement.\n'
  );
  process.stderr.write(
    '    If you want to keep Google AI access, do not continue with this shared-account setup.\n'
  );
  process.stderr.write(
    '    CCS is provided as-is and cannot take responsibility for suspension/ban/access-loss decisions.\n'
  );
  process.stderr.write('    Consider pausing the duplicate or using a different account.\n');
  process.stderr.write(`    Details: ${ISSUE_509_URL}\n`);
  process.stderr.write('\n');
}

function isBanWarningProvider(provider: CLIProxyProvider): boolean {
  return BAN_WARNING_PROVIDERS.includes(provider);
}

/**
 * Show one-time warning for known OAuth ban risk providers.
 */
export function warnOAuthBanRisk(provider: CLIProxyProvider): void {
  if (!isBanWarningProvider(provider) || shownBanWarnings.has(provider)) return;

  shownBanWarnings.add(provider);
  const isAgy = provider === 'agy';
  process.stderr.write('\n');
  process.stderr.write(
    String(warn('Account safety warning (#509 - read before continuing)')) + '\n'
  );
  process.stderr.write(
    '    Known risk: one Google account shared by "ccs gemini" + "ccs agy" can be disabled/banned.\n'
  );
  if (isAgy) {
    process.stderr.write(
      '    Antigravity-specific warning: OAuth usage can still trigger suspension/ban patterns.\n'
    );
  }
  process.stderr.write(
    '    This risk applies whether auth was done from CLI or from "ccs config" dashboard.\n'
  );
  process.stderr.write(
    '    If you want to keep Google AI access, do not continue with this shared-account setup.\n'
  );
  process.stderr.write(
    '    CCS is provided as-is and cannot take responsibility for suspension/ban/access-loss decisions.\n'
  );
  process.stderr.write(`    Details: ${ISSUE_509_URL}\n`);
  process.stderr.write('\n');
}

/**
 * Detect whether an error message contains a likely 403/Forbidden ban signal.
 */
export function isPossible403BanSignal(errorMessage: string): boolean {
  const lower = errorMessage.toLowerCase();
  return lower.includes('403') || lower.includes('forbidden');
}

/**
 * Show targeted warning when OAuth provider errors include 403/Forbidden.
 * Returns true when warning was emitted.
 */
export function warnPossible403Ban(provider: CLIProxyProvider, errorMessage: string): boolean {
  if (!isBanWarningProvider(provider) || !isPossible403BanSignal(errorMessage)) {
    return false;
  }

  process.stderr.write('\n');
  process.stderr.write(
    String(warn(`Account safety: ${provider} returned 403/Forbidden (possible disable/ban)`)) + '\n'
  );
  process.stderr.write(
    '    For gemini/agy flows this often means Google blocked or disabled the account.\n'
  );
  process.stderr.write(
    '    If you want to keep Google AI access, stop using this account/provider pairing immediately.\n'
  );
  process.stderr.write(
    '    CCS is provided as-is and cannot take responsibility for suspension/ban/access-loss decisions.\n'
  );
  process.stderr.write(`    Details: ${ISSUE_509_URL}\n`);
  process.stderr.write(`    Error: "${truncate(errorMessage, 160)}"\n`);
  process.stderr.write('\n');
  return true;
}

// --- Enforcement: auto-pause/restore ---

/**
 * Restore auto-paused accounts from crashed sessions (dead PIDs).
 * Call at launch BEFORE enforceProviderIsolation().
 */
export function cleanupStaleAutoPauses(): void {
  const data = loadAutoPaused();
  if (data.sessions.length === 0) return;

  const alive: AutoPausedSession[] = [];

  for (const session of data.sessions) {
    if (isPidAlive(session.pid)) {
      alive.push(session);
      continue;
    }
    // Dead PID — restore accounts
    for (const { provider, accountId } of session.accounts) {
      resumeAccount(provider, accountId);
    }
    process.stderr.write(
      String(
        info(
          `Restored ${session.accounts.length} auto-paused account(s) from crashed ${session.initiator} session`
        )
      ) + '\n'
    );
  }

  if (alive.length !== data.sessions.length) {
    saveAutoPaused({ sessions: alive });
  }
}

/**
 * Resume quota-paused accounts whose cooldown windows have expired.
 * Auto-resume only applies to pauses created by CCS quota handling.
 */
export function restoreExpiredQuotaPauses(now = Date.now()): number {
  const data = loadQuotaPaused();
  if (data.entries.length === 0) return 0;

  const keep: QuotaPausedEntry[] = [];
  let resumed = 0;
  const registry = loadAccountsRegistry();

  for (const entry of data.entries) {
    if (!Number.isFinite(entry.until) || entry.until > now) {
      keep.push(entry);
      continue;
    }

    const account = registry.providers[entry.provider]?.accounts[entry.accountId];
    if (!account?.paused) {
      continue;
    }

    // Only auto-resume the exact pause CCS created for quota cooldown.
    // Missing or changed pausedAt metadata is treated as a mismatch so we do
    // not accidentally resume a manually paused account.
    if (account.pausedAt !== entry.pausedAt) {
      continue;
    }

    if (resumeAccount(entry.provider, entry.accountId)) {
      resumed += 1;
      continue;
    }

    // Resume failures are treated as transient I/O/state issues. Keep the
    // quota-pause record so the next restore pass can retry instead of leaving
    // the account paused forever without any cooldown metadata.
    keep.push(entry);
  }

  saveQuotaPaused({ entries: keep });
  return resumed;
}

/**
 * Temporarily remove an exhausted account from CLIProxy rotation for the
 * configured cooldown window. Returns false when the account was already paused
 * or could not be paused, so callers can fall back to in-memory cooldown only.
 */
export function pauseAccountForQuotaCooldown(
  provider: CLIProxyProvider,
  accountId: string,
  cooldownMinutes: number,
  now = Date.now()
): boolean {
  const registryBefore = loadAccountsRegistry();
  const accountBefore = registryBefore.providers[provider]?.accounts[accountId];
  if (!accountBefore || accountBefore.paused) {
    return false;
  }

  if (!pauseAccount(provider, accountId)) {
    return false;
  }

  const registryAfter = loadAccountsRegistry();
  const pausedAt = registryAfter.providers[provider]?.accounts[accountId]?.pausedAt;
  if (!pausedAt) {
    return false;
  }

  const data = loadQuotaPaused();
  data.entries = data.entries.filter(
    (entry) => !(entry.provider === provider && entry.accountId === accountId)
  );
  data.entries.push({
    provider,
    accountId,
    pausedAt,
    until: now + cooldownMinutes * 60 * 1000,
    reason: 'quota_exhausted',
  });
  saveQuotaPaused(data);
  return true;
}

/**
 * Enforce provider isolation by auto-pausing conflicting accounts in other providers.
 * Records paused accounts for crash recovery and session exit restore.
 * Returns number of accounts paused.
 */
export function enforceProviderIsolation(provider: CLIProxyProvider): number {
  if (!GOOGLE_OAUTH_PROVIDERS.includes(provider)) return 0;

  // If another provider session is actively managing isolation, just warn
  const data = loadAutoPaused();
  const otherActive = data.sessions.filter((s) => s.initiator !== provider && isPidAlive(s.pid));
  if (otherActive.length > 0) return 0;

  const registry = loadAccountsRegistry();
  const currentAccounts = registry.providers[provider];
  if (!currentAccounts) return 0;

  // Collect active emails for current provider
  const myEmails = new Set<string>();
  for (const [, account] of Object.entries(currentAccounts.accounts)) {
    if (account.email && !account.paused) {
      myEmails.add(account.email.toLowerCase());
    }
  }
  if (myEmails.size === 0) return 0;

  // Find conflicting accounts in other Google OAuth providers
  const toPause: Array<{ provider: CLIProxyProvider; accountId: string }> = [];

  for (const other of GOOGLE_OAUTH_PROVIDERS) {
    if (other === provider) continue;
    const otherAccounts = registry.providers[other];
    if (!otherAccounts) continue;

    for (const [accountId, account] of Object.entries(otherAccounts.accounts)) {
      if (account.email && !account.paused && myEmails.has(account.email.toLowerCase())) {
        toPause.push({ provider: other, accountId });
      }
    }
  }

  if (toPause.length === 0) return 0;

  // Pause conflicting accounts
  for (const { provider: p, accountId } of toPause) {
    pauseAccount(p, accountId);
  }

  // Record for crash recovery (re-read to reduce concurrent write race window).
  // TOCTOU race is acceptable for a single-user CLI tool — self-heals on next launch.
  const freshData = loadAutoPaused();
  freshData.sessions = freshData.sessions.filter((s) => s.initiator !== provider);
  freshData.sessions.push({
    initiator: provider,
    pid: process.pid,
    pausedAt: new Date().toISOString(),
    accounts: toPause,
  });
  saveAutoPaused(freshData);

  process.stderr.write('\n');
  process.stderr.write(
    String(info(`Account safety: auto-paused ${toPause.length} conflicting account(s)`)) + '\n'
  );
  for (const { provider: p, accountId } of toPause) {
    const acct = registry.providers[p]?.accounts[accountId];
    const display = acct?.email ? maskEmail(acct.email) : accountId;
    process.stderr.write(`    ${display} (${p})\n`);
  }
  process.stderr.write('    Will restore on session exit.\n');
  process.stderr.write('\n');

  return toPause.length;
}

/**
 * Restore accounts that were auto-paused by this session.
 * Called on session exit (process 'exit' event).
 * Skips accounts re-paused after enforcement (e.g., by ban handler).
 */
export function restoreAutoPausedAccounts(provider: CLIProxyProvider): void {
  const data = loadAutoPaused();
  const mySession = data.sessions.find((s) => s.initiator === provider && s.pid === process.pid);
  if (!mySession) return;

  const registry = loadAccountsRegistry();

  for (const { provider: p, accountId } of mySession.accounts) {
    // Don't restore if account was re-paused after enforcement (e.g., ban detected)
    const account = registry.providers[p]?.accounts[accountId];
    if (account?.pausedAt && account.pausedAt > mySession.pausedAt) {
      continue;
    }
    resumeAccount(p, accountId);
  }

  data.sessions = data.sessions.filter((s) => !(s.initiator === provider && s.pid === process.pid));
  saveAutoPaused(data);
}

// Error patterns that indicate a provider has disabled/banned an account.
// Shared patterns apply to all providers (Google and Anthropic OAuth flows).
const SHARED_BAN_PATTERNS = [
  'disabled in this account',
  'violation of terms of service',
  'account has been disabled',
  'account is disabled',
  'account has been suspended',
  'account has been banned',
];

// Anthropic-specific disable patterns.  Only applied when provider === 'claude'
// to avoid false-positive auto-pause on Google/Codex errors that may reference
// "policy" in rate-limit or scope messages.
const ANTHROPIC_BAN_PATTERNS = ['your account has been blocked', 'account is blocked'];

/**
 * Check if an error message indicates an account ban/disable.
 * Pass the provider so Anthropic-only patterns cannot trip Google providers.
 */
export function isBanResponse(errorMessage: string, provider?: CLIProxyProvider): boolean {
  const lower = errorMessage.toLowerCase();
  if (SHARED_BAN_PATTERNS.some((pattern) => lower.includes(pattern))) return true;
  if (provider === 'claude' && ANTHROPIC_BAN_PATTERNS.some((pattern) => lower.includes(pattern))) {
    return true;
  }
  return false;
}

/** Return the actor name (Google, Anthropic, etc.) for ban copy. */
function banActor(provider: CLIProxyProvider): string {
  if (provider === 'claude') return 'Anthropic';
  return 'Google';
}

/**
 * Handle detected account ban by auto-pausing the affected account.
 * Returns true if account was paused.
 */
export function handleBanDetection(
  provider: CLIProxyProvider,
  accountId: string,
  errorMessage: string
): boolean {
  if (!isBanResponse(errorMessage, provider)) return false;

  const actor = banActor(provider);
  process.stderr.write('\n');
  process.stderr.write(String(warn(`Account safety: account appears disabled by ${actor}`)) + '\n');
  process.stderr.write(`    Account "${maskEmail(accountId)}" (${provider}) returned:\n`);
  process.stderr.write(`    "${truncate(errorMessage, 120)}"\n`);
  process.stderr.write('\n');
  process.stderr.write(String(info('Auto-pausing this account to prevent further issues.')) + '\n');
  process.stderr.write(`    Resume later: ccs ${provider} --resume ${accountId}\n`);
  process.stderr.write('\n');

  return pauseAccount(provider, accountId);
}

/** Mask email for privacy in terminal output */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  return `${local.slice(0, 3)}***@${domain}`;
}

/** Truncate string with ellipsis */
function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen - 3) + '...' : str;
}

// --- Quota Exhaustion Handling ---

/**
 * Write boxed quota warning to stderr (20% threshold).
 * Uses process.stderr.write() to work alongside inherited stdio.
 * ASCII-only output (no emojis) per project constraints.
 */
export function writeQuotaWarning(accountId: string, quotaPercent: number): void {
  const masked = maskEmail(accountId);
  const lines = [
    `[!] Quota Low: ${masked} (${Math.round(quotaPercent)}% remaining)`,
    `    Next session will use a different account if available`,
  ];
  const maxLen = Math.max(...lines.map((l) => l.length));
  const border = '\u2550'.repeat(maxLen + 2);

  process.stderr.write('\n');
  process.stderr.write(`\u2554${border}\u2557\n`);
  for (const line of lines) {
    process.stderr.write(`\u2551 ${line.padEnd(maxLen)} \u2551\n`);
  }
  process.stderr.write(`\u255A${border}\u255D\n`);
  process.stderr.write('\n');
}

/**
 * Write boxed quota exhaustion alert to stderr.
 * Called when quota falls below exhaustion_threshold — account will be cooled down.
 */
function writeQuotaExhausted(
  accountId: string,
  switchedTo: string | null,
  cooldownMinutes: number
): void {
  const masked = maskEmail(accountId);
  const lines = [`[X] Quota Exhausted: ${masked}`, `    Cooldown: ${cooldownMinutes} minutes`];
  if (switchedTo) {
    lines.push(`    Next session default: ${maskEmail(switchedTo)}`);
  } else {
    lines.push(`    No alternative accounts available`);
  }

  const maxLen = Math.max(...lines.map((l) => l.length));
  const border = '\u2550'.repeat(maxLen + 2);

  process.stderr.write('\n');
  process.stderr.write(`\u2554${border}\u2557\n`);
  for (const line of lines) {
    process.stderr.write(`\u2551 ${line.padEnd(maxLen)} \u2551\n`);
  }
  process.stderr.write(`\u255A${border}\u255D\n`);
  process.stderr.write('\n');
}

/**
 * Handle quota exhaustion for an active session.
 * Applies cooldown to exhausted account, finds healthy alternative,
 * switches default, and alerts user via stderr.
 *
 * @returns switchedTo account ID or null if no alternatives
 */
export async function handleQuotaExhaustion(
  provider: CLIProxyProvider,
  accountId: string,
  cooldownMinutes: number
): Promise<{ switchedTo: string | null; reason: string }> {
  // Dynamic imports to avoid circular dependencies
  const { applyCooldown, findHealthyAccount } = await import('../quota/quota-manager');
  const { setDefaultAccount, touchAccount } = await import('./account-manager');
  const { loadOrCreateUnifiedConfig } = await import('../../config/config-loader-facade');
  const config = loadOrCreateUnifiedConfig();
  const threshold = config.quota_management?.auto?.exhaustion_threshold ?? 5;

  // Apply cooldown to exhausted account
  applyCooldown(provider, accountId, cooldownMinutes);

  // Find healthy alternative
  const alternative = await findHealthyAccount(provider, [accountId]);

  if (alternative) {
    if (alternative.lastQuota !== null && alternative.lastQuota >= threshold) {
      pauseAccountForQuotaCooldown(provider, accountId, cooldownMinutes);
    }
    setDefaultAccount(provider, alternative.id);
    touchAccount(provider, alternative.id);
    writeQuotaExhausted(accountId, alternative.id, cooldownMinutes);
    return {
      switchedTo: alternative.id,
      reason: `Quota exhausted, switched to ${maskEmail(alternative.id)}`,
    };
  }

  // No alternatives — warn but continue (graceful degradation)
  writeQuotaExhausted(accountId, null, cooldownMinutes);
  return {
    switchedTo: null,
    reason: 'Quota exhausted, no alternatives available',
  };
}
