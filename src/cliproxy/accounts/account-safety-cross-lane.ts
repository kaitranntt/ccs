/**
 * Cross-lane email overlap guard
 *
 * The documented ban vector: one Google/Anthropic account active in BOTH a
 * CLIProxy OAuth lane AND a native Claude Code profile lane simultaneously.
 * CLIProxy refreshes tokens server-side while the native profile may be logged
 * in via the same account, creating concurrent token usage patterns that
 * Google/Anthropic treat as suspicious.
 *
 * Scope of check: compare the newly registered CLIProxy account email against
 * the email of every native Claude Code lane the user has:
 *   1. The ambient ~/.claude login (via `claude auth status`).
 *   2. Each isolated CCS account profile lane (per-profile CLAUDE_CONFIG_DIR
 *      instance dir).  These are the exact multi-account population the guard
 *      exists to protect, so they MUST be inspected, not just the default lane.
 *
 * Lane emails are read directly from each lane's `.claude.json`
 * (`oauthAccount.emailAddress`) — cheap file reads, no CLI spawn.  The
 * profiles.json v3.0 schema removed the email field, so the per-lane config is
 * the source of truth for an account profile's logged-in email.
 *
 * This guard is advisory only: it warns on stderr but does not block the add.
 * The user may intentionally separate accounts; a false positive is less harmful
 * than silently allowing a true overlap.  Missing or unreadable lane files are
 * silently skipped — a corrupt profile must never block or crash auth.
 */

import * as fs from 'fs';
import * as path from 'path';
import { warn } from '../../utils/ui';
import { getClaudeAuthStatus } from '../../utils/claude-detector';
import { maskEmail } from './account-safety';
import InstanceManager from '../../management/instance-manager';
import { ProfileRegistry } from '../../auth/profile-registry';
import type { CLIProxyProvider } from '../types';

/** Providers where CLIProxy OAuth could create a cross-lane conflict with native Claude */
const CROSS_LANE_RISK_PROVIDERS: CLIProxyProvider[] = ['claude', 'agy', 'gemini', 'codex'];

/** A native Claude lane that overlaps with the new CLIProxy account email. */
interface LaneOverlap {
  /** The lane's masked email (for display). */
  maskedEmail: string;
  /** Human label for the lane, e.g. "native Claude Code login" or `profile "work"`. */
  laneLabel: string;
}

/**
 * Read the OAuth email stored in a native Claude lane's `.claude.json`.
 *
 * Returns the lowercased/trimmed email, or null when the file is missing,
 * unreadable, malformed, or has no logged-in account.  Never throws — a corrupt
 * profile is silently skipped (the guard is advisory).
 */
function readLaneEmail(claudeConfigDir: string): string | null {
  try {
    const claudeJsonPath = path.join(claudeConfigDir, '.claude.json');
    const raw = fs.readFileSync(claudeJsonPath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const oauthAccount = (parsed as Record<string, unknown>).oauthAccount;
    if (!oauthAccount || typeof oauthAccount !== 'object') return null;
    const email = (oauthAccount as Record<string, unknown>).emailAddress;
    if (typeof email !== 'string' || email.trim().length === 0) return null;
    return email.toLowerCase().trim();
  } catch {
    // Missing / unreadable / malformed lane config — skip silently.
    return null;
  }
}

/**
 * Enumerate CCS account profile lanes and collect any whose stored OAuth email
 * matches the newly added CLIProxy account email.
 *
 * Pure file reads (one `.claude.json` per profile) — no CLI spawn.  Best-effort:
 * any failure to enumerate or read a lane is swallowed so the guard can never
 * block or crash the add.
 */
function findAccountProfileOverlaps(normalizedEmail: string): LaneOverlap[] {
  const overlaps: LaneOverlap[] = [];
  try {
    const registry = new ProfileRegistry();
    const profiles = registry.getAllProfilesMerged();
    const accountNames = Object.entries(profiles)
      .filter(([, meta]) => meta.type === 'account')
      .map(([name]) => name);
    if (accountNames.length === 0) return overlaps;

    const instanceMgr = new InstanceManager();
    for (const name of accountNames) {
      const instancePath = instanceMgr.getInstancePath(name);
      const laneEmail = readLaneEmail(instancePath);
      if (laneEmail && laneEmail === normalizedEmail) {
        overlaps.push({ maskedEmail: maskEmail(laneEmail), laneLabel: `profile "${name}"` });
      }
    }
  } catch {
    // Registry / instance-manager construction failed — skip lane enumeration.
  }
  return overlaps;
}

/**
 * Check whether the newly added CLIProxy account email matches the email of any
 * native Claude Code lane: the ambient ~/.claude login or any isolated CCS
 * account profile lane.
 *
 * Emits a warning to stderr for each overlapping lane.  Silent on errors
 * (CLI not found, not logged in, unreadable profile, etc.) — the check is
 * best-effort and never blocks the add.
 *
 * @param provider - The CLIProxy provider being added
 * @param email    - Email address of the account that was just registered
 */
export function checkCrossLaneEmailOverlap(provider: CLIProxyProvider, email: string): void {
  if (!CROSS_LANE_RISK_PROVIDERS.includes(provider)) return;

  try {
    const normalized = email.toLowerCase().trim();
    if (normalized.length === 0) return;

    const overlaps: LaneOverlap[] = [];

    // 1. Ambient ~/.claude login (default lane).
    const status = getClaudeAuthStatus();
    if (status?.loggedIn && status.email) {
      const ambientNormalized = status.email.toLowerCase().trim();
      if (ambientNormalized === normalized) {
        overlaps.push({
          maskedEmail: maskEmail(status.email),
          laneLabel: 'native Claude Code login',
        });
      }
    }

    // 2. Isolated CCS account profile lanes (per-profile CLAUDE_CONFIG_DIR).
    overlaps.push(...findAccountProfileOverlaps(normalized));

    if (overlaps.length === 0) return;

    const masked = maskEmail(email);

    console.error('');
    console.error(warn(`Account safety: cross-lane email overlap detected for ${provider}`));
    console.error(`    CLIProxy account: ${masked} (${provider})`);
    for (const overlap of overlaps) {
      console.error(`    Native Claude Code lane: ${overlap.maskedEmail} (${overlap.laneLabel})`);
    }
    console.error(
      '    Same account active in both CLIProxy and native Claude lanes is a known ban risk.'
    );
    console.error(
      '    CLIProxy refreshes tokens server-side; native Claude may do the same concurrently.'
    );
    console.error('    If you want to keep access, use separate accounts for each lane.');
    console.error(
      '    CCS is provided as-is and cannot take responsibility for access-loss decisions.'
    );
    console.error('');
  } catch {
    // Silent: CLI not installed, spawn failed, JSON parse error, etc.
  }
}
