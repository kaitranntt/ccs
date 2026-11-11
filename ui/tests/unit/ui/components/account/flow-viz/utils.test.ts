/**
 * Unit tests for buildConnectionEvents() in flow-viz/utils.ts
 */

import { describe, expect, it } from 'vitest';

import { buildConnectionEvents } from '@/components/account/flow-viz/utils';
import type { AccountData } from '@/components/account/flow-viz/types';
import type { RecentRequest } from '@/hooks/use-cliproxy-stats';
import type { AccountVisualVariant } from '@/lib/account-visual-groups';

function makeAccount(
  overrides: Partial<AccountData> & Pick<AccountData, 'id' | 'email'>
): AccountData {
  return {
    provider: 'codex',
    successCount: 0,
    failureCount: 0,
    color: '#000000',
    ...overrides,
  };
}

function makeVariant(id: string, email: string): AccountVisualVariant {
  return {
    id,
    email,
    tokenFile: `${id}.json`,
    isDefault: false,
    successCount: 0,
    failureCount: 0,
    audience: 'personal',
    audienceLabel: null,
    detailLabel: null,
    compactDetailLabel: null,
    inlineLabel: null,
  };
}

function makeRequest(accountKey: string, timestamp: string, failed = false): RecentRequest {
  return { accountKey, timestamp, failed };
}

describe('buildConnectionEvents()', () => {
  it('maps each request to the account that served it, keeping request order', () => {
    const accounts = [
      makeAccount({ id: 'first-id', email: 'first@example.com', nickname: 'First' }),
      makeAccount({ id: 'second@example.com', email: 'second@example.com' }),
    ];
    const requests = [
      makeRequest('codex:second@example.com', '2026-03-26T10:02:00.000Z', true),
      makeRequest('codex:first@example.com', '2026-03-26T10:01:00.000Z'),
      makeRequest('codex:first-id', '2026-03-26T10:00:00.000Z'),
    ];

    const events = buildConnectionEvents(requests, accounts);

    expect(events.map((event) => [event.accountEmail, event.status])).toEqual([
      ['second@example.com', 'failed'],
      ['first@example.com', 'success'],
      ['first@example.com', 'success'],
    ]);
    expect(events[1]).toMatchObject({
      accountNickname: 'First',
      timestamp: new Date('2026-03-26T10:01:00.000Z'),
    });
  });

  it('matches grouped accounts through their variants', () => {
    const grouped = makeAccount({
      id: 'codex:shared@example.com',
      email: 'shared@example.com',
      memberIds: ['shared@example.com#team', 'shared@example.com#free'],
      variants: [
        makeVariant('shared@example.com#team', 'shared@example.com'),
        makeVariant('shared@example.com#free', 'shared@example.com'),
      ],
    });

    const events = buildConnectionEvents(
      [
        makeRequest('codex:shared@example.com#team', '2026-03-26T10:01:00.000Z'),
        makeRequest('codex:shared@example.com#free', '2026-03-26T10:00:00.000Z'),
      ],
      [grouped]
    );

    expect(events).toHaveLength(2);
    expect(events.every((event) => event.accountEmail === 'shared@example.com')).toBe(true);
  });

  it('drops requests from accounts that are not shown or belong to another provider', () => {
    const accounts = [makeAccount({ id: 'shown@example.com', email: 'shown@example.com' })];
    const requests = [
      makeRequest('codex:hidden@example.com', '2026-03-26T10:02:00.000Z'),
      makeRequest('gemini:shown@example.com', '2026-03-26T10:01:00.000Z'),
      makeRequest('codex:shown@example.com', '2026-03-26T10:00:00.000Z'),
    ];

    const events = buildConnectionEvents(requests, accounts);

    expect(events).toHaveLength(1);
    expect(events[0].timestamp).toEqual(new Date('2026-03-26T10:00:00.000Z'));
  });

  it('returns no events when there are no requests', () => {
    expect(
      buildConnectionEvents([], [makeAccount({ id: 'a@example.com', email: 'a@example.com' })])
    ).toEqual([]);
  });
});
