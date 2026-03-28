/**
 * checkCliproxyPort() Health Check Tests
 *
 * Verifies the function maps ProxyStatus objects from detectRunningProxy()
 * to the correct HealthCheck output (status, message, details).
 */

import { describe, it, expect, mock } from 'bun:test';
import type { ProxyStatus } from '../../../src/cliproxy/proxy-detector';

// Mutable holder so each test can override the resolved value
let mockStatus: ProxyStatus = { running: false, verified: false };

mock.module('../../../src/cliproxy/proxy-detector', () => ({
  detectRunningProxy: async () => mockStatus,
  waitForProxyHealthy: async () => false,
  reclaimOrphanedProxy: () => null,
}));

// Import after mock is registered
const { checkCliproxyPort } = await import(
  `../../../src/web-server/health/cliproxy-checks?cliproxy-port-check=${Date.now()}`
);

describe('checkCliproxyPort', () => {
  it('returns ok when running and verified', async () => {
    mockStatus = { running: true, verified: true, method: 'http', pid: 1234 };
    const result = await checkCliproxyPort();
    expect(result.id).toBe('cliproxy-port');
    expect(result.status).toBe('ok');
    expect(result.message).toBe('CLIProxy running');
    expect(result.details).toBe('PID 1234');
  });

  it('returns ok via detection method when no pid', async () => {
    mockStatus = { running: true, verified: true, method: 'http' };
    const result = await checkCliproxyPort();
    expect(result.status).toBe('ok');
    expect(result.details).toBe('Detected via http');
  });

  it('returns warning "CLIProxy starting" when running but not verified', async () => {
    mockStatus = { running: true, verified: false, method: 'session-lock', pid: 5678 };
    const result = await checkCliproxyPort();
    expect(result.status).toBe('warning');
    expect(result.message).toBe('CLIProxy starting');
    expect(result.details).toBe('PID 5678');
  });

  it('returns warning with blocker process name when blocked with blocker', async () => {
    mockStatus = {
      running: false,
      verified: false,
      blocked: true,
      blocker: { pid: 9999, processName: 'nginx' },
    };
    const result = await checkCliproxyPort();
    expect(result.status).toBe('warning');
    expect(result.message).toBe('Occupied by nginx');
    expect(result.details).toBe('PID 9999');
    expect(result.fix).toBe('Kill process: kill 9999');
  });

  it('returns warning "Port occupied by unknown process" when blocked without blocker', async () => {
    mockStatus = { running: false, verified: false, blocked: true };
    const result = await checkCliproxyPort();
    expect(result.status).toBe('warning');
    expect(result.message).toBe('Port occupied by unknown process');
    expect(result.details).toBeUndefined();
    expect(result.fix).toBeUndefined();
  });

  it('returns info when port is free', async () => {
    mockStatus = { running: false, verified: false };
    const result = await checkCliproxyPort();
    expect(result.status).toBe('info');
    expect(result.details).toBe('Proxy not running');
  });
});
