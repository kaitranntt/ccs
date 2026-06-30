/**
 * Claude built-in provider — shadow warning and first-run routing notice
 *
 * Shadow warning
 * --------------
 * The claude and anthropic provider names are reserved built-ins (priority 0.5).
 * A user who has a settings profile or account profile named 'claude' or 'anthropic'
 * will silently get the built-in rather than their own profile.  This module emits
 * a one-line, TTY-only, once-per-install warning with a rename hint in that case.
 *
 * First-run routing notice
 * ------------------------
 * On the very first launch of `ccs claude` a one-line notice is printed to stderr
 * reminding the user that traffic routes through the local CLIProxy instance and
 * that bare `ccs` still launches native Claude Code.
 *
 * Persistence: marker files inside ~/.ccs/cliproxy/ are used for both notices.
 */

import * as fs from 'fs';
import * as path from 'path';
import { warn, info } from '../utils/ui';
import {
  getCcsDir,
  loadOrCreateUnifiedConfig,
  isUnifiedMode,
} from '../config/config-loader-facade';
import { readConfig } from '../utils/config-manager';
import { ProfileRegistry } from '../auth/profile-registry';

/** Marker file name inside ~/.ccs/cliproxy/ */
const SHADOW_WARNED_MARKER = '.claude-shadow-warned';

/** Names that the claude built-in shadows */
const SHADOWED_NAMES = new Set(['claude', 'anthropic']);

/** Get path to the once-per-install dismissal marker. */
function getShadowWarnedMarkerPath(): string {
  return path.join(getCcsDir(), 'cliproxy', SHADOW_WARNED_MARKER);
}

/** Return true if this install has already shown the shadow warning. */
function shadowWarnAlreadyShown(): boolean {
  try {
    return fs.existsSync(getShadowWarnedMarkerPath());
  } catch {
    return true; // If we can't read, skip warning.
  }
}

/** Persist the warning dismissal. */
function markShadowWarnShown(): void {
  try {
    const dir = path.join(getCcsDir(), 'cliproxy');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(getShadowWarnedMarkerPath(), new Date().toISOString(), {
      encoding: 'utf8',
      flag: 'w',
    });
  } catch {
    // Best-effort — failure to persist is not fatal.
  }
}

/**
 * Check if the user has a settings or account profile named 'claude' or 'anthropic'
 * that is being shadowed by the built-in provider.
 */
function detectShadowedProfile(): string | null {
  try {
    if (isUnifiedMode()) {
      const unified = loadOrCreateUnifiedConfig();
      const profileNames = Object.keys(unified.profiles || {});
      const accountNames = Object.keys(unified.accounts || {});
      const variantNames = Object.keys(unified.cliproxy?.variants || {});
      for (const name of [...profileNames, ...accountNames, ...variantNames]) {
        if (SHADOWED_NAMES.has(name.toLowerCase())) return name;
      }
    } else {
      const config = readConfig();
      const profileNames = Object.keys(config.profiles || {});
      const cliproxyNames = Object.keys(config.cliproxy || {});
      // Also check account-based profiles from profiles.json (mirror unified accounts check).
      const registry = new ProfileRegistry();
      const accountProfileNames = registry.listProfiles();
      for (const name of [...profileNames, ...cliproxyNames, ...accountProfileNames]) {
        if (SHADOWED_NAMES.has(name.toLowerCase())) return name;
      }
    }
  } catch {
    // If config is unreadable, skip the check silently.
  }
  return null;
}

/**
 * Emit the shadow warning if conditions are met.
 *
 * Conditions:
 * - Running in a TTY (no warning in pipes/CI)
 * - Warning not already shown for this install
 * - User has a profile named 'claude' or 'anthropic' that the built-in shadows
 *
 * Writes to stderr so it does not pollute stdout piped output.
 */
export function maybeWarnClaudeShadow(): void {
  // TTY guard — no warning in non-interactive or CI environments
  if (!process.stderr.isTTY) return;

  if (shadowWarnAlreadyShown()) return;

  const shadowedName = detectShadowedProfile();
  if (!shadowedName) return;

  markShadowWarnShown();

  process.stderr.write('\n');
  process.stderr.write(
    warn(
      `Profile '${shadowedName}' is shadowed by the built-in claude provider and cannot be reached via 'ccs ${shadowedName}'.`
    ) + '\n'
  );
  process.stderr.write(
    `    Rename it to continue using it: ccs config  (or edit ~/.ccs/config.yaml / config.json)\n`
  );
  process.stderr.write('\n');
}

// ── First-run routing notice ──────────────────────────────────────────────────

/** Marker file for the once-per-install routing notice. */
const ROUTING_NOTICE_MARKER = '.claude-routing-noticed';

function getRoutingNoticeMarkerPath(): string {
  return path.join(getCcsDir(), 'cliproxy', ROUTING_NOTICE_MARKER);
}

function routingNoticeAlreadyShown(): boolean {
  try {
    return fs.existsSync(getRoutingNoticeMarkerPath());
  } catch {
    return true;
  }
}

function markRoutingNoticeShown(): void {
  try {
    const dir = path.join(getCcsDir(), 'cliproxy');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(getRoutingNoticeMarkerPath(), new Date().toISOString(), {
      encoding: 'utf8',
      flag: 'w',
    });
  } catch {
    // Best-effort.
  }
}

/**
 * Print a one-time routing notice when the claude built-in provider first launches.
 *
 * Informs the user that traffic is routed through the local CLIProxy instance
 * (not the Anthropic API directly) and that bare `ccs` still uses native Claude Code.
 *
 * TTY-only; written to stderr.
 */
export function maybeShowClaudeRoutingNotice(): void {
  if (!process.stderr.isTTY) return;
  if (routingNoticeAlreadyShown()) return;

  markRoutingNoticeShown();

  process.stderr.write(
    info('ccs claude: traffic routes through the local CLIProxy instance.') + '\n'
  );
  process.stderr.write(
    `    Native Claude Code (direct Anthropic API) is still available via bare \`ccs\`.\n`
  );
}
