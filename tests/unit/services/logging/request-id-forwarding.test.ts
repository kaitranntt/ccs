import { afterEach, describe, expect, test } from 'bun:test';
import {
  REQUEST_ID_ENV,
  forwardRequestIdEnv,
  getRequestId,
  resolveRequestIdFromEnv,
  runWithRequestId,
} from '../../../../src/services/logging';

describe('requestId cross-process forwarding', () => {
  const originalEnv = process.env[REQUEST_ID_ENV];

  afterEach(() => {
    if (originalEnv === undefined) delete process.env[REQUEST_ID_ENV];
    else process.env[REQUEST_ID_ENV] = originalEnv;
  });

  test('resolveRequestIdFromEnv returns a well-formed forwarded id', () => {
    process.env[REQUEST_ID_ENV] = '12345678-1234-1234-1234-1234567890ab';
    expect(resolveRequestIdFromEnv()).toBe('12345678-1234-1234-1234-1234567890ab');
  });

  test('resolveRequestIdFromEnv trims surrounding whitespace', () => {
    process.env[REQUEST_ID_ENV] = '  abcdef123456  ';
    expect(resolveRequestIdFromEnv()).toBe('abcdef123456');
  });

  test('resolveRequestIdFromEnv rejects garbage (too short, spaces, control chars)', () => {
    process.env[REQUEST_ID_ENV] = 'short';
    expect(resolveRequestIdFromEnv()).toBeUndefined();
    process.env[REQUEST_ID_ENV] = 'has spaces here';
    expect(resolveRequestIdFromEnv()).toBeUndefined();
  });

  test('resolveRequestIdFromEnv returns undefined when unset', () => {
    delete process.env[REQUEST_ID_ENV];
    expect(resolveRequestIdFromEnv()).toBeUndefined();
  });

  test('runWithRequestId reuses a forwarded env id (child re-anchor)', () => {
    process.env[REQUEST_ID_ENV] = 'forwarded-id-1234';
    const { requestId } = runWithRequestId(() => getRequestId());
    expect(requestId).toBe('forwarded-id-1234');
  });

  test('runWithRequestId mints a fresh id when no env id is present', () => {
    delete process.env[REQUEST_ID_ENV];
    const { requestId } = runWithRequestId(() => undefined);
    expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(requestId).not.toBe('forwarded-id-1234');
  });

  test('forwardRequestIdEnv emits the active id for a child spawn env', () => {
    delete process.env[REQUEST_ID_ENV];
    runWithRequestId(() => {
      const envFragment = forwardRequestIdEnv();
      expect(envFragment[REQUEST_ID_ENV]).toBe(getRequestId());
    });
  });

  test('forwardRequestIdEnv is empty when no context is active', () => {
    delete process.env[REQUEST_ID_ENV];
    expect(forwardRequestIdEnv()).toEqual({});
  });
});
