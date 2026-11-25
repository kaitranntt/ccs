import { describe, it, expect, mock, spyOn } from 'bun:test';
import { withRetry, type RetryOptions } from '../retry-strategy';
import { CCSError, RetryableError } from '../../errors/error-types';

describe('withRetry', () => {
  it('returns the result on first success', async () => {
    const fn = mock(() => Promise.resolve(42));
    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10 });
    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on RetryableError and succeeds', async () => {
    let attempt = 0;
    const fn = mock(() => {
      attempt++;
      if (attempt < 3) {
        return Promise.reject(new RetryableError('transient failure'));
      }
      return Promise.resolve('ok');
    });

    const result = await withRetry(fn, { maxRetries: 5, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('uses the default retryability check when retryableCheck is null at runtime', async () => {
    let attempt = 0;
    const fn = mock(() => {
      attempt++;
      if (attempt < 2) {
        return Promise.reject(new RetryableError('transient failure'));
      }
      return Promise.resolve('ok');
    });

    const result = await withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 1,
      retryableCheck: null,
    } as unknown as RetryOptions);

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after max retries exhausted', async () => {
    const fn = mock(() => Promise.reject(new RetryableError('always fails')));
    await expect(withRetry(fn, { maxRetries: 2, baseDelayMs: 1 })).rejects.toThrow('always fails');
    // 1 initial + 2 retries = 3 total calls
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-retryable errors', async () => {
    const fn = mock(() => Promise.reject(new Error('fatal')));
    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 1 })).rejects.toThrow('fatal');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry CCSErrors with recoverable=false', async () => {
    const fn = mock(() => Promise.reject(new CCSError('non-retryable', 1, false)));
    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 1 })).rejects.toThrow('non-retryable');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('uses custom retryableCheck when provided', async () => {
    let attempt = 0;
    const fn = mock(() => {
      attempt++;
      if (attempt < 2) {
        return Promise.reject(new Error('custom-retry'));
      }
      return Promise.resolve('recovered');
    });

    const customCheck = (error: unknown) =>
      error instanceof Error && error.message === 'custom-retry';

    const result = await withRetry(fn, {
      maxRetries: 5,
      baseDelayMs: 1,
      retryableCheck: customCheck,
    });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('calls onRetry callback on each retry attempt', async () => {
    const onRetry = mock((_error: Error, _attempt: number) => {});
    const fn = mock(() => Promise.reject(new RetryableError('fail')));

    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 1, onRetry })).rejects.toThrow('fail');

    // 1 initial + 3 retries = 3 onRetry calls (not called for initial)
    expect(onRetry).toHaveBeenCalledTimes(3);
    // First retry call
    expect(onRetry.mock.calls[0][1]).toBe(1);
  });

  it('respects maxDelayMs cap', async () => {
    const sleepSpy = spyOn(globalThis, 'setTimeout');
    let attempt = 0;
    const fn = mock(() => {
      attempt++;
      if (attempt <= 2) {
        return Promise.reject(new RetryableError('fail'));
      }
      return Promise.resolve('ok');
    });

    await withRetry(fn, {
      maxRetries: 5,
      baseDelayMs: 1000,
      maxDelayMs: 200,
    });

    // Verify setTimeout was called with delay <= maxDelayMs (200ms)
    // Jitter is capped, so delay must never exceed 200ms
    for (const call of sleepSpy.mock.calls) {
      const delay = call[1] as number;
      expect(delay).toBeLessThanOrEqual(200);
    }
    sleepSpy.mockRestore();
  });

  it('uses default backoffMultiplier when not specified', async () => {
    let attempt = 0;
    const fn = mock(() => {
      attempt++;
      if (attempt < 2) {
        return Promise.reject(new RetryableError('fail'));
      }
      return Promise.resolve('ok');
    });

    // Should not throw - defaults to multiplier of 2
    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 1 })).resolves.toBe('ok');
  });

  it('applies exponential backoff with custom multiplier', async () => {
    const sleepSpy = spyOn(globalThis, 'setTimeout');
    let attempt = 0;
    const fn = mock(() => {
      attempt++;
      if (attempt <= 3) {
        return Promise.reject(new RetryableError('fail'));
      }
      return Promise.resolve('ok');
    });

    await withRetry(fn, {
      maxRetries: 5,
      baseDelayMs: 10,
      backoffMultiplier: 3,
    });

    // Delays should grow: ~10, ~30, ~90 (with jitter)
    const delays = sleepSpy.mock.calls.map((call) => call[1] as number);
    // First delay should be close to base * multiplier^0 = 10
    expect(delays[0]).toBeGreaterThan(5);
    expect(delays[0]).toBeLessThan(25); // 10 + jitter
    // Second delay should be close to base * multiplier^1 = 30
    expect(delays[1]).toBeGreaterThan(20);
    expect(delays[1]).toBeLessThan(50); // 30 + jitter

    sleepSpy.mockRestore();
  });

  it('passes through errors that are not Error instances', async () => {
    const fn = mock(() => Promise.reject('string error'));
    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 1 })).rejects.toBe('string error');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('works with maxRetries of 0 (no retries)', async () => {
    const fn = mock(() => Promise.reject(new RetryableError('fail')));
    await expect(withRetry(fn, { maxRetries: 0, baseDelayMs: 1 })).rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws on negative maxRetries', async () => {
    const fn = mock(() => Promise.resolve('ok'));
    await expect(withRetry(fn, { maxRetries: -1, baseDelayMs: 1 })).rejects.toThrow(
      'maxRetries must be >= 0'
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it('respects retryAfter from RetryableError', async () => {
    const sleepSpy = spyOn(globalThis, 'setTimeout');
    let attempt = 0;
    const fn = mock(() => {
      attempt++;
      if (attempt < 2) {
        return Promise.reject(new RetryableError('rate limited', undefined, 500));
      }
      return Promise.resolve('ok');
    });

    await withRetry(fn, { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 1000 });
    // retryAfter=500 should override the computed backoff (~10ms) since 500 > 10
    const delay = sleepSpy.mock.calls[0][1] as number;
    expect(delay).toBeGreaterThanOrEqual(500);
    sleepSpy.mockRestore();
  });

  it('swallows onRetry callback errors and continues retrying', async () => {
    let attempt = 0;
    const fn = mock(() => {
      attempt++;
      if (attempt < 3) {
        return Promise.reject(new RetryableError('fail'));
      }
      return Promise.resolve('ok');
    });
    const onRetry = mock(() => {
      throw new Error('callback blew up');
    });

    const result = await withRetry(fn, { maxRetries: 5, baseDelayMs: 1, onRetry });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('throws on negative baseDelayMs', async () => {
    const fn = mock(() => Promise.resolve('ok'));
    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: -1 })).rejects.toThrow(
      'baseDelayMs must be >= 0'
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it('retryAfter can exceed maxDelayMs (server directive wins)', async () => {
    const sleepSpy = spyOn(globalThis, 'setTimeout');
    let attempt = 0;
    const fn = mock(() => {
      attempt++;
      if (attempt < 2) {
        return Promise.reject(new RetryableError('rate limited', undefined, 500));
      }
      return Promise.resolve('ok');
    });

    await withRetry(fn, { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100 });
    // retryAfter=500 > maxDelayMs=100 — server directive takes precedence
    const delay = sleepSpy.mock.calls[0][1] as number;
    expect(delay).toBeGreaterThanOrEqual(500);
    sleepSpy.mockRestore();
  });

  it('baseDelayMs=0 produces immediate retries', async () => {
    let attempt = 0;
    const fn = mock(() => {
      attempt++;
      if (attempt < 3) {
        return Promise.reject(new RetryableError('fail'));
      }
      return Promise.resolve('ok');
    });

    const result = await withRetry(fn, { maxRetries: 5, baseDelayMs: 0 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not call onRetry when maxRetries=0', async () => {
    const onRetry = mock(() => {});
    const fn = mock(() => Promise.reject(new RetryableError('fail')));

    await expect(withRetry(fn, { maxRetries: 0, baseDelayMs: 1, onRetry })).rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });
});
