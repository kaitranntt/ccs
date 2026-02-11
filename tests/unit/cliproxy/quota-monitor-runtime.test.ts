/**
 * Runtime Quota Monitor Unit Tests
 *
 * Tests the quota monitor lifecycle:
 * - startQuotaMonitor / stopQuotaMonitor behavior
 * - No-op conditions for non-agy, manual mode, disabled config
 * - Idempotent stopQuotaMonitor
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { startQuotaMonitor, stopQuotaMonitor, clearQuotaCache } from '../../../src/cliproxy/quota-manager';

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
  describe('startQuotaMonitor', () => {
    it('should accept non-agy provider without throwing', () => {
      // Non-agy providers should be silently ignored
      expect(() => {
        startQuotaMonitor('gemini', 'test@gmail.com');
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
              exhaustion_threshold: 0,
              cooldown_minutes: 5,
            },
          },
        })
      );

      expect(() => {
        startQuotaMonitor('agy', 'test@gmail.com');
      }).not.toThrow();
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
              exhaustion_threshold: 0,
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
              exhaustion_threshold: 0,
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
              exhaustion_threshold: 0,
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
