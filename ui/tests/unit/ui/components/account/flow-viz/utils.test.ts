/**
 * Unit tests for generateConnectionEvents() in flow-viz/utils.ts
 *
 * Regression coverage for the timeline single-account dominance bug:
 * accounts with more recent lastUsedAt were dominating the 100-event cap
 * because per-account base time was used instead of a shared max.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_TIMELINE_EVENTS, generateConnectionEvents } from '@/components/account/flow-viz/utils';
import type { AccountData } from '@/components/account/flow-viz/types';

// Deterministic Math.random: cycles 0.1, 0.5, 0.9 repeatedly
function mockRandom(): void {
  const values = [0.1, 0.5, 0.9];
  let idx = 0;
  vi.spyOn(Math, 'random').mockImplementation(() => {
    const val = values[idx % values.length];
    idx++;
    return val;
  });
}

function makeAccount(
  overrides: Partial<AccountData> & Pick<AccountData, 'id' | 'email'>
): AccountData {
  return {
    provider: 'agy',
    successCount: 0,
    failureCount: 0,
    color: '#000000',
    ...overrides,
  };
}

describe('generateConnectionEvents()', () => {
  beforeEach(() => {
    mockRandom();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Core regression: multi-account interleaving
  // -----------------------------------------------------------------------

  it('includes events from more than one account when accounts have different lastUsedAt', () => {
    const now = Date.now();

    const accounts: AccountData[] = [
      makeAccount({
        id: 'a1',
        email: 'recent@example.com',
        successCount: 60,
        // Most recent — was the bug trigger
        lastUsedAt: new Date(now - 1_000).toISOString(),
      }),
      makeAccount({
        id: 'a2',
        email: 'older@example.com',
        successCount: 60,
        // 7 days older
        lastUsedAt: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    ];

    const events = generateConnectionEvents(accounts);

    // Slice to cap
    const displayed = events.slice(0, MAX_TIMELINE_EVENTS);
    const emails = new Set(displayed.map((e) => e.accountEmail));

    expect(emails.size).toBeGreaterThan(1);
    expect(emails.has('recent@example.com')).toBe(true);
    expect(emails.has('older@example.com')).toBe(true);
  });

  it('returns at most MAX_TIMELINE_EVENTS events (cap respected by caller slice)', () => {
    // generateConnectionEvents returns all events unsorted-by-cap; cap is applied by caller.
    // But we verify total output does not exceed successCount + failureCount across accounts.
    const accounts: AccountData[] = [
      makeAccount({ id: 'a1', email: 'a@x.com', successCount: 50, failureCount: 10 }),
      makeAccount({ id: 'a2', email: 'b@x.com', successCount: 50, failureCount: 10 }),
    ];

    const events = generateConnectionEvents(accounts);

    expect(events).toHaveLength(120); // 60 + 60 total before cap
    expect(events.slice(0, MAX_TIMELINE_EVENTS)).toHaveLength(MAX_TIMELINE_EVENTS);
  });

  it('returns events sorted by timestamp descending', () => {
    const accounts: AccountData[] = [
      makeAccount({ id: 'a1', email: 'a@x.com', successCount: 10 }),
      makeAccount({ id: 'a2', email: 'b@x.com', successCount: 10 }),
    ];

    const events = generateConnectionEvents(accounts);

    for (let i = 1; i < events.length; i++) {
      expect(events[i - 1].timestamp.getTime()).toBeGreaterThanOrEqual(
        events[i].timestamp.getTime()
      );
    }
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  it('returns empty array for empty accounts input', () => {
    expect(generateConnectionEvents([])).toEqual([]);
  });

  it('returns empty array when all accounts have zero counts', () => {
    const accounts: AccountData[] = [
      makeAccount({ id: 'a1', email: 'a@x.com', successCount: 0, failureCount: 0 }),
      makeAccount({ id: 'a2', email: 'b@x.com', successCount: 0, failureCount: 0 }),
    ];

    expect(generateConnectionEvents(accounts)).toEqual([]);
  });

  it('handles accounts with no lastUsedAt (falls back to now)', () => {
    const accounts: AccountData[] = [
      makeAccount({ id: 'a1', email: 'no-date@x.com', successCount: 5 }),
    ];

    const events = generateConnectionEvents(accounts);

    expect(events).toHaveLength(5);
    events.forEach((e) => expect(e.accountEmail).toBe('no-date@x.com'));
  });

  it('handles single account — all events belong to that account', () => {
    const accounts: AccountData[] = [
      makeAccount({
        id: 'solo',
        email: 'solo@x.com',
        successCount: 3,
        failureCount: 2,
        lastUsedAt: new Date().toISOString(),
      }),
    ];

    const events = generateConnectionEvents(accounts);

    expect(events).toHaveLength(5);
    events.forEach((e) => expect(e.accountEmail).toBe('solo@x.com'));
  });

  it('generates correct event ids and status labels', () => {
    const accounts: AccountData[] = [
      makeAccount({ id: 'acc1', email: 'x@x.com', successCount: 2, failureCount: 1 }),
    ];

    const events = generateConnectionEvents(accounts);

    const successes = events.filter((e) => e.status === 'success');
    const failures = events.filter((e) => e.status === 'failed');

    expect(successes).toHaveLength(2);
    expect(failures).toHaveLength(1);

    // IDs follow pattern: {accountId}-{status}-{index}
    expect(successes[0].id).toMatch(/^acc1-success-\d+$/);
    expect(failures[0].id).toMatch(/^acc1-failed-\d+$/);
  });

  it('all generated timestamps are not in the future', () => {
    const now = new Date();
    const accounts: AccountData[] = [makeAccount({ id: 'a1', email: 'a@x.com', successCount: 10 })];

    const events = generateConnectionEvents(accounts);

    events.forEach((e) => {
      // Allow 1s tolerance for test execution time
      expect(e.timestamp.getTime()).toBeLessThanOrEqual(now.getTime() + 1000);
    });
  });
});
