import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { PortProcess } from '../../../src/utils/port-utils';

let portProcesses: Record<number, PortProcess | null> = {};
let killResults: Record<number, boolean> = {};
let killCalls: Array<{ port: number; force: boolean }> = [];
let needsRegen = false;
let regenCalls = 0;
let regenThrows = false;
let imageFixResult = false;
let imageFixThrows = false;

mock.module('../../../src/utils/port-utils', () => ({
  getPortProcess: async (port: number) => {
    if (port === 1455 && portProcesses[port]?.processName === '__THROW__') {
      throw new Error('port probe error');
    }
    return portProcesses[port] ?? null;
  },
  isCLIProxyProcess: (proc: PortProcess | null) => {
    if (!proc) return false;
    const name = proc.processName.toLowerCase();
    return name.startsWith('cli-proxy') || name.startsWith('cliproxy');
  },
}));

mock.module('../../../src/utils/platform-commands', () => ({
  killProcessOnPort: (port: number, force = false) => {
    killCalls.push({ port, force });
    return killResults[port] ?? true;
  },
  getPlatformName: () => 'macOS',
}));

mock.module('../../../src/cliproxy/config/port-manager', () => ({
  CLIPROXY_DEFAULT_PORT: 8317,
}));

mock.module('../../../src/cliproxy/config/config-generator', () => ({
  CLIPROXY_CONFIG_VERSION: 99,
  configNeedsRegeneration: () => needsRegen,
  regenerateConfig: () => {
    if (regenThrows) {
      throw new Error('cannot write cliproxy config');
    }
    regenCalls += 1;
  },
}));

mock.module('../../../src/management/checks/image-analysis-check', () => ({
  fixImageAnalysisConfig: async () => {
    if (imageFixThrows) {
      throw new Error('image fix boom');
    }
    return imageFixResult;
  },
}));

const { runAutoRepair } = await import('../../../src/management/repair/auto-repair');

describe('runAutoRepair', () => {
  let tempRoot = '';
  let originalCcsHome: string | undefined;
  let originalCcsDir: string | undefined;
  let logs: string[] = [];

  const ccsDir = () => path.join(tempRoot, '.ccs');
  const claudeDir = () => path.join(tempRoot, '.claude');

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-auto-repair-test-'));
    originalCcsHome = process.env.CCS_HOME;
    originalCcsDir = process.env.CCS_DIR;

    process.env.CCS_HOME = tempRoot;
    delete process.env.CCS_DIR;

    portProcesses = {};
    killResults = {};
    killCalls = [];
    needsRegen = false;
    regenCalls = 0;
    regenThrows = false;
    imageFixResult = false;
    imageFixThrows = false;
    logs = [];

    spyOn(os, 'homedir').mockReturnValue(tempRoot);
    spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    mock.restore();

    if (originalCcsHome !== undefined) process.env.CCS_HOME = originalCcsHome;
    else delete process.env.CCS_HOME;

    if (originalCcsDir !== undefined) process.env.CCS_DIR = originalCcsDir;
    else delete process.env.CCS_DIR;

    if (tempRoot && fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('reports clean summary when no issues exist', async () => {
    await runAutoRepair();

    const output = logs.join('\n');
    expect(output).toContain('AUTO-FIX MODE');
    expect(output).toContain('Platform: macOS');
    expect(output).toContain('No issues found that needed fixing');
    expect(killCalls).toEqual([]);
    expect(regenCalls).toBe(0);
  });

  it('kills zombie CLIProxy on main and OAuth ports, upgrades config, repairs broken symlink, and fixes image config', async () => {
    fs.mkdirSync(path.join(ccsDir(), 'shared'), { recursive: true });
    fs.mkdirSync(claudeDir(), { recursive: true });
    fs.writeFileSync(path.join(claudeDir(), 'settings.json'), '{}\n', 'utf8');
    // Non-symlink shared/settings.json triggers Fix 4
    fs.writeFileSync(path.join(ccsDir(), 'shared', 'settings.json'), '{"a":1}\n', 'utf8');

    portProcesses[8317] = { pid: 1001, processName: 'cli-proxy-api-plus' };
    portProcesses[8085] = { pid: 1002, processName: 'cliproxy' };
    portProcesses[1455] = { pid: 1003, processName: 'node' };
    needsRegen = true;
    imageFixResult = true;

    await runAutoRepair();

    expect(killCalls).toEqual([
      { port: 8317, force: true },
      { port: 8085, force: true },
    ]);
    expect(regenCalls).toBe(1);
    expect(fs.lstatSync(path.join(ccsDir(), 'shared', 'settings.json')).isSymbolicLink()).toBe(
      true
    );

    const output = logs.join('\n');
    expect(output).toContain('Auto-fix complete: 5 issue(s) resolved');
  });

  it('handles non-CLIProxy port occupation, failed kills, and throwing repair steps without aborting', async () => {
    portProcesses[8317] = { pid: 2001, processName: 'python3' };
    portProcesses[8085] = { pid: 2002, processName: 'cli-proxy-api-plus' };
    portProcesses[1455] = { pid: 2003, processName: '__THROW__' };
    killResults[8085] = false;
    needsRegen = true;
    regenThrows = true;
    imageFixThrows = true;

    await runAutoRepair();

    expect(killCalls).toEqual([{ port: 8085, force: true }]);
    const output = logs.join('\n');
    expect(output).toContain('No issues found that needed fixing');
  });
});
