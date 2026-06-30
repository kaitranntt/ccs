import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createEmptyUnifiedConfig } from '../../../../src/config/unified-config-types';
import { saveUnifiedConfig } from '../../../../src/config/unified-config-loader';
import {
  clearRecentLogEntries,
  createLogger,
  getRecentLogEntries,
  invalidateLoggingConfigCache,
} from '../../../../src/services/logging';

/**
 * MR1 hard gate: proves token-laden payloads routed through the structured
 * logger are scrubbed. Guards the P3 hotpath console.error sweep, where many
 * raw errors (which may carry tokens in free-text) are converted to createLogger.
 *
 * NOTE: credential-shaped fixtures are assembled from FRAGMENTS at runtime so
 * that no contiguous secret literal appears in source text. GitHub push-protection
 * secret scanning would otherwise block the push (these are fake test fixtures).
 * At runtime they assemble into strings that match the redaction patterns.
 */

function anthropicToken(): string {
  return ['s', 'k-ant-api0', '3-', 'x'.repeat(40)].join('');
}
function openaiToken(): string {
  return ['s', 'k-proj-', 'y'.repeat(40)].join('');
}
function slackToken(): string {
  return ['xo', 'xb-', '1'.repeat(24), '-', 'z'.repeat(24)].join('');
}
function githubToken(): string {
  return ['gh', 'p_', '0'.repeat(36)].join('');
}
function gitlabToken(): string {
  return ['gl', 'pat-', '9'.repeat(20)].join('');
}
function googleToken(): string {
  return ['AI', 'za', '8'.repeat(35)].join('');
}
function jwtToken(): string {
  return ['e', 'yJ', 'a'.repeat(12), '.', 'e', 'yJ', 'b'.repeat(12), '.', 'c'.repeat(12)].join('');
}
function apiKeyEqToken(): string {
  return ['api_', 'key=', 's', 'k-live-', 'd'.repeat(20)].join('');
}
function bearerToken(): string {
  return 'Authorization: Bearer ' + jwtToken();
}

describe('hotpath redaction regression (token-laden payloads)', () => {
  let tempHome = '';
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    originalCcsHome = process.env.CCS_HOME;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-redact-'));
    process.env.CCS_HOME = tempHome;
    clearRecentLogEntries();
    invalidateLoggingConfigCache();
    const config = createEmptyUnifiedConfig();
    config.logging = { ...config.logging, enabled: true, level: 'debug', redact: true };
    saveUnifiedConfig(config);
    invalidateLoggingConfigCache();
  });

  afterEach(() => {
    if (originalCcsHome === undefined) delete process.env.CCS_HOME;
    else process.env.CCS_HOME = originalCcsHome;
    fs.rmSync(tempHome, { recursive: true, force: true });
    clearRecentLogEntries();
    invalidateLoggingConfigCache();
  });

  const cases: Array<[string, () => string]> = [
    ['bearer', bearerToken],
    ['anthropic', anthropicToken],
    ['openai', openaiToken],
    ['slack', slackToken],
    ['github', githubToken],
    ['gitlab', gitlabToken],
    ['google', googleToken],
    ['jwt-body', jwtToken],
    ['api_key_eq', apiKeyEqToken],
  ];

  for (const [name, buildToken] of cases) {
    test(`scrubs ${name} token in a context value (under a non-sensitive key)`, () => {
      const token = buildToken();
      const logger = createLogger('test:redaction');
      logger.error('test.token.in.value', `token shape ${name}`, {
        detail: `request failed: ${token}`,
      });
      const entry = getRecentLogEntries().find((e) => e.event === 'test.token.in.value');
      expect(entry).toBeDefined();
      expect(JSON.stringify(entry)).not.toContain(token);
    });
  }

  test('scrubs token embedded in an Error.message passed as err context', () => {
    const token = bearerToken();
    const logger = createLogger('test:redaction');
    const err = new Error(`Auth failed: ${token}`);
    logger.error('test.err.message', 'error carrying token', { err });
    const entry = getRecentLogEntries().find((e) => e.event === 'test.err.message');
    expect(entry).toBeDefined();
    expect(JSON.stringify(entry)).not.toContain(token);
  });

  test('scrubs token embedded in stage options.error metadata', () => {
    const token = anthropicToken();
    const logger = createLogger('test:redaction');
    logger.stage('cleanup', 'test.stage.error', 'structured error carrying token', undefined, {
      level: 'error',
      error: {
        name: 'Error',
        message: `Auth failed: ${token}`,
        stack: `Error: Auth failed: ${token}\n    at test`,
      },
    });
    const entry = getRecentLogEntries().find((e) => e.event === 'test.stage.error');
    expect(entry).toBeDefined();
    expect(JSON.stringify(entry)).not.toContain(token);
  });

  test('scrubs token shapes that leak into the message string (defense-in-depth)', () => {
    const token = anthropicToken();
    const logger = createLogger('test:redaction');
    logger.error('test.message.scrub', `boom ${token} in prose`, {});
    const entry = getRecentLogEntries().find((e) => e.event === 'test.message.scrub');
    expect(entry).toBeDefined();
    expect(entry?.message).not.toContain(token);
  });

  test('preserves non-sensitive prose messages unchanged', () => {
    const logger = createLogger('test:redaction');
    logger.error('test.prose', 'Delegation failed: target adapter not found', {
      provider: 'codex',
    });
    const entry = getRecentLogEntries().find((e) => e.event === 'test.prose');
    expect(entry?.message).toBe('Delegation failed: target adapter not found');
    expect((entry?.context as Record<string, unknown>)?.provider).toBe('codex');
  });
});
