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
import { warn, info } from '../utils/ui';
import { CLIProxyProvider } from './types';
import { loadAccountsRegistry, pauseAccount, resumeAccount } from './accounts/registry';
import { getCcsDir } from '../utils/config-manager';

/** Providers that use Google OAuth (ban risk when overlapping) */
const GOOGLE_OAUTH_PROVIDERS: CLIProxyProvider[] = ['gemini', 'agy', 'codex'];

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

function getAutoPausedPath(): string {
  return path.join(getCcsDir(), 'cliproxy', 'auto-paused.json');
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

  console.error('');
  console.error(warn('Account safety: cross-provider duplicate detected'));
  console.error('    Same Google account across providers risks account bans (ref: #509).');
  console.error('');

  for (const [email, providers] of duplicates) {
    console.error(`    ${maskEmail(email)} -> ${providers.join(', ')}`);
  }

  console.error('');
  console.error('    Fix: pause duplicate with "ccs <provider> --pause <account>"');
  console.error('    or use separate Google accounts per provider.');
  console.error('');

  return true;
}

/**
 * Warn about a specific new account conflict during OAuth registration.
 */
export function warnNewAccountConflict(
  email: string,
  conflictingProviders: CLIProxyProvider[]
): void {
  console.error('');
  console.error(warn('Account safety: this email is used by another provider'));
  console.error(
    `    ${maskEmail(email)} is also registered under: ${conflictingProviders.join(', ')}`
  );
  console.error('    Concurrent usage may cause Google to ban your account.');
  console.error('    Consider pausing the duplicate or using a different account.');
  console.error('');
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
    console.error(
      info(
        `Restored ${session.accounts.length} auto-paused account(s) from crashed ${session.initiator} session`
      )
    );
  }

  if (alive.length !== data.sessions.length) {
    saveAutoPaused({ sessions: alive });
  }
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

  // Record for crash recovery (re-read to reduce concurrent write race window)
  const freshData = loadAutoPaused();
  freshData.sessions = freshData.sessions.filter((s) => s.initiator !== provider);
  freshData.sessions.push({
    initiator: provider,
    pid: process.pid,
    pausedAt: new Date().toISOString(),
    accounts: toPause,
  });
  saveAutoPaused(freshData);

  console.error('');
  console.error(info(`Account safety: auto-paused ${toPause.length} conflicting account(s)`));
  for (const { provider: p, accountId } of toPause) {
    const acct = registry.providers[p]?.accounts[accountId];
    const display = acct?.email ? maskEmail(acct.email) : accountId;
    console.error(`    ${display} (${p})`);
  }
  console.error('    Will restore on session exit.');
  console.error('');

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

// Error patterns that indicate Google has disabled/banned an account
const BAN_PATTERNS = [
  'disabled in this account',
  'violation of terms of service',
  'account has been disabled',
  'account is disabled',
  'account has been suspended',
  'account has been banned',
];

/**
 * Check if an error message indicates an account ban/disable.
 */
export function isBanResponse(errorMessage: string): boolean {
  const lower = errorMessage.toLowerCase();
  return BAN_PATTERNS.some((pattern) => lower.includes(pattern));
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
  if (!isBanResponse(errorMessage)) return false;

  console.error('');
  console.error(warn('Account safety: account appears disabled by Google'));
  console.error(`    Account "${accountId}" (${provider}) returned:`);
  console.error(`    "${truncate(errorMessage, 120)}"`);
  console.error('');
  console.error(info('Auto-pausing this account to prevent further issues.'));
  console.error(`    Resume later: ccs ${provider} --resume ${accountId}`);
  console.error('');

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
  const { applyCooldown, findHealthyAccount } = await import('./quota-manager');
  const { setDefaultAccount, touchAccount } = await import('./account-manager');

  // Apply cooldown to exhausted account
  applyCooldown(provider, accountId, cooldownMinutes);

  // Find healthy alternative
  const alternative = await findHealthyAccount(provider, [accountId]);

  if (alternative) {
    setDefaultAccount(provider, alternative.id);
    touchAccount(provider, alternative.id);
    writeQuotaExhausted(accountId, alternative.id, cooldownMinutes);
    return {
      switchedTo: alternative.id,
      reason: `Quota exhausted, switched to ${alternative.id}`,
    };
  }

  // No alternatives — warn but continue (graceful degradation)
  writeQuotaExhausted(accountId, null, cooldownMinutes);
  return {
    switchedTo: null,
    reason: 'Quota exhausted, no alternatives available',
  };
}
