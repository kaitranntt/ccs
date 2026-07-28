/**
 * Tests: CLIProxy retry config schema bounds (request_retry, max_retry_interval).
 *
 * Verifies the opt-in contract: both fields accept only non-negative integers.
 */

import { describe, it, expect } from 'bun:test';
import {
  isValidCliproxyRetryValue,
  CLIPROXY_RETRY_MIN_VALUE,
  CLIPROXY_RETRY_RANGE_MESSAGE,
} from '../cliproxy';

describe('isValidCliproxyRetryValue', () => {
  it('accepts 0 (the disabled default)', () => {
    expect(isValidCliproxyRetryValue(0)).toBe(true);
  });

  it('accepts positive integers', () => {
    expect(isValidCliproxyRetryValue(3)).toBe(true);
    expect(isValidCliproxyRetryValue(30)).toBe(true);
  });

  it('rejects negative numbers', () => {
    expect(isValidCliproxyRetryValue(-1)).toBe(false);
  });

  it('rejects non-integer numbers', () => {
    expect(isValidCliproxyRetryValue(1.5)).toBe(false);
  });

  it('rejects non-number types', () => {
    expect(isValidCliproxyRetryValue('3')).toBe(false);
    expect(isValidCliproxyRetryValue(undefined)).toBe(false);
    expect(isValidCliproxyRetryValue(null)).toBe(false);
    expect(isValidCliproxyRetryValue(true)).toBe(false);
  });

  it('rejects NaN and Infinity', () => {
    expect(isValidCliproxyRetryValue(Number.NaN)).toBe(false);
    expect(isValidCliproxyRetryValue(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('exposes the accepted-range constants used in recoverable error messages', () => {
    expect(CLIPROXY_RETRY_MIN_VALUE).toBe(0);
    expect(CLIPROXY_RETRY_RANGE_MESSAGE).toContain('0');
  });
});
