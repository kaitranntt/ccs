import * as fs from 'node:fs';
import * as os from 'node:os';

export interface ClaudePoolControllerLease {
  owner: string;
  pid: number;
  hostname: string;
  target: string;
  updatedAt: number;
  startedAt?: number;
}

export function readActiveClaudePoolControllerLease(
  file: string,
  target: string,
  now: number,
  staleMs: number
): ClaudePoolControllerLease | null {
  try {
    const lease = JSON.parse(fs.readFileSync(file, 'utf8')) as ClaudePoolControllerLease;
    if (
      lease.hostname !== os.hostname() ||
      lease.target !== target ||
      typeof lease.owner !== 'string' ||
      !Number.isSafeInteger(lease.pid) ||
      lease.pid <= 0 ||
      !Number.isFinite(lease.updatedAt) ||
      now - lease.updatedAt >= staleMs ||
      lease.updatedAt > now
    )
      return null;
    process.kill(lease.pid, 0);
    return lease;
  } catch {
    return null;
  }
}

export function writeClaudePoolControllerLease(
  file: string,
  lease: ClaudePoolControllerLease
): void {
  const temporary = `${file}.${lease.owner}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(lease), { mode: 0o600 });
  fs.renameSync(temporary, file);
}
