/**
 * Runtime Quota Monitor Unit Tests
 *
 * Tests the quota monitor lifecycle:
 * - startQuotaMonitor / stopQuotaMonitor behavior
 * - No-op conditions for unsupported providers, manual mode, disabled config
 * - Idempotent stopQuotaMonitor
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { startQuotaMonitor, stopQuotaMonitor, clearQuotaCache } from '../quota-manager';
import { __testExports as executorTestExports } from '../../executor';

// Setup test isolation
let tmpDir: string;
let origCcsHome: string | undefined;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-test-monitor-'));
  origCcsHome = process.env.CCS_HOME;
  process.env.CCS_HOME = tmpDir;
  clearQuotaCache(); // Clean cache between tests
});

afterEach(() => {
  stopQuotaMonitor(); // Clean up any active timers
  clearQuotaCache();
  if (origCcsHome !== undefined) {
    process.env.CCS_HOME = origCcsHome;
  } else {
    delete process.env.CCS_HOME;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Runtime Quota Monitor', () => {
  describe('resolveRuntimeQuotaMonitorProviders', () => {
    it('should monitor the default provider for non-composite sessions', () => {
      expect(executorTestExports.resolveRuntimeQuotaMonitorProviders('codex', [])).toEqual([
        'codex',
      ]);
    });

    it('should monitor every unique managed provider in composite sessions', () => {
      expect(
        executorTestExports.resolveRuntimeQuotaMonitorProviders('claude', [
          'codex',
          'qwen',
          'gemini',
          'codex',
        ])
      ).toEqual(['codex', 'gemini']);
    });

    it('should skip unsupported non-composite providers', () => {
      expect(executorTestExports.resolveRuntimeQuotaMonitorProviders('qwen', [])).toEqual([]);
    });
  });

  describe('startQuotaMonitor', () => {
    it('should accept all quota-supported providers without throwing', () => {
      for (const provider of ['agy', 'claude', 'codex', 'gemini', 'ghcp'] as const) {
        expect(() => {
          startQuotaMonitor(provider, 'test@gmail.com');
          stopQuotaMonitor();
        }).not.toThrow();
      }
    });

    it('should ignore unsupported providers without throwing', () => {
      expect(() => {
        startQuotaMonitor('qwen', 'test@gmail.com');
        stopQuotaMonitor();
      }).not.toThrow();
    });

    it('should accept agy provider without throwing', () => {
      // Setup config
      const configDir = path.join(tmpDir, '.ccs', 'config');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        path.join(configDir, 'unified-config.json'),
        JSON.stringify({
          version: 2,
          quota_management: {
            mode: 'auto',
            runtime_monitor: {
              enabled: false, // Disabled to avoid actual polling
              normal_interval_seconds: 300,
              critical_interval_seconds: 60,
              warn_threshold: 20,
              exhaustion_threshold: 5,
              cooldown_minutes: 5,
            },
          },
        })
      );

      expect(() => {
        startQuotaMonitor('agy', 'test@gmail.com');
      }).not.toThrow();
    });

    it('should start independent monitors for distinct managed provider accounts', () => {
      const configDir = path.join(tmpDir, '.ccs', 'config');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        path.join(configDir, 'unified-config.json'),
        JSON.stringify({
          version: 2,
          quota_management: {
            mode: 'auto',
            runtime_monitor: {
              enabled: true,
              normal_interval_seconds: 300,
              critical_interval_seconds: 60,
              warn_threshold: 20,
              exhaustion_threshold: 5,
              cooldown_minutes: 5,
            },
          },
        })
      );

      const originalSetTimeout = globalThis.setTimeout;
      const fakeTimer = {
        unref: () => fakeTimer,
        ref: () => fakeTimer,
        hasRef: () => false,
        refresh: () => fakeTimer,
      } as unknown as ReturnType<typeof setTimeout>;
      const observedDelays: Array<number | undefined> = [];

      globalThis.setTimeout = ((handler: (...args: unknown[]) => void, timeout?: number) => {
        observedDelays.push(timeout);
        void handler;
        return fakeTimer;
      }) as typeof globalThis.setTimeout;

      try {
        startQuotaMonitor('codex', 'codex@example.com');
        startQuotaMonitor('gemini', 'gemini@example.com');
        startQuotaMonitor('codex', 'codex@example.com');
      } finally {
        stopQuotaMonitor();
        globalThis.setTimeout = originalSetTimeout;
      }

      expect(observedDelays).toEqual([300_000, 300_000]);
    });

    it('should be no-op when config missing or no quota_management', () => {
      // No config file — should not throw
      expect(() => {
        startQuotaMonitor('agy', 'test@gmail.com');
      }).not.toThrow();
    });

    it('should handle manual mode gracefully', () => {
      const configDir = path.join(tmpDir, '.ccs', 'config');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        path.join(configDir, 'unified-config.json'),
        JSON.stringify({
          version: 2,
          quota_management: {
            mode: 'manual',
            runtime_monitor: {
              enabled: true,
              normal_interval_seconds: 300,
              critical_interval_seconds: 60,
              warn_threshold: 20,
              exhaustion_threshold: 5,
              cooldown_minutes: 5,
            },
          },
        })
      );

      expect(() => {
        startQuotaMonitor('agy', 'test@gmail.com');
      }).not.toThrow();
    });

    it('should handle disabled monitor gracefully', () => {
      const configDir = path.join(tmpDir, '.ccs', 'config');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        path.join(configDir, 'unified-config.json'),
        JSON.stringify({
          version: 2,
          quota_management: {
            mode: 'auto',
            runtime_monitor: {
              enabled: false,
              normal_interval_seconds: 300,
              critical_interval_seconds: 60,
              warn_threshold: 20,
              exhaustion_threshold: 5,
              cooldown_minutes: 5,
            },
          },
        })
      );

      expect(() => {
        startQuotaMonitor('agy', 'test@gmail.com');
      }).not.toThrow();
    });
  });

  describe('stopQuotaMonitor', () => {
    it('should be idempotent', () => {
      expect(() => {
        stopQuotaMonitor();
        stopQuotaMonitor();
        stopQuotaMonitor();
      }).not.toThrow();
    });

    it('should complete safely when called without prior start', () => {
      // No prior startQuotaMonitor call
      expect(() => {
        stopQuotaMonitor();
      }).not.toThrow();
    });

    it('should handle multiple start/stop cycles', () => {
      const configDir = path.join(tmpDir, '.ccs', 'config');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        path.join(configDir, 'unified-config.json'),
        JSON.stringify({
          version: 2,
          quota_management: {
            mode: 'auto',
            runtime_monitor: {
              enabled: false,
              normal_interval_seconds: 300,
              critical_interval_seconds: 60,
              warn_threshold: 20,
              exhaustion_threshold: 5,
              cooldown_minutes: 5,
            },
          },
        })
      );

      expect(() => {
        startQuotaMonitor('agy', 'test@gmail.com');
        stopQuotaMonitor();
        startQuotaMonitor('agy', 'test@gmail.com');
        stopQuotaMonitor();
      }).not.toThrow();
    });
  });
});
