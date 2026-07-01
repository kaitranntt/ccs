import { describe, expect, it } from 'bun:test';
import {
  MAX_CONTEXT_GROUP_LENGTH,
  isValidAccountProfileName,
  policyToAccountContextMetadata,
  resolveAccountContextPolicy,
  resolveCreateAccountContext,
} from '../../src/auth/account-context';

describe('account context helpers', () => {
  it('rejects context groups that exceed the max length', () => {
    const group = `a${'x'.repeat(MAX_CONTEXT_GROUP_LENGTH)}`;
    const result = resolveCreateAccountContext({ shareContext: false, contextGroup: group });

    expect(result.error).toContain('Invalid context group');
  });

  it('rejects profile names with unsupported characters', () => {
    expect(isValidAccountProfileName('work')).toBe(true);
    expect(isValidAccountProfileName('gemini:default')).toBe(false);
  });

  it('rejects reserved account profile names', () => {
    expect(isValidAccountProfileName('default')).toBe(false);
    expect(isValidAccountProfileName('Default')).toBe(false);
  });

  it('falls back to default shared group for invalid persisted metadata', () => {
    const resolved = resolveAccountContextPolicy({
      context_mode: 'shared',
      context_group: '###',
    });

    expect(resolved.mode).toBe('shared');
    expect(resolved.group).toBe('default');
  });

  it('round-trips shared policy metadata with normalized context group', () => {
    const metadata = policyToAccountContextMetadata({
      mode: 'shared',
      group: 'Sprint-A',
    });

    const resolved = resolveAccountContextPolicy(metadata);
    expect(resolved.mode).toBe('shared');
    expect(resolved.group).toBe('sprint-a');
  });

  it('normalizes whitespace in explicit shared context group names', () => {
    const result = resolveCreateAccountContext({
      shareContext: false,
      contextGroup: ' Team Alpha ',
    });

    expect(result.error).toBeUndefined();
    expect(result.policy.mode).toBe('shared');
    expect(result.policy.group).toBe('team-alpha');
  });

  it('supports deeper continuity for shared create flows', () => {
    const result = resolveCreateAccountContext({
      shareContext: true,
      deeperContinuity: true,
    });

    expect(result.error).toBeUndefined();
    expect(result.policy.mode).toBe('shared');
    expect(result.policy.continuityMode).toBe('deeper');
  });

  it('rejects deeper continuity without shared context flags', () => {
    const result = resolveCreateAccountContext({
      shareContext: false,
      deeperContinuity: true,
    });

    expect(result.error).toContain('requires shared context');
  });

  it('defaults shared continuity mode to standard for legacy metadata', () => {
    const resolved = resolveAccountContextPolicy({
      context_mode: 'shared',
      context_group: 'team-alpha',
    });

    expect(resolved.mode).toBe('shared');
    expect(resolved.group).toBe('team-alpha');
    expect(resolved.continuityMode).toBe('standard');
  });
});
