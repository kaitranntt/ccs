/**
 * Session notices: alerts raised by the CCS parent process (quota low,
 * quota exhausted) while Claude Code runs as a child.
 *
 * Claude Code's TUI owns the terminal while it runs, so writing to the shared
 * stderr paints over its prompt. While a session is active, notices go to a
 * per-session JSON file instead (its path is exported to the child as
 * CCS_SESSION_NOTICES_FILE, so a Claude Code plugin can show them in-app) and
 * are printed once the child exits and the terminal is free again. With no
 * active session they are printed right away, as before.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getCcsDir } from '../../utils/config-manager';

export const SESSION_NOTICES_ENV = 'CCS_SESSION_NOTICES_FILE';
const NOTICES_VERSION = 1;
const LEFTOVER_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface SessionNotice {
  /** Stable per notice; a reader shows each id once. */
  id: string;
  level: 'warning' | 'error';
  /** One-line summary, e.g. "Quota low: ken***@example.com (9% remaining)". */
  title: string;
  /** Follow-up lines (what CCS will do about it). */
  details: string[];
  /** Epoch ms. */
  createdAt: number;
}

interface SessionNoticesFile {
  version: number;
  notices: SessionNotice[];
}

let activeFile: string | null = null;
let deferred: SessionNotice[] = [];
let sequence = 0;

function writeNoticesFile(file: string, notices: SessionNotice[]): void {
  const body: SessionNoticesFile = { version: NOTICES_VERSION, notices };
  const tmp = `${file}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(body), { mode: 0o600 });
    fs.renameSync(tmp, file);
  } catch {
    // Best effort: the notice is still printed when the session ends.
  }
}

/** Files a killed CCS process never removed; anything a day old is dead. */
function removeLeftoverNoticeFiles(dir: string): void {
  const cutoff = Date.now() - LEFTOVER_MAX_AGE_MS;
  try {
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      try {
        if (fs.statSync(file).mtimeMs < cutoff) fs.rmSync(file, { force: true });
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}

/** ASCII-bordered box, as CCS has always printed quota alerts. */
export function formatNoticeBox(notice: SessionNotice): string {
  const prefix = notice.level === 'error' ? '[X]' : '[!]';
  const lines = [`${prefix} ${notice.title}`, ...notice.details.map((line) => `    ${line}`)];
  const maxLen = Math.max(...lines.map((line) => line.length));
  const border = '═'.repeat(maxLen + 2);
  return [
    '',
    `╔${border}╗`,
    ...lines.map((line) => `║ ${line.padEnd(maxLen)} ║`),
    `╚${border}╝`,
    '',
    '',
  ].join('\n');
}

/**
 * Start routing notices away from the terminal for an interactive child
 * session. Returns the notices file path to export as CCS_SESSION_NOTICES_FILE,
 * or null when the file can't be created (notices then print immediately).
 */
export function beginSessionNotices(): string | null {
  try {
    const dir = path.join(getCcsDir(), 'cache', 'session-notices');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    removeLeftoverNoticeFiles(dir);
    const file = path.join(dir, `${process.pid}-${Date.now()}.json`);
    writeNoticesFile(file, []);
    activeFile = file;
    deferred = [];
    return file;
  } catch {
    return null;
  }
}

/** The child exited: print what was held back and remove the notices file. */
export function endSessionNotices(): void {
  const file = activeFile;
  const held = deferred;
  activeFile = null;
  deferred = [];
  for (const notice of held) {
    process.stderr.write(formatNoticeBox(notice));
  }
  if (file) {
    try {
      fs.rmSync(file, { force: true });
    } catch {
      // ignore
    }
  }
}

export function emitSessionNotice(notice: Omit<SessionNotice, 'id' | 'createdAt'>): void {
  const full: SessionNotice = {
    ...notice,
    id: `${process.pid}-${Date.now()}-${++sequence}`,
    createdAt: Date.now(),
  };
  if (!activeFile) {
    process.stderr.write(formatNoticeBox(full));
    return;
  }
  deferred.push(full);
  writeNoticesFile(activeFile, deferred);
}
