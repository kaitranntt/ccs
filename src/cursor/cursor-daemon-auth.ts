import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import { getCcsDir } from '../utils/config-manager';

const DAEMON_TOKEN_FILE = 'cursor-daemon-token';

export function getCursorDaemonToken(): string {
  const tokenPath = path.join(getCcsDir(), DAEMON_TOKEN_FILE);
  try {
    const token = fs.readFileSync(tokenPath, 'utf8').trim();
    if (token.length > 0) {
      return token;
    }
  } catch {
    // Token file missing or unreadable; regenerate below.
  }

  const token = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  fs.writeFileSync(tokenPath, token, { mode: 0o600 });
  return token;
}
