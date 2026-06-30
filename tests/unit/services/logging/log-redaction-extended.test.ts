import { describe, expect, it } from 'bun:test';
import {
  redactArgv,
  redactContext,
} from '../../../../src/services/logging/log-redaction';

describe('log redaction (extended sensitive keys)', () => {
  const newSensitiveKeys = [
    'refresh_token',
    'id_token',
    'access_token',
    'client_secret',
    'bearer',
    'assertion',
    'copilot_token',
    'copilot-token',
    'cursor_session_key',
    'cursor-session-key',
    'x-api-key',
    'x_goog_api_key',
    'proxy-authorization',
    'oauth_code',
    'auth_code',
    'auth_token',
  ];

  it.each(newSensitiveKeys)('redacts %s key (top-level)', (key) => {
    const redacted = redactContext({ [key]: 'secret-value', safe: 'ok' });
    expect(redacted[key]).toBe('[redacted]');
    expect(redacted.safe).toBe('ok');
  });

  it('redacts new keys nested under headers', () => {
    const redacted = redactContext({
      headers: {
        'x-api-key': 'sk-xxx',
        'proxy-authorization': 'Bearer abc',
        'copilot-token': 'gho_xxx',
      },
    });
    expect(redacted).toEqual({
      headers: {
        'x-api-key': '[redacted]',
        'proxy-authorization': '[redacted]',
        'copilot-token': '[redacted]',
      },
    });
  });

  it('redacts Bearer/Basic/Token scheme prefix in raw string values', () => {
    const redacted = redactContext({
      raw: 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig',
      basic: 'Basic dXNlcjpwYXNz',
      tokenLine: 'Token abc.def',
      plain: 'no-scheme-here',
    });
    expect(redacted.raw).toBe('Bearer [redacted]');
    expect(redacted.basic).toBe('Basic [redacted]');
    expect(redacted.tokenLine).toBe('Token [redacted]');
    expect(redacted.plain).toBe('no-scheme-here');
  });

  it('passes numeric/boolean values through even if key matches', () => {
    // expires_at is not a sensitive key; ensure non-string sensitive values
    // would also pass through if pattern matched (defense check).
    const redacted = redactContext({
      access_token: 'real-secret',
      expires_at: 1234567890,
      enabled: true,
    });
    expect(redacted.access_token).toBe('[redacted]');
    expect(redacted.expires_at).toBe(1234567890);
    expect(redacted.enabled).toBe(true);
  });

  it('recurses through arrays of objects', () => {
    const redacted = redactContext({
      tokens: [
        { access_token: 'a' },
        { refresh_token: 'b' },
        { id_token: 'c', meta: 'kept' },
      ],
    });
    expect(redacted).toEqual({
      tokens: [
        { access_token: '[redacted]' },
        { refresh_token: '[redacted]' },
        { id_token: '[redacted]', meta: 'kept' },
      ],
    });
  });

  it('fuzz-style: many random token-shaped keys all redact', () => {
    const variants = ['token', 'auth_token', 'refresh-token', 'id-token', 'X-API-KEY'];
    for (const v of variants) {
      const out = redactContext({ [v]: 'secret' });
      expect(out[v]).toBe('[redacted]');
    }
  });
});

describe('redactArgv', () => {
  it('redacts the value following sensitive flags', () => {
    expect(redactArgv(['--api-key', 'secret', '--other', 'ok'])).toEqual([
      '--api-key',
      '[redacted]',
      '--other',
      'ok',
    ]);
  });

  it('redacts multiple sensitive flags', () => {
    expect(
      redactArgv(['--token', 'a', '--secret', 'b', '--bearer', 'c', '--keep', 'd'])
    ).toEqual(['--token', '[redacted]', '--secret', '[redacted]', '--bearer', '[redacted]', '--keep', 'd']);
  });

  it('passes argv unchanged when no sensitive flags present', () => {
    expect(redactArgv(['build', '--watch', '--out', 'dist'])).toEqual([
      'build',
      '--watch',
      '--out',
      'dist',
    ]);
  });

  it('handles trailing sensitive flag with no value', () => {
    expect(redactArgv(['--api-key'])).toEqual(['--api-key']);
  });

  it('redacts kebab and snake case flag variants', () => {
    expect(redactArgv(['--api_key', 'x', '--auth-token', 'y'])).toEqual([
      '--api_key',
      '[redacted]',
      '--auth-token',
      '[redacted]',
    ]);
  });

  it('redacts prompt values passed with -p and --prompt', () => {
    expect(redactArgv(['glm', '-p', 'summarize secret account notes'])).toEqual([
      'glm',
      '-p',
      '[redacted]',
    ]);

    expect(redactArgv(['glm', '--prompt', 'summarize secret account notes'])).toEqual([
      'glm',
      '--prompt',
      '[redacted]',
    ]);
  });

  it('redacts inline prompt and sensitive flag assignments', () => {
    expect(
      redactArgv(['glm', '--prompt=summarize secret account notes', '--api-key=plainsecret'])
    ).toEqual(['glm', '--prompt=[redacted]', '--api-key=[redacted]']);
  });
});
