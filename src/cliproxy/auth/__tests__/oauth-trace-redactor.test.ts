import { describe, expect, test } from 'bun:test';
import {
  redactString,
  redactUrl,
  redactJsonShallow,
  redactBearer,
  REDACTED_PLACEHOLDER,
} from '../oauth-trace/redactor';
import { createMemorySink, MEMORY_SINK_MAX_EVENTS } from '../oauth-trace/sink-memory';

describe('redactString', () => {
  test('redacts code= query value', () => {
    const out = redactString('http://localhost:1455/cb?code=AUTHCODE_SECRET&foo=bar');
    expect(out).not.toContain('AUTHCODE_SECRET');
    expect(out).toContain(`code=${REDACTED_PLACEHOLDER}`);
    expect(out).toContain('foo=bar');
  });

  test('redacts state= query value', () => {
    const out = redactString('?state=STATE_SECRET&x=1');
    expect(out).not.toContain('STATE_SECRET');
    expect(out).toContain(`state=${REDACTED_PLACEHOLDER}`);
  });

  test('redacts access_token, refresh_token, id_token query values', () => {
    const s = '?access_token=A&refresh_token=B&id_token=C';
    const out = redactString(s);
    expect(out).not.toContain('access_token=A');
    expect(out).not.toContain('refresh_token=B');
    expect(out).not.toContain('id_token=C');
  });

  test('redacts bearer header value', () => {
    expect(redactString('Authorization: Bearer abc.def.ghi')).toContain(
      `Bearer ${REDACTED_PLACEHOLDER}`
    );
  });

  test('preserves non-sensitive params and host/path', () => {
    const out = redactString('https://example.com/auth/cb?code=X&client_id=public');
    expect(out).toContain('example.com');
    expect(out).toContain('/auth/cb');
    expect(out).toContain('client_id=public');
  });

  test('idempotent: redacting twice == once', () => {
    const once = redactString('?code=X&state=Y');
    expect(redactString(once)).toBe(once);
  });

  test('empty input passthrough', () => {
    expect(redactString('')).toBe('');
  });

  test('redacts JSON-style token payloads in plain strings', () => {
    const out = redactString(
      '{"access_token":"AT_SECRET","refresh_token":"RT_SECRET","token":"TOKEN_SECRET"}'
    );
    expect(out).not.toContain('AT_SECRET');
    expect(out).not.toContain('RT_SECRET');
    expect(out).not.toContain('TOKEN_SECRET');
    expect(out).toContain(REDACTED_PLACEHOLDER);
  });

  test('preserves JSON-style separator spacing while redacting token payloads', () => {
    const out = redactString('{"access_token" : "AT_SECRET"}');
    expect(out).not.toContain('AT_SECRET');
    expect(out).toContain(`"access_token" : "${REDACTED_PLACEHOLDER}"`);
  });

  test('redacts line-leading key/value formats', () => {
    const out = redactString(
      'access_token=AT_SECRET refresh_token=RT_SECRET client_secret: CS_SECRET'
    );
    expect(out).not.toContain('AT_SECRET');
    expect(out).not.toContain('RT_SECRET');
    expect(out).not.toContain('CS_SECRET');
    expect(out).toContain(`access_token=${REDACTED_PLACEHOLDER}`);
    expect(out).toContain(`refresh_token=${REDACTED_PLACEHOLDER}`);
    expect(out).toContain(`client_secret: ${REDACTED_PLACEHOLDER}`);
  });

  test('preserves URL-style suffixes in line-leading key/value snippets', () => {
    const out = redactString('access_token=AT_SECRET&keep=1');
    expect(out).not.toContain('AT_SECRET');
    expect(out).toBe(`access_token=${REDACTED_PLACEHOLDER}&keep=1`);
  });

  test('redacts ampersand-delimited generic token query params', () => {
    const out = redactString('access_token=AT_SECRET&token=TOKEN_SECRET');
    expect(out).not.toContain('AT_SECRET');
    expect(out).not.toContain('TOKEN_SECRET');
    expect(out).toBe(`access_token=${REDACTED_PLACEHOLDER}&token=${REDACTED_PLACEHOLDER}`);
  });
});

describe('redactUrl', () => {
  test('redacts known sensitive params via URL parser', () => {
    const out = redactUrl('https://example.com/cb?code=AUTHCODE&state=ST&keep=1');
    expect(out).toContain(`code=${encodeURIComponent(REDACTED_PLACEHOLDER)}`);
    expect(out).toContain(`state=${encodeURIComponent(REDACTED_PLACEHOLDER)}`);
    expect(out).toContain('keep=1');
    expect(out).not.toContain('AUTHCODE');
  });

  test('falls back gracefully on invalid URL', () => {
    expect(redactUrl('not a url ?code=X')).toContain(REDACTED_PLACEHOLDER);
  });
});

describe('redactJsonShallow', () => {
  test('replaces sensitive top-level keys', () => {
    const out = redactJsonShallow({
      access_token: 'AT',
      refresh_token: 'RT',
      id_token: 'IT',
      client_secret: 'CS',
      keep: 'visible',
    });
    expect(out['access_token']).toBe(REDACTED_PLACEHOLDER);
    expect(out['refresh_token']).toBe(REDACTED_PLACEHOLDER);
    expect(out['id_token']).toBe(REDACTED_PLACEHOLDER);
    expect(out['client_secret']).toBe(REDACTED_PLACEHOLDER);
    expect(out['keep']).toBe('visible');
  });

  test('redacts string values for sensitive params inside string fields', () => {
    const out = redactJsonShallow({ url: 'https://x/cb?code=SECRET' });
    expect(String(out['url'])).not.toContain('SECRET');
  });

  test('recurses into nested plain objects', () => {
    const out = redactJsonShallow({
      headers: { Authorization: 'Bearer XYZ', host: 'a' },
    });
    const headers = out['headers'] as Record<string, unknown>;
    expect(headers['Authorization']).toBe(REDACTED_PLACEHOLDER);
    expect(headers['host']).toBe('a');
  });

  test('case-insensitive key match', () => {
    const out = redactJsonShallow({ Access_Token: 'X', AUTHORIZATION: 'Y' });
    expect(out['Access_Token']).toBe(REDACTED_PLACEHOLDER);
    expect(out['AUTHORIZATION']).toBe(REDACTED_PLACEHOLDER);
  });
});

describe('redactBearer', () => {
  test('replaces bearer value preserving prefix', () => {
    expect(redactBearer('Bearer abc.def.ghi')).toBe(`Bearer ${REDACTED_PLACEHOLDER}`);
  });
});

// ---- adversarial / edge-case coverage (findings #1-3, #4, #7) ----

describe('redactUrl — fragment leak (finding #1)', () => {
  test('redacts code in fragment — first param after #', () => {
    const out = redactUrl('https://x/cb#code=SECRET&state=X');
    expect(out).not.toContain('SECRET');
    expect(out).not.toContain('state=X');
  });

  test('redacts access_token in fragment', () => {
    const out = redactUrl('https://x/cb#access_token=AT&token_type=bearer');
    expect(out).not.toContain('AT');
    expect(out).toContain('token_type=bearer');
  });

  test('non-sensitive fragment params preserved', () => {
    const out = redactUrl('https://x/cb#section=1&code=S');
    expect(out).toContain('section=1');
    expect(out).not.toContain('=S');
  });

  test('Google OAuth fragment flow (real shape)', () => {
    const url =
      'https://accounts.google.com/o/oauth2/auth/oauthchooseaccount#access_token=ya29.secret&token_type=Bearer&expires_in=3599';
    const out = redactUrl(url);
    expect(out).not.toContain('ya29.secret');
    expect(out).toContain('token_type=Bearer');
  });
});

describe('redactUrl — URL-encoded key bypass (finding #2)', () => {
  test('redacts %63%6F%64%65 (= "code") key', () => {
    // %63%6F%64%65 is "code" percent-encoded
    const out = redactUrl('https://x/cb?%63%6F%64%65=SECRET');
    expect(out).not.toContain('SECRET');
  });

  test('redacts %73%74%61%74%65 (= "state") key', () => {
    const out = redactUrl('https://x/cb?%73%74%61%74%65=STATEVAL');
    expect(out).not.toContain('STATEVAL');
  });
});

describe('redactJsonShallow — array passthrough (finding #3)', () => {
  test('redacts access_token inside array of objects', () => {
    const out = redactJsonShallow({ tokens: [{ access_token: 'AT', scope: 'read' }] });
    const tokens = out['tokens'] as Array<Record<string, unknown>>;
    expect(tokens[0]['access_token']).toBe(REDACTED_PLACEHOLDER);
    expect(tokens[0]['scope']).toBe('read');
  });

  test('nested arrays of token objects', () => {
    const out = redactJsonShallow({
      batches: [{ tokens: [{ refresh_token: 'RT' }] }],
    });
    const batches = out['batches'] as Array<Record<string, unknown>>;
    const inner = (batches[0]['tokens'] as Array<Record<string, unknown>>)[0];
    // Only one level of array recursion; inner object is recursed as plain obj
    expect(inner['refresh_token']).toBe(REDACTED_PLACEHOLDER);
  });

  test('mixed-case key Code redacted', () => {
    const out = redactJsonShallow({ Code: 'abc', CODE: 'xyz' });
    expect(out['Code']).toBe(REDACTED_PLACEHOLDER);
    expect(out['CODE']).toBe(REDACTED_PLACEHOLDER);
  });

  test('string value with url-embedded code is redacted', () => {
    const out = redactJsonShallow({ log: 'callback?code=SECRET&state=ST' });
    expect(String(out['log'])).not.toContain('SECRET');
  });
});

describe('PKCE / device-flow keys (finding #4)', () => {
  test('redactUrl redacts code_verifier', () => {
    const out = redactUrl('https://x/token?code_verifier=VERIFIER&grant_type=pkce');
    expect(out).not.toContain('VERIFIER');
    expect(out).toContain('grant_type=pkce');
  });

  test('redactUrl redacts device_code', () => {
    const out = redactUrl('https://x/token?device_code=DC123');
    expect(out).not.toContain('DC123');
  });

  test('redactUrl redacts assertion', () => {
    const out = redactUrl('https://x/token?assertion=JWT_VAL');
    expect(out).not.toContain('JWT_VAL');
  });

  test('redactUrl redacts subject_token', () => {
    const out = redactUrl('https://x/token?subject_token=ST_VAL');
    expect(out).not.toContain('ST_VAL');
  });

  test('redactString redacts code_verifier in raw string', () => {
    const out = redactString('?code_verifier=MY_VERIFIER&other=1');
    expect(out).not.toContain('MY_VERIFIER');
    expect(out).toContain('other=1');
  });
});

describe('createMemorySink — bounded ring buffer (finding #6)', () => {
  test('default capacity is MEMORY_SINK_MAX_EVENTS (1000)', () => {
    expect(MEMORY_SINK_MAX_EVENTS).toBe(1000);
  });

  test('older events dropped when capacity exceeded', () => {
    const sink = createMemorySink(3);
    const makeEvent = (i: number) =>
      ({
        sessionId: 's',
        provider: 'p',
        phase: `phase.${i}` as never,
        ts: i,
        elapsedMs: i,
      }) as never;

    sink.write(makeEvent(1));
    sink.write(makeEvent(2));
    sink.write(makeEvent(3));
    sink.write(makeEvent(4)); // should drop event 1

    const snap = sink.snapshot();
    expect(snap).toHaveLength(3);
    expect(snap[0].ts).toBe(2);
    expect(snap[2].ts).toBe(4);
  });

  test('droppedCount tracks number of dropped events', () => {
    const sink = createMemorySink(2);
    const makeEvent = (i: number) =>
      ({
        sessionId: 's',
        provider: 'p',
        phase: 'p' as never,
        ts: i,
        elapsedMs: i,
      }) as never;

    sink.write(makeEvent(1));
    sink.write(makeEvent(2));
    expect(sink.droppedCount()).toBe(0);
    sink.write(makeEvent(3));
    expect(sink.droppedCount()).toBe(1);
    sink.write(makeEvent(4));
    expect(sink.droppedCount()).toBe(2);
  });

  test('snapshot returns copy — mutations do not affect buffer', () => {
    const sink = createMemorySink(5);
    const ev = { sessionId: 's', provider: 'p', phase: 'x' as never, ts: 1, elapsedMs: 0 };
    sink.write(ev as never);
    const snap = sink.snapshot();
    snap.pop();
    expect(sink.snapshot()).toHaveLength(1);
  });
});
