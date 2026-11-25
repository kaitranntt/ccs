import { describe, expect, it } from 'bun:test';
import {
  getRequestContext,
  getRequestId,
  mergeRequestContext,
  runWithRequestId,
  withRequestContext,
} from '../../../../src/services/logging/log-context';

describe('log-context (AsyncLocalStorage)', () => {
  it('returns undefined outside any context', () => {
    expect(getRequestContext()).toBeUndefined();
    expect(getRequestId()).toBeUndefined();
  });

  it('exposes the active context inside withRequestContext', () => {
    withRequestContext({ requestId: 'req-1', method: 'POST' }, () => {
      const ctx = getRequestContext();
      expect(ctx?.requestId).toBe('req-1');
      expect(ctx?.method).toBe('POST');
      expect(getRequestId()).toBe('req-1');
    });
    expect(getRequestContext()).toBeUndefined();
  });

  it('isolates parallel async tasks (no cross-leak)', async () => {
    const observed: string[] = [];

    await Promise.all([
      withRequestContext({ requestId: 'req-A' }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        observed.push(`A:${getRequestId()}`);
      }),
      withRequestContext({ requestId: 'req-B' }, async () => {
        await new Promise((r) => setTimeout(r, 1));
        observed.push(`B:${getRequestId()}`);
      }),
    ]);

    expect(observed.sort()).toEqual(['A:req-A', 'B:req-B']);
  });

  it('runWithRequestId mints a UUID and exposes it inside fn', () => {
    let captured: string | undefined;
    const { requestId, result } = runWithRequestId(() => {
      captured = getRequestId();
      return 42;
    });
    expect(result).toBe(42);
    expect(captured).toBe(requestId);
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('mergeRequestContext returns input unchanged outside ALS', () => {
    const merged = mergeRequestContext({ foo: 'bar' });
    expect(merged).toEqual({ foo: 'bar' });
  });

  it('mergeRequestContext merges active context, with input overriding ctx', () => {
    withRequestContext({ requestId: 'req-X', method: 'GET' }, () => {
      const merged = mergeRequestContext({ method: 'POST', extra: 1 });
      expect<Record<string, unknown>>(merged).toEqual({
        requestId: 'req-X',
        method: 'POST',
        extra: 1,
      });
    });
  });

  it('preserves emit-time ordering within a single requestId', async () => {
    const order: number[] = [];
    await withRequestContext({ requestId: 'req-order' }, async () => {
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
        order.push(i);
      }
    });
    expect(order).toEqual([0, 1, 2, 3, 4]);
  });
});
