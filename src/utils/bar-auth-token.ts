import crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { getCcsDir } from '../config/config-loader-facade';

export const BAR_AUTH_TOKEN_HEADER = 'x-ccs-bar-token';
export const BAR_AUTH_NONCE_HEADER = 'x-ccs-bar-nonce';
const TOKEN_BYTE_LENGTH = 32;
const NONCE_MIN_LENGTH = 16;

export function createBarAuthNonce(): string {
  return crypto.randomBytes(TOKEN_BYTE_LENGTH).toString('hex');
}

export function isValidBarAuthNonce(nonce: string): boolean {
  return /^[a-f0-9]+$/i.test(nonce) && nonce.length >= NONCE_MIN_LENGTH && nonce.length <= 128;
}

export function createBarAuthProof(token: string, nonce: string): string {
  return crypto.createHmac('sha256', token).update(nonce).digest('hex');
}

export function isMatchingBarAuthProof(token: string, nonce: string, proof: string): boolean {
  if (!isValidBarAuthNonce(nonce) || !/^[a-f0-9]{64}$/i.test(proof)) {
    return false;
  }
  const expected = createBarAuthProof(token, nonce);
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(proof, 'hex'));
}

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
