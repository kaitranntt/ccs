import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  beginSessionNotices,
  emitSessionNotice,
  endSessionNotices,
  formatNoticeBox,
} from '../session-notices';
import { writeQuotaWarning } from '../account-safety';

let tmpDir: string;
let originalCcsHome: string | undefined;
let originalWrite: typeof process.stderr.write;
let stderrWrites: string[];

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-session-notices-test-'));
  originalCcsHome = process.env.CCS_HOME;
  process.env.CCS_HOME = tmpDir;
  stderrWrites = [];
  originalWrite = process.stderr.write;
  process.stderr.write = ((chunk: string) => {
    stderrWrites.push(chunk);
    return true;
  }) as typeof process.stderr.write;
});

afterEach(() => {
  endSessionNotices();
  process.stderr.write = originalWrite;
  if (originalCcsHome !== undefined) process.env.CCS_HOME = originalCcsHome;
  else delete process.env.CCS_HOME;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('session notices', () => {
  it('prints immediately when no session is active', () => {
    emitSessionNotice({ level: 'warning', title: 'Quota Low: x', details: ['next'] });
    expect(stderrWrites.join('')).toContain('[!] Quota Low: x');
  });

  it('holds notices off the terminal while a session runs, then prints them on exit', () => {
    const file = beginSessionNotices();
    expect(file).not.toBeNull();
    expect(file!.startsWith(path.join(tmpDir, '.ccs', 'cache', 'session-notices'))).toBe(true);

    writeQuotaWarning('kenneth@example.com', 9.4);

    expect(stderrWrites).toHaveLength(0);
    const saved = JSON.parse(fs.readFileSync(file!, 'utf-8'));
    expect(saved.version).toBe(1);
    expect(saved.notices).toHaveLength(1);
    expect(saved.notices[0]).toMatchObject({
      level: 'warning',
      title: 'Quota Low: ken***@example.com (9% remaining)',
      details: ['Next session will use a different account if available'],
    });
    expect(typeof saved.notices[0].id).toBe('string');

    endSessionNotices();

    expect(stderrWrites.join('')).toContain('ken***@example.com (9% remaining)');
    expect(fs.existsSync(file!)).toBe(false);
  });

  it('gives each notice its own id', () => {
    const file = beginSessionNotices()!;
    emitSessionNotice({ level: 'warning', title: 'a', details: [] });
    emitSessionNotice({ level: 'error', title: 'b', details: [] });
    const ids = JSON.parse(fs.readFileSync(file, 'utf-8')).notices.map(
      (notice: { id: string }) => notice.id
    );
    expect(new Set(ids).size).toBe(2);
  });

  it('formats an ASCII-prefixed box', () => {
    const box = formatNoticeBox({
      id: '1',
      level: 'error',
      title: 'Quota Exhausted: a***@b.c',
      details: ['Cooldown: 5 minutes'],
      createdAt: 0,
    });
    expect(box).toContain('[X] Quota Exhausted: a***@b.c');
    expect(box).toContain('    Cooldown: 5 minutes');
    expect(box).toContain('╔');
  });
});
