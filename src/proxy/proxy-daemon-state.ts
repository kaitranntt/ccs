import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  getOpenAICompatProxyDir,
  getLegacyOpenAICompatProxyPidPath,
  getLegacyOpenAICompatProxySessionPath,
  getOpenAICompatProxyPidPath,
  getOpenAICompatProxySessionPath,
} from './proxy-daemon-paths';

export interface OpenAICompatProxySession {
  profileName: string;
  settingsPath: string;
  host: string;
  port: number;
  baseUrl: string;
  authToken: string;
  model?: string;
  insecure?: boolean;
}

function ensureProxyDir(): void {
  const proxyDir = getOpenAICompatProxyDir();
  fs.mkdirSync(proxyDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(proxyDir, 0o700);
}

function encodeProfileFileKey(profileName: string): string {
  return encodeURIComponent(profileName);
}

export function writeOpenAICompatProxyAuthTokenFile(
  profileName: string,
  authToken: string
): string {
  ensureProxyDir();
  const tokenPath = path.join(
    getOpenAICompatProxyDir(),
    `.${encodeProfileFileKey(profileName)}.${crypto.randomBytes(8).toString('hex')}.token`
  );
  const fd = fs.openSync(tokenPath, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, authToken, 'utf8');
  } finally {
    fs.closeSync(fd);
  }
  fs.chmodSync(tokenPath, 0o600);
  return tokenPath;
}

export function removeOpenAICompatProxyAuthTokenFile(tokenPath: string): void {
  try {
    fs.unlinkSync(tokenPath);
  } catch {
    // Best-effort cleanup.
  }
}

function readPid(pidPath: string): number | null {
  try {
    const raw = fs.readFileSync(pidPath, 'utf8').trim();
    const pid = Number.parseInt(raw, 10);
    return Number.isInteger(pid) ? pid : null;
  } catch {
    return null;
  }
}

export function getOpenAICompatProxyPid(profileName: string): number | null {
  return readPid(getOpenAICompatProxyPidPath(profileName));
}

export function getLegacyOpenAICompatProxyPid(): number | null {
  return readPid(getLegacyOpenAICompatProxyPidPath());
}

export function writeOpenAICompatProxyPid(profileName: string, pid: number): void {
  ensureProxyDir();
  fs.writeFileSync(getOpenAICompatProxyPidPath(profileName), String(pid), {
    encoding: 'utf8',
    mode: 0o600,
  });
  fs.chmodSync(getOpenAICompatProxyPidPath(profileName), 0o600);
}

export function removeOpenAICompatProxyPid(profileName: string): void {
  try {
    fs.unlinkSync(getOpenAICompatProxyPidPath(profileName));
  } catch {
    // Best-effort cleanup.
  }
}

export function removeLegacyOpenAICompatProxyPid(): void {
  try {
    fs.unlinkSync(getLegacyOpenAICompatProxyPidPath());
  } catch {
    // Best-effort cleanup.
  }
}

function readSession(sessionPath: string): OpenAICompatProxySession | null {
  try {
    return JSON.parse(fs.readFileSync(sessionPath, 'utf8')) as OpenAICompatProxySession;
  } catch {
    return null;
  }
}

export function readOpenAICompatProxySession(profileName: string): OpenAICompatProxySession | null {
  return readSession(getOpenAICompatProxySessionPath(profileName));
}

export function readLegacyOpenAICompatProxySession(): OpenAICompatProxySession | null {
  return readSession(getLegacyOpenAICompatProxySessionPath());
}

export function writeOpenAICompatProxySession(session: OpenAICompatProxySession): void {
  ensureProxyDir();
  const sessionPath = getOpenAICompatProxySessionPath(session.profileName);
  fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2) + '\n', {
    encoding: 'utf8',
    mode: 0o600,
  });
  fs.chmodSync(sessionPath, 0o600);
}

export function removeOpenAICompatProxySession(profileName: string): void {
  try {
    fs.unlinkSync(getOpenAICompatProxySessionPath(profileName));
  } catch {
    // Best-effort cleanup.
  }
}

export function removeLegacyOpenAICompatProxySession(): void {
  try {
    fs.unlinkSync(getLegacyOpenAICompatProxySessionPath());
  } catch {
    // Best-effort cleanup.
  }
}

function decodeProfileKey(profileKey: string): string[] {
  try {
    return [decodeURIComponent(profileKey)];
  } catch {
    return [];
  }
}

function listProfileNamesForSuffix(suffix: string, legacyName?: string): string[] {
  try {
    const entries = fs.readdirSync(getOpenAICompatProxyDir(), { withFileTypes: true });
    const profileKeys = new Set<string>();
    for (const entry of entries) {
      if (!entry.isFile() || entry.name === legacyName || !entry.name.endsWith(suffix)) {
        continue;
      }
      const profileKey = entry.name.slice(0, -suffix.length);
      if (!profileKey) {
        continue;
      }
      profileKeys.add(profileKey);
    }
    return [...profileKeys].flatMap(decodeProfileKey);
  } catch {
    return [];
  }
}

export function listOpenAICompatProxyProfileNames(): string[] {
  return [
    ...new Set([
      ...listProfileNamesForSuffix('.session.json', 'session.json'),
      ...listProfileNamesForSuffix('.daemon.pid', 'daemon.pid'),
    ]),
  ];
}

export function resolveOpenAICompatProxyEntrypointCandidates(): string[] {
  const jsEntry = path.join(__dirname, 'proxy-daemon-entry.js');
  const tsEntry = path.join(__dirname, 'proxy-daemon-entry.ts');
  const isBunRuntime = process.execPath.toLowerCase().includes('bun');
  const runningFromDist = __filename.endsWith('.js');
  if (runningFromDist) {
    return [jsEntry];
  }
  return isBunRuntime ? [tsEntry, jsEntry] : [jsEntry];
}
