import { describe, expect, it } from 'vitest';
import type { LogsEntry } from '@/lib/api-client';
import {
  deriveStageHint,
  deriveTraceGroups,
  type LeafItem,
} from '@/components/logs/derive-trace-groups';
import type { TraceGroup } from '@/components/logs/logs-trace-row';

// Minimal LogsEntry factory — fields the helpers actually look at.
function entry(overrides: Partial<LogsEntry> & Pick<LogsEntry, 'id' | 'timestamp'>): LogsEntry {
  return {
    level: 'info',
    source: 'web-server:http',
    event: 'event.default',
    message: 'default message',
    ...overrides,
  } as LogsEntry;
}

function leafEntries(
  ...overrides: Array<Partial<LogsEntry> & Pick<LogsEntry, 'id' | 'timestamp'>>
) {
  return overrides.map(entry);
}

describe('deriveStageHint', () => {
  it('returns explicit stage when present', () => {
    expect(deriveStageHint(entry({ id: '1', timestamp: 't', stage: 'route' }))).toBe('route');
  });

  it('falls back to last `.`-segment of event when stage is missing', () => {
    expect(deriveStageHint(entry({ id: '1', timestamp: 't', event: 'request.dispatched' }))).toBe(
      'dispatched'
    );
  });

  it('caps the derived hint at 12 chars', () => {
    expect(
      deriveStageHint(entry({ id: '1', timestamp: 't', event: 'foo.absurdlylongsegmentname' }))
    ).toBe('absurdlylong');
  });

  it('returns undefined when neither stage nor event is meaningful', () => {
    expect(deriveStageHint(entry({ id: '1', timestamp: 't', event: '' }))).toBeUndefined();
  });

  it('treats single-segment event as its own hint', () => {
    expect(deriveStageHint(entry({ id: '1', timestamp: 't', event: 'startup' }))).toBe('startup');
  });
});

describe('deriveTraceGroups', () => {
  it('returns empty array for empty input', () => {
    expect(deriveTraceGroups([])).toEqual([]);
  });

  it('emits a single leaf for a no-requestId entry', () => {
    const e = entry({ id: '1', timestamp: '2026-01-01T00:00:00Z' });
    const result = deriveTraceGroups([e]);
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe('leaf');
    expect((result[0] as LeafItem).entry).toBe(e);
    expect((result[0] as LeafItem).repeatCount).toBeUndefined();
  });

  it('groups entries sharing a requestId into one trace', () => {
    const result = deriveTraceGroups(
      leafEntries(
        { id: '1', timestamp: '2026-01-01T00:00:01Z', requestId: 'req-1', stage: 'intake' },
        { id: '2', timestamp: '2026-01-01T00:00:02Z', requestId: 'req-1', stage: 'route' }
      )
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe('trace');
    expect((result[0] as TraceGroup).children).toHaveLength(2);
  });

  it('sorts trace children by ts ascending and pins group ts to oldest child', () => {
    // Input order intentionally reverses ts so we can assert the sort.
    const result = deriveTraceGroups(
      leafEntries(
        { id: '2', timestamp: '2026-01-01T00:00:02Z', requestId: 'req-1' },
        { id: '1', timestamp: '2026-01-01T00:00:01Z', requestId: 'req-1' }
      )
    );
    const trace = result[0] as TraceGroup;
    expect(trace.children.map((c) => c.id)).toEqual(['1', '2']);
    expect(trace.ts).toBe('2026-01-01T00:00:01Z');
  });

  it('coalesces two adjacent identical leaves into a single ×N row', () => {
    const result = deriveTraceGroups(
      leafEntries(
        { id: '1', timestamp: 't1', event: 'poll', message: 'tick' },
        { id: '2', timestamp: 't2', event: 'poll', message: 'tick' }
      )
    );
    expect(result).toHaveLength(1);
    const leaf = result[0] as LeafItem;
    expect(leaf.repeatCount).toBe(2);
    expect(leaf.collapsedRange?.fromTs).toBe('t1');
    expect(leaf.collapsedRange?.toTs).toBe('t2');
  });

  it('does NOT coalesce identical leaves split by an unrelated trace (round-3 fix)', () => {
    // Two identical no-requestId entries with a trace between them: the run
    // must break — they were not adjacent in the real stream.
    const result = deriveTraceGroups(
      leafEntries(
        { id: '1', timestamp: 't1', event: 'poll', message: 'tick' },
        { id: '2', timestamp: 't2', requestId: 'req-1' },
        { id: '3', timestamp: 't3', event: 'poll', message: 'tick' }
      )
    );
    // Expected: 1 trace + 2 distinct leaves (no ×N).
    const leaves = result.filter((r) => r.kind === 'leaf') as LeafItem[];
    expect(leaves).toHaveLength(2);
    expect(leaves.every((l) => l.repeatCount === undefined)).toBe(true);
  });

  it('keeps adjacent leaves with different stages as separate rows (round-6 fix)', () => {
    const result = deriveTraceGroups(
      leafEntries(
        { id: '1', timestamp: 't1', event: 'e', message: 'm', stage: 'route' },
        { id: '2', timestamp: 't2', event: 'e', message: 'm', stage: 'dispatch' }
      )
    );
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.kind === 'leaf' && r.repeatCount === undefined)).toBe(true);
  });

  it('keeps adjacent leaves with different messages as separate rows', () => {
    const result = deriveTraceGroups(
      leafEntries(
        { id: '1', timestamp: 't1', event: 'login', message: 'alice' },
        { id: '2', timestamp: 't2', event: 'login', message: 'bob' }
      )
    );
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.kind === 'leaf' && r.repeatCount === undefined)).toBe(true);
  });

  it('keeps adjacent leaves with different detail payloads as separate rows', () => {
    const result = deriveTraceGroups(
      leafEntries(
        {
          id: '1',
          timestamp: 't1',
          event: 'poll',
          message: 'same',
          latencyMs: 25,
          metadata: { attempt: 1, nested: { status: 'warm' } },
          context: { account: 'alpha' },
          error: { code: 'E_ONE', message: 'first' },
        },
        {
          id: '2',
          timestamp: 't2',
          event: 'poll',
          message: 'same',
          latencyMs: 50,
          metadata: { attempt: 2, nested: { status: 'cold' } },
          context: { account: 'beta' },
          error: { code: 'E_TWO', message: 'second' },
        }
      )
    );

    expect(result).toHaveLength(2);
    expect(result.every((r) => r.kind === 'leaf' && r.repeatCount === undefined)).toBe(true);
    expect(result.map((r) => (r.kind === 'leaf' ? r.entry.id : 'trace'))).toEqual(['2', '1']);
  });

  it('coalesces leaves with semantically identical structured payloads', () => {
    const result = deriveTraceGroups(
      leafEntries(
        {
          id: '1',
          timestamp: 't1',
          event: 'poll',
          message: 'tick',
          latencyMs: 25,
          metadata: { b: 2, a: 1 },
          context: { nested: { b: false, a: true } },
        },
        {
          id: '2',
          timestamp: 't2',
          event: 'poll',
          message: 'tick',
          latencyMs: 25,
          metadata: { a: 1, b: 2 },
          context: { nested: { a: true, b: false } },
        }
      )
    );

    expect(result).toHaveLength(1);
    expect((result[0] as LeafItem).repeatCount).toBe(2);
  });

  it('display-sorts items reverse-chronologically', () => {
    // Use distinct events so leaves don't coalesce — testing display sort,
    // not coalesce.
    const result = deriveTraceGroups(
      leafEntries(
        { id: '1', timestamp: '2026-01-01T00:00:01Z', event: 'a' },
        { id: '2', timestamp: '2026-01-01T00:00:03Z', event: 'b' },
        { id: '3', timestamp: '2026-01-01T00:00:02Z', event: 'c' }
      )
    );
    const ids = result.map((r) => (r.kind === 'leaf' ? r.entry.id : 'trace'));
    expect(ids).toEqual(['2', '3', '1']);
  });

  it('computes max level across trace children', () => {
    const result = deriveTraceGroups(
      leafEntries(
        { id: '1', timestamp: 't1', requestId: 'r', level: 'debug' },
        { id: '2', timestamp: 't2', requestId: 'r', level: 'error' },
        { id: '3', timestamp: 't3', requestId: 'r', level: 'info' }
      )
    );
    expect((result[0] as TraceGroup).maxLevel).toBe('error');
  });

  it('sums latencyMs across trace children', () => {
    const result = deriveTraceGroups(
      leafEntries(
        { id: '1', timestamp: 't1', requestId: 'r', latencyMs: 100 },
        { id: '2', timestamp: 't2', requestId: 'r', latencyMs: 50 },
        { id: '3', timestamp: 't3', requestId: 'r' /* no latency */ }
      )
    );
    expect((result[0] as TraceGroup).totalLatencyMs).toBe(150);
  });

  it('preserves original input order when computing leaf adjacency, even if display sort reorders later', () => {
    // Stream: [A, B, A] — A entries identical but split by B. A run of 1+1+1.
    const result = deriveTraceGroups(
      leafEntries(
        { id: '1', timestamp: '2026-01-01T00:00:01Z', event: 'A' },
        { id: '2', timestamp: '2026-01-01T00:00:02Z', event: 'B' },
        { id: '3', timestamp: '2026-01-01T00:00:03Z', event: 'A' }
      )
    );
    const leaves = result.filter((r) => r.kind === 'leaf') as LeafItem[];
    expect(leaves).toHaveLength(3);
    // None should have repeatCount because A and A weren't adjacent.
    expect(leaves.every((l) => l.repeatCount === undefined)).toBe(true);
  });
});
