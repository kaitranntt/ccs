import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { FirewallCheckResult, PortProcess } from '../../../src/utils/port-utils';

let portProcessByPort: Record<number, PortProcess | null> = {};
let bindingSuccessByPort: Record<number, boolean> = {};
let firewallByPort: Record<number, FirewallCheckResult> = {};

mock.module('../../../src/utils/port-utils', () => ({
  getPortProcess: async (port: number) => portProcessByPort[port] ?? null,
  isCLIProxyProcess: (proc: PortProcess | null) => {
    if (!proc) return false;
    const name = proc.processName.toLowerCase();
    return name.startsWith('cli-proxy') || name.startsWith('cliproxy');
  },
  testLocalhostBinding: async (port: number) => {
    const success = bindingSuccessByPort[port] ?? !portProcessByPort[port];
    return {
      success,
      message: success ? `Port ${port} is available` : `Port ${port} is already in use`,
    };
  },
  checkWindowsFirewall: async (port: number) =>
    firewallByPort[port] ?? { checked: true, mayBlock: false, message: 'Allowed' },
  waitForPortFree: async () => true,
}));

const {
  OAUTH_CALLBACK_PORTS,
  OAUTH_FLOW_TYPES,
  checkOAuthPort,
  checkAllOAuthPorts,
  checkAuthCodePorts,
  getPortConflicts,
  formatOAuthPortDiagnostics,
  preflightOAuthCheck,
  enhancedPreflightOAuthCheck,
} = await import('../../../src/management/oauth-port-diagnostics');

describe('oauth-port-diagnostics', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    portProcessByPort = {};
    bindingSuccessByPort = {};
    firewallByPort = {};
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  });

  it('exposes canonical OAuth callback ports and flow types', () => {
    expect(OAUTH_CALLBACK_PORTS.gemini).toBe(8085);
    expect(OAUTH_CALLBACK_PORTS.codex).toBe(1455);
    expect(OAUTH_CALLBACK_PORTS.agy).toBe(51121);
    expect(OAUTH_CALLBACK_PORTS.kiro).toBeNull();
    expect(OAUTH_FLOW_TYPES.kiro).toBe('device_code');
    expect(OAUTH_FLOW_TYPES.gemini).toBe('authorization_code');
  });

  describe('checkOAuthPort', () => {
    it('returns not_applicable for device-code providers without querying ports', async () => {
      const diag = await checkOAuthPort('kiro');
      expect(diag).toEqual({
        provider: 'kiro',
        flowType: 'device_code',
        port: null,
        status: 'not_applicable',
        process: null,
        message: 'Uses Device Code Flow (no callback port needed)',
        recommendation: null,
      });
    });

    it('returns free when no process is listening on callback port', async () => {
      const diag = await checkOAuthPort('gemini');
      expect(diag.status).toBe('free');
      expect(diag.port).toBe(8085);
      expect(diag.process).toBeNull();
      expect(diag.recommendation).toBeNull();
    });

    it('returns cliproxy when CLIProxy holds the callback port', async () => {
      portProcessByPort[1455] = { pid: 1234, processName: 'cli-proxy-api-p' };
      const diag = await checkOAuthPort('codex');

      expect(diag.status).toBe('cliproxy');
      expect(diag.process).toEqual({ pid: 1234, processName: 'cli-proxy-api-p' });
      expect(diag.recommendation).toBeNull();
    });

    it('returns occupied with kill recommendation when another process holds the port', async () => {
      portProcessByPort[51121] = { pid: 9876, processName: 'node' };
      const diag = await checkOAuthPort('agy');

      expect(diag.status).toBe('occupied');
      expect(diag.message).toContain('Port 51121 occupied by node');
      expect(diag.recommendation).toContain('kill 9876');
    });
  });

  describe('batch checks & conflict filtering', () => {
    it('checks all providers, auth-code subset, and filters conflicts', async () => {
      portProcessByPort[8085] = { pid: 4321, processName: 'python3' };
      portProcessByPort[1455] = { pid: 2222, processName: 'cliproxy' };

      const all = await checkAllOAuthPorts();
      const authCodeOnly = await checkAuthCodePorts();
      const conflicts = await getPortConflicts();

      expect(all.length).toBeGreaterThan(authCodeOnly.length);
      expect(authCodeOnly.every((item) => item.flowType === 'authorization_code')).toBe(true);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].provider).toBe('gemini');
    });
  });

  describe('formatOAuthPortDiagnostics', () => {
    it('formats free, cliproxy, occupied, and not_applicable statuses with ASCII icons', () => {
      const lines = formatOAuthPortDiagnostics([
        {
          provider: 'gemini',
          flowType: 'authorization_code',
          port: 8085,
          status: 'free',
          process: null,
          message: 'Port 8085 is available',
          recommendation: null,
        },
        {
          provider: 'codex',
          flowType: 'authorization_code',
          port: 1455,
          status: 'cliproxy',
          process: { pid: 100, processName: 'cli-proxy' },
          message: 'Port 1455 in use by CLIProxy (expected)',
          recommendation: null,
        },
        {
          provider: 'agy',
          flowType: 'authorization_code',
          port: 51121,
          status: 'occupied',
          process: { pid: 200, processName: 'bun' },
          message: 'Port 51121 occupied by bun',
          recommendation: 'Kill process: kill 200',
        },
        {
          provider: 'kiro',
          flowType: 'device_code',
          port: null,
          status: 'not_applicable',
          process: null,
          message: 'Uses Device Code Flow',
          recommendation: null,
        },
      ]);

      const output = lines.join('\n');
      expect(output).toContain('[OK] Gemini (8085)');
      expect(output).toContain('[OK] Codex (1455)');
      expect(output).toContain('[!] Agy (51121)');
      expect(output).toContain('→ Kill process: kill 200');
      expect(output).toContain('[i] Kiro');
    });
  });

  describe('enhancedPreflightOAuthCheck and preflightOAuthCheck', () => {
    it('marks device code flow ready immediately', async () => {
      const result = await enhancedPreflightOAuthCheck('kiro');
      expect(result.ready).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.checks).toEqual([
        {
          name: 'OAuth Flow',
          status: 'ok',
          message: 'Uses Device Code Flow (no callback port needed)',
        },
      ]);
    });

    it('fails preflight with platform-appropriate kill command when port is blocked', async () => {
      portProcessByPort[8085] = { pid: 3456, processName: 'nginx' };
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      const unixResult = await enhancedPreflightOAuthCheck('gemini');

      expect(unixResult.ready).toBe(false);
      expect(unixResult.issues[0]).toContain('Port 8085 is blocked by nginx (PID 3456)');
      expect(unixResult.checks.find((c) => c.name === 'Port Availability')?.fixCommand).toBe(
        'kill 3456'
      );

      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      const winResult = await enhancedPreflightOAuthCheck('gemini');
      expect(winResult.checks.find((c) => c.name === 'Port Availability')?.fixCommand).toBe(
        'taskkill /F /PID 3456'
      );

      const legacy = await preflightOAuthCheck('gemini');
      expect(legacy.ready).toBe(false);
      expect(legacy.issues).toHaveLength(1);
    });

    it('passes when CLIProxy holds the port or when port is free', async () => {
      portProcessByPort[1455] = { pid: 888, processName: 'cli-proxy-api-plus' };
      const cliproxyResult = await enhancedPreflightOAuthCheck('codex');
      expect(cliproxyResult.ready).toBe(true);
      expect(cliproxyResult.checks[0].message).toContain('in use by CLIProxy');

      portProcessByPort = {};
      const freeResult = await enhancedPreflightOAuthCheck('codex');
      expect(freeResult.ready).toBe(true);
      expect(freeResult.checks.map((c) => c.name)).toEqual([
        'Port Availability',
        'Localhost Binding',
      ]);
    });

    it('emits warning without blocking when localhost binding fails with no detected process', async () => {
      bindingSuccessByPort[8085] = false;
      const result = await enhancedPreflightOAuthCheck('gemini');

      expect(result.ready).toBe(true);
      expect(result.checks.find((c) => c.name === 'Localhost Binding')?.status).toBe('warn');
    });

    it('includes Windows firewall warning as non-blocking warn when firewall may block', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      firewallByPort[8085] = {
        checked: true,
        mayBlock: true,
        message: 'Port 8085 may be blocked',
        fixCommand: 'netsh add rule',
      };

      const result = await enhancedPreflightOAuthCheck('gemini');
      expect(result.ready).toBe(true);
      expect(result.firewallWarning).toBe('Port 8085 may be blocked');
      expect(result.firewallFixCommand).toBe('netsh add rule');
      expect(result.checks.find((c) => c.name === 'Windows Firewall')?.status).toBe('warn');
    });
  });
});
