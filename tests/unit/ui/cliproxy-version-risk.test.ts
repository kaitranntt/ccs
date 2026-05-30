import { describe, expect, it } from 'bun:test';
import {
  compareCliproxyVersions,
  isCliproxyVersionExperimental,
  isCliproxyVersionInRange,
} from '../../../ui/src/lib/cliproxy-version-risk';

describe('cliproxy-version-risk helpers', () => {
  it('compares fork release suffixes after core versions', () => {
    expect(compareCliproxyVersions('6.6.88', '6.6.81-0')).toBe(1);
    expect(compareCliproxyVersions('6.6.81-0', '6.6.81')).toBe(0);
    expect(compareCliproxyVersions('7.1.31-1', '7.1.31-0')).toBe(1);
    expect(compareCliproxyVersions('7.1.31-0', '7.1.31-1')).toBe(-1);
    expect(compareCliproxyVersions('6.6.80', '6.6.81')).toBe(-1);
  });

  it('detects experimental versions against max stable', () => {
    expect(isCliproxyVersionExperimental('10.0.0', '9.9.999-0')).toBe(true);
    expect(isCliproxyVersionExperimental('6.6.88', '9.9.999-0')).toBe(false);
  });

  it('detects versions inside the faulty range', () => {
    expect(isCliproxyVersionInRange('6.6.81', '6.6.81-0', '6.6.88-0')).toBe(true);
    expect(isCliproxyVersionInRange('6.6.88', '6.6.81-0', '6.6.88-0')).toBe(true);
    expect(isCliproxyVersionInRange('6.6.89', '6.6.81-0', '6.6.88-0')).toBe(false);
  });
});
