import { describe, expect, it } from 'vitest';

import type { OAuthAccount } from '@/lib/api-client';
import { buildAccountVisualGroups } from '@/lib/account-visual-groups';

function makeAccount(overrides: Partial<OAuthAccount> & Pick<OAuthAccount, 'id' | 'tokenFile'>) {
  return {
    id: overrides.id,
    email: 'kaidu.kd@gmail.com',
    provider: 'codex',
    isDefault: false,
    tokenFile: overrides.tokenFile,
    createdAt: '2026-03-30T00:00:00.000Z',
    ...overrides,
  } satisfies OAuthAccount;
}

describe('buildAccountVisualGroups', () => {
  it('preserves distinct saved nicknames and exact identities within a same-email group', () => {
    const accounts = [
      makeAccount({
        id: 'user@example.com#team',
        email: 'user@example.com',
        nickname: 'Work',
        tokenFile: 'codex-user@example.com-team.json',
      }),
      makeAccount({
        id: 'user@example.com#free',
        email: 'user@example.com',
        nickname: 'Personal',
        tokenFile: 'codex-user@example.com-free.json',
      }),
    ];
    const snapshot = structuredClone(accounts);
    const [group] = buildAccountVisualGroups(accounts);
    expect(group?.nickname).toBeUndefined();
    expect(
      group?.variants?.map(({ id, nickname, tokenFile }) => ({ id, nickname, tokenFile }))
    ).toEqual(accounts.map(({ id, nickname, tokenFile }) => ({ id, nickname, tokenFile })));
    expect(group?.memberIds).toEqual(accounts.map(({ id }) => id));
    expect(accounts).toEqual(snapshot);
  });

  it('carries a single saved nickname and uses only shared nicknames for grouped headings', () => {
    const account = makeAccount({
      id: 'user@example.com#free',
      nickname: 'Personal',
      tokenFile: 'codex-user@example.com-free.json',
    });
    expect(buildAccountVisualGroups([account])[0]?.nickname).toBe('Personal');
    const sibling = {
      ...account,
      id: 'user@example.com#plus',
      tokenFile: 'codex-user@example.com-plus.json',
    };
    expect(buildAccountVisualGroups([account, sibling])[0]?.nickname).toBe('Personal');
    expect(
      buildAccountVisualGroups([account, { ...sibling, nickname: undefined }])[0]?.nickname
    ).toBeUndefined();
  });

  it('preserves grouped codex variant identity details while ordering by audience', () => {
    const groups = buildAccountVisualGroups([
      makeAccount({
        id: 'kaidu.kd@gmail.com#free',
        tokenFile: 'codex-kaidu.kd@gmail.com-free.json',
      }),
      makeAccount({
        id: 'kaidu.kd@gmail.com#04a0f049-team',
        tokenFile: 'codex-04a0f049-kaidu.kd@gmail.com-team.json',
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.variants?.map((variant) => variant.audience)).toEqual(['business', 'free']);
    expect(groups[0]?.variants?.map((variant) => variant.inlineLabel)).toEqual([
      'Business · Workspace 04a0f049',
      'Free',
    ]);
    expect(groups[0]?.variants?.map((variant) => variant.compactDetailLabel)).toEqual([
      '04a0f049',
      null,
    ]);
    expect(groups[0]?.memberIds).toEqual([
      'kaidu.kd@gmail.com#04a0f049-team',
      'kaidu.kd@gmail.com#free',
    ]);
  });

  it('keeps personal and free codex plans distinct inside the same grouped card', () => {
    const groups = buildAccountVisualGroups([
      makeAccount({
        id: 'kaidu.kd@gmail.com#plus',
        tokenFile: 'codex-kaidu.kd@gmail.com-plus.json',
      }),
      makeAccount({
        id: 'kaidu.kd@gmail.com#free',
        tokenFile: 'codex-kaidu.kd@gmail.com-free.json',
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.variants?.map((variant) => variant.inlineLabel)).toEqual([
      'Personal · Plus',
      'Free',
    ]);
  });
});
