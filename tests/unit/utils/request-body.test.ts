import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import type * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { PassThrough } from 'stream';
import {
  clearRecentLogEntries,
  getRecentLogEntries,
} from '../../../src/services/logging/log-buffer';
import { invalidateLoggingConfigCache } from '../../../src/services/logging/log-config';
import {
  DEFAULT_MAX_BODY_MB,
  MAX_BODY_ENV_VAR,
  readRequestBody,
  RequestBodyTooLargeError,
  resolveMaxBodyBytes,
} from '../../../src/utils/request-body';

const MB = 1024 * 1024;

let tempHome = '';
let originalCcsHome: string | undefined;

beforeEach(() => {
  originalCcsHome = process.env.CCS_HOME;
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-request-body-'));
  process.env.CCS_HOME = tempHome;
  clearRecentLogEntries();
  invalidateLoggingConfigCache();
});

afterEach(() => {
  if (originalCcsHome === undefined) delete process.env.CCS_HOME;
  else process.env.CCS_HOME = originalCcsHome;
  fs.rmSync(tempHome, { recursive: true, force: true });
  clearRecentLogEntries();
  invalidateLoggingConfigCache();
});

function asRequest(stream: PassThrough): http.IncomingMessage {
  return stream as unknown as http.IncomingMessage;
}

/** Write `totalBytes` of 'x' in 64 KiB chunks, then end, yielding between chunks. */
async function writeBody(stream: PassThrough, totalBytes: number): Promise<void> {
  const chunkSize = 64 * 1024;
  let written = 0;
  while (written < totalBytes && !stream.destroyed) {
    const size = Math.min(chunkSize, totalBytes - written);
    stream.write(Buffer.alloc(size, 'x'));
    written += size;
    await new Promise((resolve) => setImmediate(resolve));
  }
  stream.end();
}

function invalidLimitWarnings() {
  return getRecentLogEntries().filter((entry) => entry.event === 'request-body.invalid-limit');
}

describe('resolveMaxBodyBytes', () => {
  it('defaults to the Anthropic Messages API limit of 32 MB', () => {
    expect(DEFAULT_MAX_BODY_MB).toBe(32);
    expect(resolveMaxBodyBytes({})).toBe(32 * MB);
    expect(resolveMaxBodyBytes({ [MAX_BODY_ENV_VAR]: '   ' })).toBe(32 * MB);
  });

  it('accepts whole and fractional MB overrides', () => {
    expect(resolveMaxBodyBytes({ [MAX_BODY_ENV_VAR]: '64' })).toBe(64 * MB);
    expect(resolveMaxBodyBytes({ [MAX_BODY_ENV_VAR]: ' 0.5 ' })).toBe(MB / 2);
    expect(resolveMaxBodyBytes({ [MAX_BODY_ENV_VAR]: '1024' })).toBe(1024 * MB);
  });

  it('falls back to the default and warns once per invalid value', () => {
    for (const value of ['abc-unit', '0', '-4', '1025', '32MB']) {
      expect(resolveMaxBodyBytes({ [MAX_BODY_ENV_VAR]: value })).toBe(32 * MB);
    }
    expect(resolveMaxBodyBytes({ [MAX_BODY_ENV_VAR]: '32MB' })).toBe(32 * MB);

    const warnings = invalidLimitWarnings();
    expect(warnings).toHaveLength(5);
    expect(warnings.every((entry) => entry.level === 'warn')).toBe(true);
    expect(warnings[0].message).toContain(`${MAX_BODY_ENV_VAR}="abc-unit"`);
  });
});

describe('readRequestBody', () => {
  it('resolves bodies at or under the limit as UTF-8', async () => {
    const stream = new PassThrough();
    const pending = readRequestBody(asRequest(stream), 10);
    stream.end(Buffer.from('héllo', 'utf8'));
    expect(await pending).toBe('héllo');

    const exact = new PassThrough();
    const exactPending = readRequestBody(asRequest(exact), 4);
    exact.end('abcd');
    expect(await exactPending).toBe('abcd');
  });

  it('drains an oversized body to the end before rejecting, without destroying it', async () => {
    const stream = new PassThrough({ autoDestroy: false });
    const pending = readRequestBody(asRequest(stream), MB);
    const writing = writeBody(stream, 1.5 * MB);

    const error = await pending.catch((err: unknown) => err);
    await writing;

    expect(error).toBeInstanceOf(RequestBodyTooLargeError);
    const tooLarge = error as RequestBodyTooLargeError;
    expect(tooLarge.drained).toBe(true);
    expect(tooLarge.receivedBytes).toBe(1.5 * MB);
    expect(tooLarge.limitBytes).toBe(MB);
    expect(tooLarge.message).toBe(
      `Request is 1.5 MB, over the 1 MB limit of the local ccs proxy (${MAX_BODY_ENV_VAR}). ` +
        'Run /compact or start a new session.'
    );
    expect(stream.destroyed).toBe(false);
  });

  it('stops draining past 4x the limit and reports the body as not drained', async () => {
    const stream = new PassThrough({ autoDestroy: false });
    const pending = readRequestBody(asRequest(stream), 64 * 1024);
    const writing = writeBody(stream, 2 * MB);

    const error = (await pending.catch((err: unknown) => err)) as RequestBodyTooLargeError;
    await writing;

    expect(error).toBeInstanceOf(RequestBodyTooLargeError);
    expect(error.drained).toBe(false);
    expect(error.receivedBytes).toBeGreaterThan(4 * 64 * 1024);
    expect(error.receivedBytes).toBeLessThan(2 * MB);
    expect(error.message).toStartWith('Request is over ');
    expect(stream.destroyed).toBe(false);
  });

  it('reads the limit from the environment when none is passed', async () => {
    const original = process.env[MAX_BODY_ENV_VAR];
    process.env[MAX_BODY_ENV_VAR] = '1';
    try {
      const stream = new PassThrough();
      const pending = readRequestBody(asRequest(stream));
      const writing = writeBody(stream, MB + 1);
      const error = (await pending.catch((err: unknown) => err)) as RequestBodyTooLargeError;
      await writing;
      expect(error).toBeInstanceOf(RequestBodyTooLargeError);
      expect(error.limitBytes).toBe(MB);
    } finally {
      if (original === undefined) delete process.env[MAX_BODY_ENV_VAR];
      else process.env[MAX_BODY_ENV_VAR] = original;
    }
  });

  it('rejects on stream errors and early close', async () => {
    const errored = new PassThrough();
    const erroredPending = readRequestBody(asRequest(errored), MB);
    errored.destroy(new Error('socket hang up'));
    await expect(erroredPending).rejects.toThrow('socket hang up');

    const closed = new PassThrough();
    const closedPending = readRequestBody(asRequest(closed), MB);
    closed.write('partial');
    closed.destroy();
    await expect(closedPending).rejects.toThrow(
      'Request closed before the body was fully received'
    );
  });
});
