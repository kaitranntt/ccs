/**
 * Native Claude Code credential reader.
 *
 * Reads the LOGGED-IN Claude Code OAuth token so the bar can show the user's
 * own subscription quota (Max/Pro/Team) without going through CLIProxy-managed
 * auth files.
 *
 * File-first, Keychain-fallback: we read ~/.claude/.credentials.json directly
 * because hitting the macOS Keychain pops a permission dialog. The Keychain
 * fallback is load-bearing on machines where Claude Code stores the token there
 * instead of on disk, so it must be kept even though the file path is preferred.
 *
 * Only the user's own token is read here; the single read-only Anthropic usage
 * endpoint is the only thing that ever sees it (see native-quota-collector).
 */

import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';

/** Shape of the relevant slice of ~/.claude/.credentials.json */
export interface ClaudeNativeCredentials {
  claudeAiOauth?: {
    accessToken?: string;
    subscriptionType?: string;
    rateLimitTier?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Injectable seams so unit tests never touch the real fs/Keychain. */
export interface CredentialReaderDeps {
  platform?: NodeJS.Platform;
  homedir?: string;
  existsSyncImpl?: (p: string) => boolean;
  readFileSyncImpl?: (p: string) => string;
  execSyncImpl?: (cmd: string, opts: Record<string, unknown>) => string | Buffer;
}

const KEYCHAIN_SERVICE = 'Claude Code-credentials';
const KEYCHAIN_TIMEOUT_MS = 5000;

/** Subscription types that mean "no real subscription" -> skip the fetch. */
const UNSUPPORTED_SUBSCRIPTION_TYPES = new Set(['', 'free', 'none']);

/** rateLimitTier values that imply an entitled subscription. */
const SUPPORTED_RATE_LIMIT_TIER = /claude|max|pro|team|enterprise/;

function parseCredentials(raw: string): ClaudeNativeCredentials | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ClaudeNativeCredentials;
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Read the native Claude Code credentials.
 *
 * Order: the on-disk credentials file first (no prompt), then the macOS
 * Keychain as a fallback. Returns null when neither source yields a parseable
 * object.
 */
export function readClaudeCredentials(
  deps: CredentialReaderDeps = {}
): ClaudeNativeCredentials | null {
  const platform = deps.platform ?? os.platform();
  const homedir = deps.homedir ?? os.homedir();
  const existsImpl = deps.existsSyncImpl ?? existsSync;
  const readImpl = deps.readFileSyncImpl ?? ((p: string) => readFileSync(p, 'utf8'));
  const execImpl = deps.execSyncImpl ?? execSync;

  const credentialsPath = path.join(homedir, '.claude', '.credentials.json');
  if (existsImpl(credentialsPath)) {
    try {
      const parsed = parseCredentials(readImpl(credentialsPath));
      if (parsed) return parsed;
    } catch {
      // fall through to Keychain
    }
  }

  if (platform === 'darwin') {
    try {
      const out = execImpl(`security find-generic-password -s "${KEYCHAIN_SERVICE}" -w`, {
        timeout: KEYCHAIN_TIMEOUT_MS,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const raw = (typeof out === 'string' ? out : out.toString('utf8')).trim();
      if (raw) {
        const parsed = parseCredentials(raw);
        if (parsed) return parsed;
      }
    } catch {
      // no Keychain entry / access denied -> null
    }
  }

  return null;
}

/** Pull the OAuth access token, or null when absent. */
export function getAccessToken(creds: ClaudeNativeCredentials | null): string | null {
  const token = creds?.claudeAiOauth?.accessToken;
  return typeof token === 'string' && token.trim().length > 0 ? token : null;
}

/** Pull the subscription tier (e.g. "max" / "pro"), or null. */
export function getSubscriptionTier(creds: ClaudeNativeCredentials | null): string | null {
  const tier = creds?.claudeAiOauth?.subscriptionType;
  return typeof tier === 'string' && tier.trim().length > 0 ? tier.trim() : null;
}

/**
 * True when the credentials describe a real, entitled subscription.
 *
 * Gating on this BEFORE fetching means a free/logged-out user never spends a
 * token call against the hostile usage endpoint and never gets a phantom row.
 */
export function hasSupportedSubscription(creds: ClaudeNativeCredentials | null): boolean {
  const subscriptionType = String(creds?.claudeAiOauth?.subscriptionType ?? '')
    .trim()
    .toLowerCase();
  if (subscriptionType && !UNSUPPORTED_SUBSCRIPTION_TYPES.has(subscriptionType)) {
    return true;
  }

  const rateLimitTier = String(creds?.claudeAiOauth?.rateLimitTier ?? '')
    .trim()
    .toLowerCase();
  return SUPPORTED_RATE_LIMIT_TIER.test(rateLimitTier);
}
