import { describe, expect, it } from 'bun:test';
import {
  normalizeSharedResourceMetadata,
  resolveSharedResourcePolicy,
  sharedResourceModeToMetadata,
} from '../../../src/auth/shared-resource-policy';

describe('shared resource policy', () => {
  it('defaults missing metadata to shared resources', () => {
    const policy = resolveSharedResourcePolicy(undefined);

    expect(policy.mode).toBe('shared');
    expect(policy.inferred).toBe(true);
    expect(policy.profileLocal).toBe(false);
  });

  it('resolves legacy bare metadata as profile-local', () => {
    const policy = resolveSharedResourcePolicy({ bare: true });

    expect(policy.mode).toBe('profile-local');
    expect(policy.inferred).toBe(true);
    expect(policy.profileLocal).toBe(true);
  });

  it('lets explicit shared mode override stale bare metadata', () => {
    const normalized = normalizeSharedResourceMetadata({
      shared_resource_mode: 'shared',
      bare: true,
    });

    expect(normalized.shared_resource_mode).toBe('shared');
    expect(normalized.bare).toBeUndefined();
    expect(resolveSharedResourcePolicy(normalized).profileLocal).toBe(false);
  });

  it('normalizes explicit profile-local mode to legacy-compatible bare metadata', () => {
    const normalized = normalizeSharedResourceMetadata({
      shared_resource_mode: 'profile-local',
    }) as { shared_resource_mode: string; bare?: boolean };

    expect(normalized.shared_resource_mode).toBe('profile-local');
    expect(normalized.bare).toBe(true);
  });

  it('builds write metadata for both supported modes', () => {
    expect(sharedResourceModeToMetadata('profile-local')).toEqual({
      shared_resource_mode: 'profile-local',
      bare: true,
    });
    expect(sharedResourceModeToMetadata('shared')).toEqual({
      shared_resource_mode: 'shared',
      bare: undefined,
    });
  });
});
