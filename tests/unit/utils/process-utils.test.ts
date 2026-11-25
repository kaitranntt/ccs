/**
 * Unit tests for process-utils.ts
 */
import { describe, it, expect, jest } from 'bun:test';
import { EventEmitter } from 'events';
import { killWithEscalation } from '../../../src/utils/process-utils';
import type { ChildProcess } from 'child_process';

// Mock ChildProcess using EventEmitter
function createMockProcess(exitCode: number | null = null): ChildProcess {
  const proc = new EventEmitter() as any;
  proc.killed = false;
  proc.exitCode = exitCode;
  proc.kill = jest.fn((signal?: string) => {
    if (signal === 'SIGTERM' || signal === 'SIGKILL') {
      proc.killed = true;
    }
    return true;
  });
  return proc as ChildProcess;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('killWithEscalation', () => {
  it('should send SIGTERM immediately', () => {
    const proc = createMockProcess();
    killWithEscalation(proc);

    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
    expect(proc.kill).toHaveBeenCalledTimes(1);
  });

  it('should send SIGKILL after grace period if process still running', async () => {
    const proc = createMockProcess(null); // exitCode null = still running
    killWithEscalation(proc, 10);

    // SIGTERM sent immediately
    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
    expect(proc.kill).toHaveBeenCalledTimes(1);

    await wait(40);

    // SIGKILL sent after grace period
    expect(proc.kill).toHaveBeenCalledWith('SIGKILL');
    expect(proc.kill).toHaveBeenCalledTimes(2);
  });

  it('should NOT send SIGKILL if process exits before grace period', async () => {
    const proc = createMockProcess(null);
    killWithEscalation(proc, 40);

    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
    expect(proc.kill).toHaveBeenCalledTimes(1);

    // Simulate process exit before grace timeout
    await wait(10);
    (proc as { exitCode: number | null }).exitCode = 0;
    proc.emit('exit', 0);

    await wait(60);

    // SIGKILL should NOT have been sent
    expect(proc.kill).toHaveBeenCalledTimes(1);
    expect(proc.kill).not.toHaveBeenCalledWith('SIGKILL');
  });

  it('should use default grace period of 3000ms', () => {
    const proc = createMockProcess(null);
    const originalSetTimeout = globalThis.setTimeout;
    const fakeTimer = {
      unref: () => fakeTimer,
      ref: () => fakeTimer,
      hasRef: () => false,
      refresh: () => fakeTimer,
    } as unknown as ReturnType<typeof setTimeout>;

    let observedDelay: number | undefined;

    globalThis.setTimeout = ((handler: (...args: unknown[]) => void, timeout?: number) => {
      observedDelay = timeout;
      void handler; // avoid executing callback in this assertion-only test
      return fakeTimer;
    }) as unknown as typeof globalThis.setTimeout;

    try {
      killWithEscalation(proc);
      expect(observedDelay).toBe(3000);
      expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
      expect(proc.kill).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  it('should respect custom grace period', () => {
    const proc = createMockProcess(null);
    const originalSetTimeout = globalThis.setTimeout;
    const fakeTimer = {
      unref: () => fakeTimer,
      ref: () => fakeTimer,
      hasRef: () => false,
      refresh: () => fakeTimer,
    } as unknown as ReturnType<typeof setTimeout>;

    let observedDelay: number | undefined;

    globalThis.setTimeout = ((handler: (...args: unknown[]) => void, timeout?: number) => {
      observedDelay = timeout;
      void handler;
      return fakeTimer;
    }) as unknown as typeof globalThis.setTimeout;

    try {
      killWithEscalation(proc, 5000);
      expect(observedDelay).toBe(5000);
      expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
      expect(proc.kill).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  it('should clear timer when process exits', async () => {
    const proc = createMockProcess(null);
    const originalClearTimeout = globalThis.clearTimeout;
    let clearCalled = false;

    globalThis.clearTimeout = ((id: ReturnType<typeof setTimeout>) => {
      clearCalled = true;
      return originalClearTimeout(id);
    }) as typeof globalThis.clearTimeout;

    try {
      killWithEscalation(proc, 50);

      // Simulate immediate exit
      (proc as { exitCode: number | null }).exitCode = 0;
      proc.emit('exit', 0);

      await wait(70);

      // Should only have SIGTERM, timer was cleared
      expect(clearCalled).toBe(true);
      expect(proc.kill).toHaveBeenCalledTimes(1);
      expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
    } finally {
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

  it('should handle process that already exited', async () => {
    const proc = createMockProcess(0); // Already exited
    killWithEscalation(proc, 10);

    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');

    await wait(30);

    // SIGKILL should NOT be sent because exitCode is not null
    expect(proc.kill).toHaveBeenCalledTimes(1);
  });
});
