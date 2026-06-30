import crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { getCcsDir } from '../config/config-loader-facade';

export const BAR_AUTH_TOKEN_HEADER = 'x-ccs-bar-token';
const TOKEN_BYTE_LENGTH = 32;

export function getBarAuthTokenPath(ccsDir = getCcsDir()): string {
  return path.join(ccsDir, 'bar', '.auth-token');
}

function isValidToken(token: string): boolean {
  return /^[a-f0-9]{64}$/i.test(token);
}

export function getOrCreateBarAuthToken(ccsDir = getCcsDir()): string {
  const tokenPath = getBarAuthTokenPath(ccsDir);

  try {
    const token = fs.readFileSync(tokenPath, 'utf8').trim();
    if (isValidToken(token)) {
      return token;
    }
  } catch {
    // Missing or unreadable tokens are regenerated below.
  }

  const token = crypto.randomBytes(TOKEN_BYTE_LENGTH).toString('hex');
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  fs.writeFileSync(tokenPath, `${token}\n`, { mode: 0o600 });
  return token;
}
