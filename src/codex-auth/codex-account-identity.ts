import * as fs from 'fs';
import { createLogger } from '../services/logging';
import { decodeIdToken } from './decode-id-token';
import type { CodexAccountIdentity } from './types';

const logger = createLogger('codex-auth:identity');

interface AuthJson {
  tokens?: {
    id_token?: string;
  };
}

/**
 * Read auth.json from disk and extract display-safe identity fields.
 * Returns {} on any error (missing file, bad JSON, missing token, decode failure).
 * Never throws.
 */
export function decodeAccountIdentity(authJsonPath: string): CodexAccountIdentity {
  try {
    const raw = fs.readFileSync(authJsonPath, 'utf8');
    const parsed = JSON.parse(raw) as AuthJson;
    const idToken = parsed?.tokens?.id_token;
    if (typeof idToken !== 'string' || idToken.length === 0) {
      return {};
    }
    return decodeIdToken(idToken);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(
      'codex-auth.identity.decode-failed',
      `Failed to decode account identity from ${authJsonPath}: ${msg}`
    );
    return {};
  }
}
