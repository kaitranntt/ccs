import { describe, expect, test } from 'bun:test';
import {
  AuthError,
  BinaryError,
  CCSError,
  ConfigError,
  isCCSError,
  MigrationError,
  NetworkError,
  ProfileError,
  ProviderError,
  ProxyError,
  RetryableError,
  UserAbortError,
  ValidationError,
} from '../error-types';
import { ExitCode } from '../exit-codes';

/**
 * P4 behavior-lock: the typed-error -> exit-code mapping is the contract this
 * epic relies on. Migrating `throw new Error` to typed subclasses changes the
 * process exit code (via handleError -> getExitCode); these tests lock the
 * mapping so a future change is caught. See
 * docs/reports/typed-error-exit-code-compat-audit.md.
 */
describe('typed-error taxonomy -> exit-code mapping (P4 contract)', () => {
  test('each typed class carries its documented ExitCode', () => {
    expect(new ConfigError('m').code).toBe(ExitCode.CONFIG_ERROR);
    expect(new NetworkError('m').code).toBe(ExitCode.NETWORK_ERROR);
    expect(new AuthError('m').code).toBe(ExitCode.AUTH_ERROR);
    expect(new BinaryError('m').code).toBe(ExitCode.BINARY_ERROR);
    expect(new ProviderError('m', 'p').code).toBe(ExitCode.PROVIDER_ERROR);
    expect(new ProfileError('m').code).toBe(ExitCode.PROFILE_ERROR);
    expect(new ProxyError('m').code).toBe(ExitCode.PROXY_ERROR);
    expect(new MigrationError('m').code).toBe(ExitCode.MIGRATION_ERROR);
    expect(new UserAbortError().code).toBe(ExitCode.USER_ABORT);
    // These two intentionally keep GENERAL_ERROR (no shift for callers).
    expect(new ValidationError('m').code).toBe(ExitCode.GENERAL_ERROR);
    expect(new RetryableError('m').code).toBe(ExitCode.GENERAL_ERROR);
  });

  test('all typed errors are CCSError and Error (instanceof chains preserved)', () => {
    const samples = [
      new ConfigError('m'),
      new AuthError('m'),
      new ProfileError('m'),
      new ProviderError('m', 'p'),
      new ValidationError('m'),
    ];
    for (const e of samples) {
      expect(e).toBeInstanceOf(CCSError);
      expect(e).toBeInstanceOf(Error);
      expect(isCCSError(e)).toBe(true);
    }
  });

  test('plain Error is NOT a CCSError (migration boundary)', () => {
    expect(isCCSError(new Error('plain'))).toBe(false);
  });

  test('typed errors preserve their message (message-based assertions are stable)', () => {
    expect(new ProfileError(`Profile not found: x`).message).toBe('Profile not found: x');
    expect(new AuthError(`OAuth start failed with status 400`).message).toBe(
      'OAuth start failed with status 400'
    );
    expect(new ConfigError(`Invalid settings path`).message).toBe('Invalid settings path');
  });

  test('structured context is carried (profileName / provider / configPath)', () => {
    expect(new ProfileError('m', 'my-profile').profileName).toBe('my-profile');
    expect(new AuthError('m', 'codex').provider).toBe('codex');
    expect(new ConfigError('m', '/path/to/cfg').configPath).toBe('/path/to/cfg');
    expect(new ProviderError('m', 'gemini').provider).toBe('gemini');
  });
});
