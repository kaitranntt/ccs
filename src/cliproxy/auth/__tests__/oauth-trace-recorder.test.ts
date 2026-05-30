import { describe, expect, test } from 'bun:test';
import { createOAuthTraceRecorder } from '../oauth-trace/trace-recorder';
import { OAuthTracePhase } from '../oauth-trace/trace-events';
import { REDACTED_PLACEHOLDER } from '../oauth-trace/redactor';

function makeRecorder(verbose = false, lines: string[] = []) {
  let t = 1000;
  const rec = createOAuthTraceRecorder({
    sessionId: 'sess-1',
    provider: 'codex',
    verbose,
    now: () => t,
    verboseOut: (line) => lines.push(line),
  });
  return {
    rec,
    advance(ms: number) {
      t += ms;
    },
  };
}

describe('createOAuthTraceRecorder', () => {
  test('records event with sessionId and provider correlation', () => {
    const { rec } = makeRecorder();
    rec.record(OAuthTracePhase.BinarySpawn);
    const snap = rec.snapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0].sessionId).toBe('sess-1');
    expect(snap[0].provider).toBe('codex');
    expect(snap[0].phase).toBe(OAuthTracePhase.BinarySpawn);
  });

  test('phase ordering preserved with monotonic elapsedMs', () => {
    const { rec, advance } = makeRecorder();
    rec.record(OAuthTracePhase.PreflightOk);
    advance(10);
    rec.record(OAuthTracePhase.BinarySpawn);
    advance(50);
    rec.record(OAuthTracePhase.AuthUrlDisplayed);
    const snap = rec.snapshot();
    expect(snap.map((e) => e.phase)).toEqual([
      OAuthTracePhase.PreflightOk,
      OAuthTracePhase.BinarySpawn,
      OAuthTracePhase.AuthUrlDisplayed,
    ]);
    expect(snap[0].elapsedMs).toBe(0);
    expect(snap[1].elapsedMs).toBe(10);
    expect(snap[2].elapsedMs).toBe(60);
  });

  test('memory sink returns full event log via snapshot()', () => {
    const { rec } = makeRecorder();
    for (let i = 0; i < 5; i++) {
      rec.record(OAuthTracePhase.BinaryStdout, { i });
    }
    expect(rec.snapshot()).toHaveLength(5);
  });

  test('verbose sink writes only when verbose=true', () => {
    const linesOff: string[] = [];
    const { rec: off } = makeRecorder(false, linesOff);
    off.record(OAuthTracePhase.BinarySpawn);
    expect(linesOff).toHaveLength(0);

    const linesOn: string[] = [];
    const { rec: on } = makeRecorder(true, linesOn);
    on.record(OAuthTracePhase.BinarySpawn, { port: 1455 });
    expect(linesOn).toHaveLength(1);
    expect(linesOn[0]).toMatch(/^\[oauth-trace\] \+0ms binary\.spawn/);
    expect(linesOn[0]).toContain('port=1455');
  });

  test('summary returns counts and lastPhase', () => {
    const { rec, advance } = makeRecorder();
    rec.record(OAuthTracePhase.BinaryStdout);
    rec.record(OAuthTracePhase.BinaryStdout);
    advance(5);
    rec.record(OAuthTracePhase.BinaryExit);
    const s = rec.summary();
    expect(s.phaseCounts[OAuthTracePhase.BinaryStdout]).toBe(2);
    expect(s.phaseCounts[OAuthTracePhase.BinaryExit]).toBe(1);
    expect(s.lastPhase).toBe(OAuthTracePhase.BinaryExit);
    expect(s.totalMs).toBe(5);
  });

  test('snapshot during in-flight events does not throw and returns copy', () => {
    const { rec } = makeRecorder();
    rec.record(OAuthTracePhase.BinarySpawn);
    const snap = rec.snapshot();
    rec.record(OAuthTracePhase.BinaryExit);
    expect(snap).toHaveLength(1); // earlier snapshot unaffected
    expect(rec.snapshot()).toHaveLength(2);
  });

  test('redactor invoked: raw OAuth params do not reach sinks', () => {
    const lines: string[] = [];
    const { rec } = makeRecorder(true, lines);
    rec.record(OAuthTracePhase.AuthUrlDisplayed, {
      url: 'https://example.com/auth?code=AUTHCODE_SECRET&state=ST',
      access_token: 'AT_LEAK',
    });
    const snap = rec.snapshot();
    const blob = JSON.stringify(snap) + '\n' + lines.join('\n');
    expect(blob).not.toContain('AUTHCODE_SECRET');
    expect(blob).not.toContain('AT_LEAK');
    expect(blob).toContain(REDACTED_PLACEHOLDER);
  });

  test('flush() resolves even with no file sink', async () => {
    const { rec } = makeRecorder();
    rec.record(OAuthTracePhase.BinaryExit);
    await expect(rec.flush()).resolves.toBeUndefined();
  });

  test('error param surfaces as event.error', () => {
    const { rec } = makeRecorder();
    rec.record(OAuthTracePhase.Error, { branch: 'X' }, { code: 'E1', message: 'boom' });
    const snap = rec.snapshot();
    expect(snap[0].error).toEqual({ code: 'E1', message: 'boom' });
  });

  test('redacts OAuth secrets from error messages before they reach sinks', () => {
    const lines: string[] = [];
    const { rec } = makeRecorder(true, lines);
    rec.record(OAuthTracePhase.Error, undefined, {
      code: 'CALLBACK_REJECTED',
      message:
        'bad redirect http://localhost:1455/callback?code=AUTHCODE_SECRET&state=STATE_SECRET',
    });

    const blob = JSON.stringify(rec.snapshot()) + '\n' + lines.join('\n');
    expect(blob).not.toContain('AUTHCODE_SECRET');
    expect(blob).not.toContain('STATE_SECRET');
    expect(blob).toContain(REDACTED_PLACEHOLDER);
  });

  test('Error instance accepted and redacted', () => {
    const { rec } = makeRecorder();
    rec.record(
      OAuthTracePhase.Error,
      undefined,
      new Error('bad redirect http://localhost:1455/callback?code=AUTHCODE_SECRET')
    );
    expect(rec.snapshot()[0].error?.message).toContain(REDACTED_PLACEHOLDER);
    expect(rec.snapshot()[0].error?.message).not.toContain('AUTHCODE_SECRET');
  });
});
