/**
 * Tests for the native Claude Code credential reader.
 *
 * All fs / Keychain access is injected, so these tests never touch the real
 * filesystem or pop a macOS Keychain prompt.
 */

import { describe, expect, it } from 'bun:test';
import {
  readClaudeCredentials,
  getAccessToken,
  getSubscriptionTier,
  hasSupportedSubscription,
  type ClaudeNativeCredentials,
} from '../../../src/web-server/usage/claude-native-credentials';

function makeCreds(overrides: Record<string, unknown> = {}): ClaudeNativeCredentials {
  return {
    claudeAiOauth: {
      accessToken: 'tok-abc',
      subscriptionType: 'max',
      ...overrides,
    },
  };
}

describe('readClaudeCredentials', () => {
  it('parses the on-disk credentials file when present (file-first, no Keychain)', () => {
    let keychainCalled = false;
    const creds = readClaudeCredentials({
      platform: 'darwin',
      homedir: '/home/test',
      existsSyncImpl: () => true,
      readFileSyncImpl: () => JSON.stringify(makeCreds()),
      execSyncImpl: () => {
        keychainCalled = true;
        return '';
      },
    });
    expect(creds?.claudeAiOauth?.accessToken).toBe('tok-abc');
    // File present means the Keychain must NOT be consulted (avoids prompt).
    expect(keychainCalled).toBe(false);
  });

  it('falls back to the macOS Keychain when the file is absent', () => {
    const creds = readClaudeCredentials({
      platform: 'darwin',
      homedir: '/home/test',
      existsSyncImpl: () => false,
      readFileSyncImpl: () => {
        throw new Error('should not read file');
      },
      execSyncImpl: () => JSON.stringify(makeCreds({ subscriptionType: 'pro' })),
    });
    expect(creds?.claudeAiOauth?.subscriptionType).toBe('pro');
  });

  it('returns null when both file and Keychain are absent', () => {
    const creds = readClaudeCredentials({
      platform: 'darwin',
      homedir: '/home/test',
      existsSyncImpl: () => false,
      readFileSyncImpl: () => {
        throw new Error('no file');
      },
      execSyncImpl: () => {
        throw new Error('no keychain entry');
      },
    });
    expect(creds).toBeNull();
  });

  it('does not consult the Keychain on non-darwin platforms', () => {
    let keychainCalled = false;
    const creds = readClaudeCredentials({
      platform: 'linux',
      homedir: '/home/test',
      existsSyncImpl: () => false,
      readFileSyncImpl: () => {
        throw new Error('no file');
      },
      execSyncImpl: () => {
        keychainCalled = true;
        return '';
      },
    });
    expect(creds).toBeNull();
    expect(keychainCalled).toBe(false);
  });
});

describe('hasSupportedSubscription', () => {
  it.each(['', 'free', 'none'])('returns false for unsupported subscriptionType %p', (sub) => {
    expect(hasSupportedSubscription(makeCreds({ subscriptionType: sub }))).toBe(false);
  });

  it.each(['max', 'pro', 'team', 'enterprise'])(
    'returns true for supported subscriptionType %p',
    (sub) => {
      expect(hasSupportedSubscription(makeCreds({ subscriptionType: sub }))).toBe(true);
    }
  );

  it('returns true via rateLimitTier regex when subscriptionType is empty', () => {
    const creds = makeCreds({ subscriptionType: '', rateLimitTier: 'claude_max_20x' });
    expect(hasSupportedSubscription(creds)).toBe(true);
  });

  it('returns false for null credentials', () => {
    expect(hasSupportedSubscription(null)).toBe(false);
  });
});

describe('token + tier extraction', () => {
  it('getAccessToken returns the token or null', () => {
    expect(getAccessToken(makeCreds())).toBe('tok-abc');
    expect(getAccessToken(makeCreds({ accessToken: '' }))).toBeNull();
    expect(getAccessToken(null)).toBeNull();
  });

  it('getSubscriptionTier returns the tier or null', () => {
    expect(getSubscriptionTier(makeCreds({ subscriptionType: 'max' }))).toBe('max');
    expect(getSubscriptionTier(makeCreds({ subscriptionType: '' }))).toBeNull();
    expect(getSubscriptionTier(null)).toBeNull();
  });
});
