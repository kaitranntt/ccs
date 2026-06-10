/**
 * Tests for the Codex local quota collector (zero network).
 *
 * Uses a temp fixture rollout-*.jsonl read via the real Bun.spawn(['tail', ...])
 * default impl (macOS-safe) plus injected fs seams for the directory walk.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getCodexLocalQuota } from '../../../src/web-server/usage/codex-local-quota-collector';

let tmpDir: string;
let codexHome: string;
let sessionsDir: string;

function tokenCountLine(rateLimits: unknown): string {
  return JSON.stringify({
    timestamp: '2026-06-09T14:36:48.896Z',
    type: 'event_msg',
    payload: { type: 'token_count', info: {}, rate_limits: rateLimits },
  });
}

function writeRollout(sessions: string, name: string, lines: string[]): string {
  const day = path.join(sessions, '2026', '06', '09');
  fs.mkdirSync(day, { recursive: true });
  const file = path.join(day, name);
  fs.writeFileSync(file, lines.join('\n') + '\n');
  return file;
}

/**
 * Each test gets its OWN codex home so the multi-session scan never bleeds a
 * fixture from another test (the scan walks ALL recent sessions, not just one).
 */
function freshHome(slug: string): { env: NodeJS.ProcessEnv; sessions: string } {
  const home = path.join(tmpDir, `.codex-${slug}`);
  const sessions = path.join(home, 'sessions');
  fs.mkdirSync(sessions, { recursive: true });
  return { env: { CODEX_HOME: home }, sessions };
}

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-local-quota-'));
  codexHome = path.join(tmpDir, '.codex');
  sessionsDir = path.join(codexHome, 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('getCodexLocalQuota', () => {
  it('parses the last non-null rate_limits into a normalized quota', async () => {
    const { env, sessions } = freshHome('parse');
    writeRollout(sessions, 'rollout-2026-06-09T10-00-00-aaaa.jsonl', [
      tokenCountLine(null),
      tokenCountLine({
        primary: { used_percent: 0.0, window_minutes: 300, resets_at: 1781033803 },
        secondary: { used_percent: 48.0, window_minutes: 10080, resets_at: 1781192122 },
        plan_type: 'pro',
      }),
    ]);

    const quota = await getCodexLocalQuota({ env, now: Date.now() });
    expect(quota).not.toBeNull();
    // min(100-0, 100-48) = 52
    expect(quota?.quotaPercentage).toBe(52);
    expect(quota?.tier).toBe('pro');
    // soonest reset = min(1781033803, 1781192122) -> primary
    expect(quota?.nextReset).toBe(new Date(1781033803 * 1000).toISOString());
    expect(quota?.stale).toBe(false);
    expect(quota?.staleAsOf).toBeNull();
  });

  it('surfaces per-window detail incl. window_minutes (300 / 10080)', async () => {
    const { env, sessions } = freshHome('windows');
    writeRollout(sessions, 'rollout-2026-06-09T10-00-00-aaaa.jsonl', [
      tokenCountLine({
        primary: { used_percent: 19.0, window_minutes: 300, resets_at: 1781033803 },
        secondary: { used_percent: 30.0, window_minutes: 10080, resets_at: 1781192122 },
        plan_type: 'pro',
      }),
    ]);

    const quota = await getCodexLocalQuota({ env, now: Date.now() });
    expect(quota?.windows).toHaveLength(2);

    const five = quota?.windows.find((w) => w.key === 'five_hour');
    expect(five?.label).toBe('5h');
    expect(five?.usedPercent).toBe(19);
    expect(five?.remainingPercent).toBe(81);
    expect(five?.windowMinutes).toBe(300);
    expect(five?.resetAt).toBe(new Date(1781033803 * 1000).toISOString());

    const week = quota?.windows.find((w) => w.key === 'seven_day');
    expect(week?.label).toBe('week');
    expect(week?.usedPercent).toBe(30);
    expect(week?.remainingPercent).toBe(70);
    expect(week?.windowMinutes).toBe(10080);
    expect(week?.resetAt).toBe(new Date(1781192122 * 1000).toISOString());
  });

  it('scans an OLDER session when the newest is exec-mode (rate_limits:null)', async () => {
    const { env, sessions } = freshHome('fallback');
    // Older interactive session carries real quota.
    writeRollout(sessions, 'rollout-2026-06-09T10-00-00-aaaa.jsonl', [
      tokenCountLine({
        primary: { used_percent: 0.0, window_minutes: 300, resets_at: 1781033803 },
        secondary: { used_percent: 48.0, window_minutes: 10080, resets_at: 1781192122 },
        plan_type: 'pro',
      }),
    ]);
    // Newest session is exec-mode: only null rate_limits.
    writeRollout(sessions, 'rollout-2026-06-09T11-00-00-bbbb.jsonl', [
      tokenCountLine(null),
      tokenCountLine(null),
    ]);

    const quota = await getCodexLocalQuota({ env, now: Date.now() });
    // Skips the null-newest file, reads the older file's rate_limits.
    expect(quota).not.toBeNull();
    expect(quota?.quotaPercentage).toBe(52);
    expect(quota?.tier).toBe('pro');
  });

  it('returns null when NO scanned session carries rate_limits (no fake row)', async () => {
    const { env, sessions } = freshHome('all-null');
    writeRollout(sessions, 'rollout-2026-06-09T10-00-00-aaaa.jsonl', [tokenCountLine(null)]);
    writeRollout(sessions, 'rollout-2026-06-09T11-00-00-bbbb.jsonl', [
      tokenCountLine(null),
      tokenCountLine(null),
    ]);
    const quota = await getCodexLocalQuota({ env, now: Date.now() });
    expect(quota).toBeNull();
  });

  it('flags stale from the SOURCE file mtime and sets staleAsOf', async () => {
    const { env, sessions } = freshHome('stale');
    // Newest is exec-mode (null); the data comes from the older file, so stale
    // must reflect the OLDER file's mtime, not the newest's.
    const sourceFile = writeRollout(sessions, 'rollout-2026-06-09T10-00-00-aaaa.jsonl', [
      tokenCountLine({
        primary: { used_percent: 10, window_minutes: 300, resets_at: 1781033803 },
        secondary: { used_percent: 5, window_minutes: 10080, resets_at: 1781192122 },
        plan_type: 'plus',
      }),
    ]);
    writeRollout(sessions, 'rollout-2026-06-09T11-00-00-bbbb.jsonl', [tokenCountLine(null)]);

    const sourceMtime = fs.statSync(sourceFile).mtimeMs;
    const quota = await getCodexLocalQuota({ env, now: sourceMtime + 6 * 60 * 1000 });
    expect(quota?.stale).toBe(true);
    expect(quota?.staleAsOf).toBe(new Date(sourceMtime).toISOString());
    expect(quota?.tier).toBe('plus');
  });

  it('is fresh (no staleAsOf) when the source file is recent', async () => {
    const { env, sessions } = freshHome('fresh');
    const file = writeRollout(sessions, 'rollout-2026-06-09T10-00-00-aaaa.jsonl', [
      tokenCountLine({
        primary: { used_percent: 10, window_minutes: 300, resets_at: 1781033803 },
        secondary: { used_percent: 5, window_minutes: 10080, resets_at: 1781192122 },
        plan_type: 'plus',
      }),
    ]);
    const mtime = fs.statSync(file).mtimeMs;
    const quota = await getCodexLocalQuota({ env, now: mtime + 60 * 1000 });
    expect(quota?.stale).toBe(false);
    expect(quota?.staleAsOf).toBeNull();
  });

  it('returns null when there are no rollout files at all', async () => {
    const { env } = freshHome('empty');
    const quota = await getCodexLocalQuota({ env, now: Date.now() });
    expect(quota).toBeNull();
  });
});
