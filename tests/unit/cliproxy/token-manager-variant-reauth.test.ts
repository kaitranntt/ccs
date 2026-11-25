import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  findNewTokenSnapshot,
  findNewTokenSnapshotForAuthAttempt,
  listProviderTokenSnapshots,
  registerAccountFromToken,
} from '../../../src/cliproxy/auth/token-manager';
import {
  getProviderAccounts,
  loadAccountsRegistry,
} from '../../../src/cliproxy/accounts/account-manager';
import { extractAccountVariantFromAccountId } from '../../../src/cliproxy/accounts/email-account-identity';

describe('token-manager #variant re-auth and existing-email overwrite (Issue #1837)', () => {
  let tempHome = '';
  let originalCcsHome: string | undefined;
  let tokenDir = '';

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-token-manager-1837-'));
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;
    tokenDir = path.join(tempHome, '.ccs', 'cliproxy', 'auth');
    fs.mkdirSync(tokenDir, { recursive: true });
  });

  afterEach(() => {
    if (originalCcsHome === undefined) {
      delete process.env.CCS_HOME;
    } else {
      process.env.CCS_HOME = originalCcsHome;
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('extracts account variant suffixes cleanly', () => {
    expect(extractAccountVariantFromAccountId('user@example.com#5bc8604b')).toBe('5bc8604b');
    expect(extractAccountVariantFromAccountId('user@example.com')).toBeNull();
    expect(extractAccountVariantFromAccountId('user@example.com#')).toBeNull();
  });

  it('matches and registers a single-file #variant Claude account during re-authentication', () => {
    const tokenFile = 'claude-5bc8604b-user@example.com.json';
    const tokenPath = path.join(tokenDir, tokenFile);
    fs.writeFileSync(
      tokenPath,
      JSON.stringify({
        type: 'claude',
        email: 'user@example.com',
        access_token: 'old-access',
        last_refresh: '2026-10-01T00:00:00.000Z',
      }),
      'utf8'
    );

    // Seed accounts.json with the #variant id that existed when another sibling was present
    const registryPath = path.join(tempHome, '.ccs', 'cliproxy', 'accounts.json');
    fs.writeFileSync(
      registryPath,
      JSON.stringify({
        version: 1,
        providers: {
          claude: {
            default: 'user@example.com#5bc8604b',
            accounts: {
              'user@example.com#5bc8604b': {
                email: 'user@example.com',
                nickname: 'work',
                tokenFile,
                createdAt: '2026-01-01T00:00:00.000Z',
                lastUsedAt: '2026-01-01T00:00:00.000Z',
              },
            },
          },
        },
      }),
      'utf8'
    );

    const beforeSnapshots = listProviderTokenSnapshots('claude', tokenDir);
    expect(beforeSnapshots).toHaveLength(1);
    // When duplicateEmailCount <= 1, snapshot.accountId collapses to bare email
    expect(beforeSnapshots[0]?.accountId).toBe('user@example.com');

    fs.writeFileSync(
      tokenPath,
      JSON.stringify({
        type: 'claude',
        email: 'user@example.com',
        access_token: 'new-access',
        last_refresh: '2026-10-20T00:00:00.000Z',
      }),
      'utf8'
    );

    const matched = findNewTokenSnapshotForAuthAttempt(
      'claude',
      tokenDir,
      beforeSnapshots,
      'user@example.com#5bc8604b'
    );
    expect(matched?.file).toBe(tokenFile);

    const registered = registerAccountFromToken(
      'claude',
      tokenDir,
      'work',
      false,
      'user@example.com#5bc8604b'
    );
    expect(registered).not.toBeNull();
    expect(registered?.tokenFile).toBe(tokenFile);
    expect(registered?.email).toBe('user@example.com');
    expect(registered?.nickname).toBe('work');

    // Persisted registry should migrate cleanly without leaving a duplicate entry
    const registry = loadAccountsRegistry();
    expect(Object.keys(registry.providers.claude?.accounts ?? {})).toEqual(['user@example.com']);
    expect(registry.providers.claude?.default).toBe('user@example.com');
    expect(getProviderAccounts('claude')).toHaveLength(1);
  });

  it('does not falsely match a different variant when multiple variants of the same email exist', () => {
    const fileA = 'claude-5bc8604b-user@example.com.json';
    const fileB = 'claude-a1b2c3d4-user@example.com.json';
    fs.writeFileSync(
      path.join(tokenDir, fileA),
      JSON.stringify({ type: 'claude', email: 'user@example.com', access_token: 'a1' }),
      'utf8'
    );
    fs.writeFileSync(
      path.join(tokenDir, fileB),
      JSON.stringify({ type: 'claude', email: 'user@example.com', access_token: 'b1' }),
      'utf8'
    );

    const beforeSnapshots = listProviderTokenSnapshots('claude', tokenDir);
    expect(beforeSnapshots).toHaveLength(2);

    // Only variant B is modified, while re-auth targets variant A (#5bc8604b)
    fs.writeFileSync(
      path.join(tokenDir, fileB),
      JSON.stringify({ type: 'claude', email: 'user@example.com', access_token: 'b2' }),
      'utf8'
    );

    const mismatch = findNewTokenSnapshotForAuthAttempt(
      'claude',
      tokenDir,
      beforeSnapshots,
      'user@example.com#5bc8604b'
    );
    expect(mismatch).toBeNull();

    // Now variant A is modified -> matches variant A specifically
    fs.writeFileSync(
      path.join(tokenDir, fileA),
      JSON.stringify({ type: 'claude', email: 'user@example.com', access_token: 'a2' }),
      'utf8'
    );

    const matchedA = findNewTokenSnapshotForAuthAttempt(
      'claude',
      tokenDir,
      beforeSnapshots,
      'user@example.com#5bc8604b'
    );
    expect(matchedA?.file).toBe(fileA);
  });

  it('does not falsely match a conflicting #variant even when only one file is on disk', () => {
    const otherVariantFile = 'claude-a1b2c3d4-user@example.com.json';
    fs.writeFileSync(
      path.join(tokenDir, otherVariantFile),
      JSON.stringify({ type: 'claude', email: 'user@example.com', access_token: 'v1' }),
      'utf8'
    );
    const beforeSnapshots = listProviderTokenSnapshots('claude', tokenDir);

    fs.writeFileSync(
      path.join(tokenDir, otherVariantFile),
      JSON.stringify({ type: 'claude', email: 'user@example.com', access_token: 'v2' }),
      'utf8'
    );

    const matched = findNewTokenSnapshotForAuthAttempt(
      'claude',
      tokenDir,
      beforeSnapshots,
      'user@example.com#5bc8604b'
    );
    expect(matched).toBeNull();
  });

  it('matches an existing-email overwrite on Add account when no brand-new filename appeared', () => {
    const existingFile = 'claude-5bc8604b-user@example.com.json';
    const existingPath = path.join(tokenDir, existingFile);
    fs.writeFileSync(
      existingPath,
      JSON.stringify({
        type: 'claude',
        email: 'user@example.com',
        access_token: 'token-1',
        last_refresh: '2026-10-01T00:00:00.000Z',
      }),
      'utf8'
    );

    const beforeSnapshots = listProviderTokenSnapshots('claude', tokenDir);

    // Simulate Add account overwriting the existing deterministic token file
    fs.writeFileSync(
      existingPath,
      JSON.stringify({
        type: 'claude',
        email: 'user@example.com',
        access_token: 'token-2',
        last_refresh: '2026-10-20T00:00:00.000Z',
      }),
      'utf8'
    );

    const matched = findNewTokenSnapshot(
      listProviderTokenSnapshots('claude', tokenDir),
      beforeSnapshots
    );
    expect(matched?.file).toBe(existingFile);
  });

  it('prefers a brand-new token file over an overwritten existing file during Add account', () => {
    const existingFile = 'claude-5bc8604b-existing@example.com.json';
    const newFile = 'claude-99887766-new@example.com.json';
    fs.writeFileSync(
      path.join(tokenDir, existingFile),
      JSON.stringify({ type: 'claude', email: 'existing@example.com', version: 1 }),
      'utf8'
    );
    const beforeSnapshots = listProviderTokenSnapshots('claude', tokenDir);

    // Background refresh touches existing file while Add account creates a new file
    fs.writeFileSync(
      path.join(tokenDir, existingFile),
      JSON.stringify({ type: 'claude', email: 'existing@example.com', version: 2 }),
      'utf8'
    );
    fs.writeFileSync(
      path.join(tokenDir, newFile),
      JSON.stringify({ type: 'claude', email: 'new@example.com', version: 1 }),
      'utf8'
    );

    const matched = findNewTokenSnapshot(
      listProviderTokenSnapshots('claude', tokenDir),
      beforeSnapshots
    );
    expect(matched?.file).toBe(newFile);
  });

  it('detects refreshed lastRefresh on hand-constructed snapshots without fingerprint changes', () => {
    const before = [
      {
        file: 'claude-5bc8604b-user@example.com.json',
        mtimeMs: 1000,
        accountId: 'user@example.com',
        email: 'user@example.com',
        lastRefresh: '2026-10-01T00:00:00.000Z',
        fingerprint: 'same',
      },
    ];
    const after = [
      {
        file: 'claude-5bc8604b-user@example.com.json',
        mtimeMs: 1000,
        accountId: 'user@example.com',
        email: 'user@example.com',
        lastRefresh: '2026-10-20T00:00:00.000Z',
        fingerprint: 'same',
      },
    ];

    expect(findNewTokenSnapshot(after, before)?.file).toBe('claude-5bc8604b-user@example.com.json');
  });
});
