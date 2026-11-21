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
      title: 'Quota low (9% left): ken***@example.com',
      details: ['Next session will use a different account if available'],
    });
    expect(typeof saved.notices[0].id).toBe('string');

    endSessionNotices();

    expect(stderrWrites.join('')).toContain('ken***@example.com');
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
    const box = formatNoticeBox(
      {
        id: '1',
        level: 'error',
        title: 'Quota exhausted: a***@b.c',
        details: ['Cooldown: 5 minutes'],
        createdAt: 0,
      },
      120
    );
    expect(box).toContain('[X] Quota exhausted: a***@b.c');
    expect(box).toContain('    Cooldown: 5 minutes');
    expect(box).toContain('╔');
  });

  const quotaLow = {
    id: '2',
    level: 'warning' as const,
    title: 'Quota low (14% left): ken***@moneymatch.co',
    details: ['Next session will use a different account if available'],
    createdAt: 0,
  };
  const boxRows = (box: string) => box.split('\n').filter((row) => row !== '');

  it('keeps one row per line when the terminal width is unknown', () => {
    const rows = boxRows(formatNoticeBox(quotaLow, undefined));
    expect(rows).toHaveLength(4);
    expect(rows[2]).toBe('║     Next session will use a different account if available ║');
  });

  it('wraps long lines inside the box to fit a phone-width terminal', () => {
    const rows = boxRows(formatNoticeBox(quotaLow, 40));
    for (const row of rows) expect(row.length).toBeLessThanOrEqual(40);
    // Every row is the same width, so the right border lines up.
    expect(new Set(rows.map((row) => row.length)).size).toBe(1);
    expect(rows.slice(1, -1).map((row) => row.slice(2, -2).trimEnd())).toEqual([
      '[!] Quota low (14% left):',
      '    ken***@moneymatch.co',
      '    Next session will use a',
      '    different account if available',
    ]);
  });

  it('splits a word longer than the box', () => {
    const rows = boxRows(formatNoticeBox({ ...quotaLow, title: 'x'.repeat(50), details: [] }, 30));
    for (const row of rows) expect(row.length).toBe(30);
    expect(rows.map((row) => row.slice(2, -2).trimEnd()).slice(1, -1)).toEqual([
      '[!]',
      '    ' + 'x'.repeat(22),
      '    ' + 'x'.repeat(22),
      '    ' + 'x'.repeat(6),
    ]);
  });

  it('prints plain lines when the terminal is too narrow for a box', () => {
    const out = formatNoticeBox(quotaLow, 20);
    expect(out).not.toContain('║');
    expect(out).toContain('[!] Quota low (14% left): ken***@moneymatch.co');
  });
});
