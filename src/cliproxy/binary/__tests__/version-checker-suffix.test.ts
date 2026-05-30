import { describe, expect, it } from 'bun:test';

import { compareCliproxyVersions, isNewerVersion } from '../version-checker';

describe('cliproxy version comparison', () => {
  it('treats missing fork release suffix as zero', () => {
    expect(compareCliproxyVersions('6.6.81', '6.6.81-0')).toBe(0);
    expect(isNewerVersion('6.6.81-0', '6.6.81')).toBe(false);
  });

  it('orders patched fork release suffixes after core version equality', () => {
    expect(compareCliproxyVersions('7.1.31-1', '7.1.31-0')).toBe(1);
    expect(compareCliproxyVersions('7.1.31-0', '7.1.31-1')).toBe(-1);
    expect(isNewerVersion('7.1.31-1', '7.1.31-0')).toBe(true);
  });

  it('lets core version precedence win before fork release suffixes', () => {
    expect(compareCliproxyVersions('7.1.32-0', '7.1.31-99')).toBe(1);
    expect(isNewerVersion('7.1.31-99', '7.1.32-0')).toBe(false);
  });
});
