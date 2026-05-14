import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { mutateUnifiedConfig } from '../../../src/config/unified-config-loader';

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runCcs(args: string[], env: NodeJS.ProcessEnv): RunResult {
  const ccsEntry = path.join(process.cwd(), 'src', 'ccs.ts');
  const result = spawnSync(process.execPath, [ccsEntry, ...args], {
    encoding: 'utf8',
    env,
    timeout: 20000,
  });

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function runCodexAlias(args: string[], env: NodeJS.ProcessEnv): RunResult {
  const codexEntry = path.join(process.cwd(), 'src', 'bin', 'codex-runtime.ts');
  const result = spawnSync(process.execPath, [codexEntry, ...args], {
    encoding: 'utf8',
    env,
    timeout: 20000,
  });

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function runCcsxpAlias(args: string[], env: NodeJS.ProcessEnv): RunResult {
  const ccsxpEntry = path.join(process.cwd(), 'src', 'bin', 'ccsxp-runtime.ts');
  const result = spawnSync(process.execPath, [ccsxpEntry, ...args], {
    encoding: 'utf8',
    env,
    timeout: 20000,
  });

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function readLoggedCodexCalls(logPath: string): string[][] {
  if (!fs.existsSync(logPath)) {
    return [];
  }

  return fs
    .readFileSync(logPath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as string[]);
}

function readLoggedCodexEnv(logPath: string): Record<string, string | undefined>[] {
  if (!fs.existsSync(logPath)) {
    return [];
  }

  return fs
    .readFileSync(logPath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, string | undefined>);
}

describe('codex runtime integration', () => {
  let tmpHome: string;
  let ccsDir: string;
  let fakeCodexPath: string;
  let codexArgsLogPath: string;
  let codexEnvLogPath: string;
  let emptyPathDir: string;

  beforeEach(() => {
    if (process.platform === 'win32') {
      return;
    }

    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-codex-route-it-'));
    ccsDir = path.join(tmpHome, '.ccs');
    fakeCodexPath = path.join(tmpHome, 'fake-codex.js');
    codexArgsLogPath = path.join(tmpHome, 'codex-args.log');
    codexEnvLogPath = path.join(tmpHome, 'codex-env.log');
    emptyPathDir = path.join(tmpHome, 'empty-bin');

    fs.mkdirSync(ccsDir, { recursive: true });
    fs.mkdirSync(emptyPathDir, { recursive: true });

    fs.writeFileSync(
      fakeCodexPath,
      `#!/usr/bin/env node
const fs = require('fs');
const out = process.env.CCS_TEST_CODEX_ARGS_OUT;
const cliArgs = process.argv.slice(2);
if (out) {
  fs.appendFileSync(out, JSON.stringify(cliArgs) + '\\n');
}
const envOut = process.env.CCS_TEST_CODEX_ENV_OUT;
if (envOut) {
  const loggedEnv = {
    CODEX_HOME: process.env.CODEX_HOME,
    CODEX_CI: process.env.CODEX_CI,
    CODEX_MANAGED_BY_BUN: process.env.CODEX_MANAGED_BY_BUN,
    CODEX_THREAD_ID: process.env.CODEX_THREAD_ID,
    ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
    CCS_BROWSER_USER_DATA_DIR: process.env.CCS_BROWSER_USER_DATA_DIR,
    CCS_BROWSER_PROFILE_DIR: process.env.CCS_BROWSER_PROFILE_DIR,
    CCS_BROWSER_DEVTOOLS_WS_URL: process.env.CCS_BROWSER_DEVTOOLS_WS_URL,
  };
  if (
    process.env.CCS_TEST_CODEX_LOG_CLIPROXY_API_KEY === '1' &&
    process.env.CLIPROXY_API_KEY !== undefined
  ) {
    loggedEnv.CLIPROXY_API_KEY = process.env.CLIPROXY_API_KEY;
  }
  const extraEnvKeys = (process.env.CCS_TEST_CODEX_LOG_ENV_KEYS || '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);
  for (const key of extraEnvKeys) {
    loggedEnv[key] = process.env[key];
  }
  fs.appendFileSync(
    envOut,
    JSON.stringify(loggedEnv) + '\\n'
  );
}
const configFlagIndex = cliArgs.findIndex((arg) => arg === '-c' || arg === '--config');
if (process.env.CCS_TEST_CODEX_CONFIG_OVERRIDE_STATUS === 'unsupported' && configFlagIndex !== -1) {
  process.stderr.write('codex: unknown option --config\\n');
  process.exit(1);
}
if (
  cliArgs.includes('--version') ||
  cliArgs.includes('-v') ||
  (configFlagIndex !== -1 &&
    (cliArgs[configFlagIndex + 2] === '--version' || cliArgs[configFlagIndex + 2] === '-v'))
) {
  process.stdout.write(process.env.CCS_TEST_CODEX_VERSION || 'codex-cli 0.118.0-alpha.3');
  process.exit(0);
}
if (cliArgs.includes('--help') || cliArgs.includes('-h')) {
  process.stdout.write(
    process.env.CCS_TEST_CODEX_HELP ||
      '  -c, --config <key=value>\\n  -p, --profile <CONFIG_PROFILE>\\n'
  );
  process.exit(0);
}
process.exit(0);
`,
      { encoding: 'utf8', mode: 0o755 }
    );
    fs.chmodSync(fakeCodexPath, 0o755);
  });

  afterEach(() => {
    if (process.platform === 'win32') {
      return;
    }

    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('keeps browser MCP runtime overrides off for untouched Codex launches', () => {
    if (process.platform === 'win32') return;

    const result = runCcs(['default', '--target', 'codex', 'fix failing tests'], {
      ...process.env,
      CI: '1',
      NO_COLOR: '1',
      CCS_HOME: tmpHome,
      CODEX_HOME: undefined,
      CCS_CODEX_PATH: fakeCodexPath,
      CCS_TEST_CODEX_ARGS_OUT: codexArgsLogPath,
      CCS_TEST_CODEX_ENV_OUT: codexEnvLogPath,
      CCS_THINKING: '8192',
      CCS_BROWSER_USER_DATA_DIR: '/tmp/stale-codex-browser-runtime',
      CCS_BROWSER_PROFILE_DIR: '/tmp/stale-codex-browser-legacy',
      CCS_BROWSER_DEVTOOLS_WS_URL: 'ws://127.0.0.1/devtools/browser/stale-codex-env',
    });

    expect(result.status).toBe(0);
    const calls = readLoggedCodexCalls(codexArgsLogPath);
    expect(calls).toEqual([['fix failing tests']]);
    expect(readLoggedCodexEnv(codexEnvLogPath)).toEqual([
      {
        CODEX_HOME: undefined,
        CODEX_CI: undefined,
        CODEX_MANAGED_BY_BUN: undefined,
        CODEX_THREAD_ID: undefined,
        ANTHROPIC_BASE_URL: undefined,
        CCS_BROWSER_USER_DATA_DIR: undefined,
        CCS_BROWSER_PROFILE_DIR: undefined,
        CCS_BROWSER_DEVTOOLS_WS_URL: undefined,
      },
    ]);
  });

  it('injects browser MCP runtime overrides when Codex browser policy is explicitly auto-enabled', () => {
    if (process.platform === 'win32') return;

    const originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tmpHome;

    try {
      mutateUnifiedConfig((config) => {
        config.browser = {
          claude: {
            enabled: false,
            policy: 'manual',
            user_data_dir: '',
            devtools_port: 9222,
          },
          codex: {
            enabled: true,
            policy: 'auto',
          },
        };
      });

      const result = runCcs(['default', '--target', 'codex', 'fix failing tests'], {
        ...process.env,
        CI: '1',
        NO_COLOR: '1',
        CCS_HOME: tmpHome,
        CCS_CODEX_PATH: fakeCodexPath,
        CCS_TEST_CODEX_ARGS_OUT: codexArgsLogPath,
        CCS_THINKING: '8192',
      });

      expect(result.status).toBe(0);
      const calls = readLoggedCodexCalls(codexArgsLogPath);
      expect(calls).toEqual([
        ['-c', 'model="gpt-5"', '--version'],
        [
          '-c',
          `mcp_servers.ccs_browser.command=${JSON.stringify(process.platform === 'win32' ? 'npx.cmd' : 'npx')}`,
          '-c',
          `mcp_servers.ccs_browser.args=${JSON.stringify(['-y', '@playwright/mcp@0.0.70'])}`,
          '-c',
          'mcp_servers.ccs_browser.enabled=true',
          '-c',
          'mcp_servers.ccs_browser.tool_timeout_sec=30',
          'fix failing tests',
        ],
      ]);
    } finally {
      if (originalCcsHome !== undefined) {
        process.env.CCS_HOME = originalCcsHome;
      } else {
        delete process.env.CCS_HOME;
      }
    }
  });

  it('skips Codex browser MCP overrides when browser tooling is disabled in config', () => {
    if (process.platform === 'win32') return;

    const originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tmpHome;

    try {
      mutateUnifiedConfig((config) => {
        config.browser = {
          claude: {
            enabled: false,
            policy: 'auto',
            user_data_dir: '',
            devtools_port: 9222,
          },
          codex: {
            enabled: false,
            policy: 'auto',
          },
        };
      });

      const result = runCcs(['default', '--target', 'codex', 'fix failing tests'], {
        ...process.env,
        CI: '1',
        NO_COLOR: '1',
        CCS_HOME: tmpHome,
        CCS_CODEX_PATH: fakeCodexPath,
        CCS_TEST_CODEX_ARGS_OUT: codexArgsLogPath,
      });

      expect(result.status).toBe(0);
      const calls = readLoggedCodexCalls(codexArgsLogPath);
      expect(calls).toEqual([['fix failing tests']]);
    } finally {
      if (originalCcsHome !== undefined) {
        process.env.CCS_HOME = originalCcsHome;
      } else {
        delete process.env.CCS_HOME;
      }
    }
  });

  it('keeps Codex browser MCP overrides off by default when policy is manual', () => {
    if (process.platform === 'win32') return;

    const originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tmpHome;

    try {
      mutateUnifiedConfig((config) => {
        config.browser = {
          claude: {
            enabled: false,
            policy: 'auto',
            user_data_dir: '',
            devtools_port: 9222,
          },
          codex: {
            enabled: true,
            policy: 'manual',
          },
        };
      });

      const result = runCcs(['default', '--target', 'codex', 'fix failing tests'], {
        ...process.env,
        CI: '1',
        NO_COLOR: '1',
        CCS_HOME: tmpHome,
        CCS_CODEX_PATH: fakeCodexPath,
        CCS_TEST_CODEX_ARGS_OUT: codexArgsLogPath,
      });

      expect(result.status).toBe(0);
      const calls = readLoggedCodexCalls(codexArgsLogPath);
      expect(calls).toEqual([['fix failing tests']]);
    } finally {
      if (originalCcsHome !== undefined) {
        process.env.CCS_HOME = originalCcsHome;
      } else {
        delete process.env.CCS_HOME;
      }
    }
  });

  it('forces Codex browser MCP overrides on for one launch when --browser is passed', () => {
    if (process.platform === 'win32') return;

    const originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tmpHome;

    try {
      mutateUnifiedConfig((config) => {
        config.browser = {
          claude: {
            enabled: false,
            policy: 'auto',
            user_data_dir: '',
            devtools_port: 9222,
          },
          codex: {
            enabled: true,
            policy: 'manual',
          },
        };
      });

      const result = runCcs(['default', '--target', 'codex', '--browser', 'fix failing tests'], {
        ...process.env,
        CI: '1',
        NO_COLOR: '1',
        CCS_HOME: tmpHome,
        CCS_CODEX_PATH: fakeCodexPath,
        CCS_TEST_CODEX_ARGS_OUT: codexArgsLogPath,
      });

      expect(result.status).toBe(0);
      const calls = readLoggedCodexCalls(codexArgsLogPath);
      expect(calls[1]).toEqual(
        expect.arrayContaining(['mcp_servers.ccs_browser.enabled=true', 'fix failing tests'])
      );
    } finally {
      if (originalCcsHome !== undefined) {
        process.env.CCS_HOME = originalCcsHome;
      } else {
        delete process.env.CCS_HOME;
      }
    }
  });

  it('suppresses Codex browser MCP overrides for one launch when --no-browser is passed', () => {
    if (process.platform === 'win32') return;

    const result = runCcs(['default', '--target', 'codex', '--no-browser', 'fix failing tests'], {
      ...process.env,
      CI: '1',
      NO_COLOR: '1',
      HOME: tmpHome,
      CCS_HOME: tmpHome,
      CCS_CODEX_PATH: fakeCodexPath,
      CCS_TEST_CODEX_ARGS_OUT: codexArgsLogPath,
    });

    expect(result.status).toBe(0);
    const calls = readLoggedCodexCalls(codexArgsLogPath);
    expect(calls).toEqual([['fix failing tests']]);
  });

  it('keeps browser MCP runtime overrides off when CCS_THINKING is ignored for native Codex default mode', () => {
    if (process.platform === 'win32') return;

    const result = runCcs(['default', '--target', 'codex', 'fix failing tests'], {
      ...process.env,
      CI: '1',
      NO_COLOR: '1',
      HOME: tmpHome,
      CCS_HOME: tmpHome,
      CCS_CODEX_PATH: fakeCodexPath,
      CCS_TEST_CODEX_ARGS_OUT: codexArgsLogPath,
      CCS_THINKING: 'off',
    });

    expect(result.status).toBe(0);
    const calls = readLoggedCodexCalls(codexArgsLogPath);
    expect(calls).toEqual([['fix failing tests']]);
  });

  for (const versionFlag of ['--version', '-v']) {
    it(`passes ccsx ${versionFlag} straight through to the native Codex binary`, () => {
      if (process.platform === 'win32') return;

      const result = runCodexAlias([versionFlag], {
        ...process.env,
        CI: '1',
        NO_COLOR: '1',
        CCS_HOME: tmpHome,
        CCS_CODEX_PATH: fakeCodexPath,
        CCS_TEST_CODEX_ARGS_OUT: codexArgsLogPath,
        CCS_TEST_CODEX_VERSION: 'codex-cli 9.9.9-test',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('codex-cli 9.9.9-test');
      expect(readLoggedCodexCalls(codexArgsLogPath)).toEqual([[versionFlag]]);
    });
  }

  it('strips browser launch flags before native codex passthrough diagnostics', () => {
    if (process.platform === 'win32') return;

    const result = runCodexAlias(['--version', '--browser'], {
      ...process.env,
      CI: '1',
      NO_COLOR: '1',
      CCS_HOME: tmpHome,
      CCS_CODEX_PATH: fakeCodexPath,
      CCS_TEST_CODEX_ARGS_OUT: codexArgsLogPath,
      CCS_TEST_CODEX_VERSION: 'codex-cli 9.9.9-test',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('codex-cli 9.9.9-test');
    expect(readLoggedCodexCalls(codexArgsLogPath)).toEqual([['--version']]);
  });

  for (const helpFlag of ['--help', '-h']) {
    it(`passes ccsx ${helpFlag} straight through to the native Codex binary`, () => {
      if (process.platform === 'win32') return;

      const result = runCodexAlias([helpFlag], {
        ...process.env,
        CI: '1',
        NO_COLOR: '1',
        CCS_HOME: tmpHome,
        CCS_CODEX_PATH: fakeCodexPath,
        CCS_TEST_CODEX_ARGS_OUT: codexArgsLogPath,
        CCS_TEST_CODEX_HELP: 'codex native help text',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('codex native help text');
      expect(readLoggedCodexCalls(codexArgsLogPath)).toEqual([[helpFlag]]);
    });
  }

  it('strips nested Codex session env from passthrough launches while keeping CODEX_HOME', () => {
    if (process.platform === 'win32') return;

    const result = runCodexAlias(['--version'], {
      ...process.env,
      CI: '1',
      NO_COLOR: '1',
      CCS_HOME: tmpHome,
      CCS_CODEX_PATH: fakeCodexPath,
      CCS_TEST_CODEX_ARGS_OUT: codexArgsLogPath,
      CCS_TEST_CODEX_ENV_OUT: codexEnvLogPath,
      CCS_TEST_CODEX_VERSION: 'codex-cli 9.9.9-test',
      CODEX_HOME: '/tmp/codex-home',
      CODEX_CI: '1',
      CODEX_MANAGED_BY_BUN: '1',
      CODEX_THREAD_ID: 'thread-123',
      ANTHROPIC_BASE_URL: 'https://stale-proxy.invalid',
    });

    expect(result.status).toBe(0);
    expect(readLoggedCodexCalls(codexArgsLogPath)).toEqual([['--version']]);
    expect(readLoggedCodexEnv(codexEnvLogPath)).toEqual([
      {
        CODEX_HOME: '/tmp/codex-home',
        CODEX_CI: undefined,
        CODEX_MANAGED_BY_BUN: undefined,
        CODEX_THREAD_ID: undefined,
        ANTHROPIC_BASE_URL: undefined,
        CCS_BROWSER_USER_DATA_DIR: undefined,
        CCS_BROWSER_PROFILE_DIR: undefined,
        CCS_BROWSER_DEVTOOLS_WS_URL: undefined,
      },
    ]);
  });

  it('creates an explicit CODEX_HOME directory before routed native Codex launches', () => {
    if (process.platform === 'win32') return;

    const freshCodexHome = path.join(tmpHome, 'fresh-codex-home');
    const result = runCcs(
      ['default', '--target', 'codex', '--effort', 'high', 'fix failing tests'],
      {
        ...process.env,
        CI: '1',
        NO_COLOR: '1',
        CCS_HOME: tmpHome,
        CCS_CODEX_PATH: fakeCodexPath,
        CCS_TEST_CODEX_ARGS_OUT: codexArgsLogPath,
        CCS_TEST_CODEX_ENV_OUT: codexEnvLogPath,
        CCS_TEST_CODEX_VERSION: 'codex-cli 9.9.9-test',
        CODEX_HOME: freshCodexHome,
      }
    );

    expect(result.status).toBe(0);
    expect(fs.existsSync(freshCodexHome)).toBe(true);
    expect(fs.statSync(freshCodexHome).isDirectory()).toBe(true);
    expect(readLoggedCodexCalls(codexArgsLogPath)).toEqual([
      ['-c', 'model="gpt-5"', '--version'],
      ['-c', 'model_reasoning_effort="high"', 'fix failing tests'],
    ]);
    const loggedEnv = readLoggedCodexEnv(codexEnvLogPath);
    expect(loggedEnv).toHaveLength(2);
    expect(loggedEnv.map((entry) => entry.CODEX_HOME)).toEqual([freshCodexHome, freshCodexHome]);
    expect(loggedEnv[1]).toEqual({
      CODEX_HOME: freshCodexHome,
      CODEX_CI: undefined,
      CODEX_MANAGED_BY_BUN: undefined,
      CODEX_THREAD_ID: undefined,
      ANTHROPIC_BASE_URL: undefined,
      CCS_BROWSER_USER_DATA_DIR: undefined,
      CCS_BROWSER_PROFILE_DIR: undefined,
      CCS_BROWSER_DEVTOOLS_WS_URL: undefined,
    });
  });

  it('fails with a clean error when routed launches receive a file CODEX_HOME path', () => {
    if (process.platform === 'win32') return;

    const invalidCodexHome = path.join(tmpHome, 'codex-home-file');
    fs.writeFileSync(invalidCodexHome, 'not-a-directory');

    const result = runCcs(
      ['default', '--target', 'codex', '--effort', 'high', 'fix failing tests'],
      {
        ...process.env,
        CI: '1',
        NO_COLOR: '1',
        CCS_HOME: tmpHome,
        CCS_CODEX_PATH: fakeCodexPath,
        CCS_TEST_CODEX_ARGS_OUT: codexArgsLogPath,
        CODEX_HOME: invalidCodexHome,
      }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`[X] CODEX_HOME path is not a directory: ${invalidCodexHome}`);
    expect(readLoggedCodexCalls(codexArgsLogPath)).toEqual([['-c', 'model="gpt-5"', '--version']]);
  });

  it('keeps passthrough version launches aligned with native warning-only CODEX_HOME behavior', () => {
    if (process.platform === 'win32') return;

    const readOnlyRoot = path.join(tmpHome, 'readonly-root');
    fs.mkdirSync(readOnlyRoot, { recursive: true });
    fs.chmodSync(readOnlyRoot, 0o555);

    try {
      const result = runCodexAlias(['--version'], {
        ...process.env,
        CI: '1',
        NO_COLOR: '1',
        CCS_HOME: tmpHome,
        CCS_CODEX_PATH: fakeCodexPath,
        CCS_TEST_CODEX_ARGS_OUT: codexArgsLogPath,
        CCS_TEST_CODEX_VERSION: 'codex-cli 9.9.9-test',
        CODEX_HOME: path.join(readOnlyRoot, 'missing-codex-home'),
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('codex-cli 9.9.9-test');
      expect(readLoggedCodexCalls(codexArgsLogPath)).toEqual([['--version']]);
    } finally {
      fs.chmodSync(readOnlyRoot, 0o755);
    }
  });

  it('normalizes explicit CODEX_HOME before launching native Codex', () => {
    if (process.platform === 'win32') return;

    const result = runCodexAlias(['--version'], {
      ...process.env,
      CI: '1',
      NO_COLOR: '1',
      HOME: tmpHome,
      CCS_HOME: tmpHome,
      CCS_CODEX_PATH: fakeCodexPath,
      CCS_TEST_CODEX_ARGS_OUT: codexArgsLogPath,
      CCS_TEST_CODEX_ENV_OUT: codexEnvLogPath,
      CCS_TEST_CODEX_VERSION: 'codex-cli 9.9.9-test',
      CODEX_HOME: '~/.codex-lit',
    });

    expect(result.status).toBe(0);
    expect(readLoggedCodexEnv(codexEnvLogPath)).toEqual([
      {
        CODEX_HOME: path.join(tmpHome, '.codex-lit'),
        CODEX_CI: undefined,
        CODEX_MANAGED_BY_BUN: undefined,
        CODEX_THREAD_ID: undefined,
        ANTHROPIC_BASE_URL: undefined,
        CCS_BROWSER_USER_DATA_DIR: undefined,
        CCS_BROWSER_PROFILE_DIR: undefined,
        CCS_BROWSER_DEVTOOLS_WS_URL: undefined,
      },
    ]);
  });

  it('keeps ccsxp pinned to native Codex even when a user passes another --target override', () => {
    if (process.platform === 'win32') return;

    const result = runCcsxpAlias(['--target', 'claude', '--version'], {
      ...process.env,
      CI: '1',
      NO_COLOR: '1',
      HOME: tmpHome,
      CCS_HOME: tmpHome,
      CCS_CODEX_PATH: fakeCodexPath,
      CCS_TEST_CODEX_ARGS_OUT: codexArgsLogPath,
      CCS_TEST_CODEX_VERSION: 'codex-cli 9.9.9-test',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('codex-cli 9.9.9-test');
    expect(readLoggedCodexCalls(codexArgsLogPath)).toEqual([
      ['--config', 'model_provider="cliproxy"', '--version'],
    ]);
  });

  it('pins ccsxp Codex history to native default instead of inherited CODEX_HOME', () => {
    if (process.platform === 'win32') return;

    const inheritedCodexHome = path.join(tmpHome, 'inherited-codex-home');
    const result = runCcsxpAlias(['--version'], {
      ...process.env,
      CI: '1',
      NO_COLOR: '1',
      HOME: tmpHome,
      CCS_HOME: tmpHome,
      CCS_CODEX_PATH: fakeCodexPath,
      CCS_TEST_CODEX_ENV_OUT: codexEnvLogPath,
      CCS_TEST_CODEX_VERSION: 'codex-cli 9.9.9-test',
      CCS_TEST_CODEX_LOG_CLIPROXY_API_KEY: '1',
      CODEX_HOME: inheritedCodexHome,
    });

    expect(result.status).toBe(0);
    expect(readLoggedCodexEnv(codexEnvLogPath)).toEqual([
      {
        CODEX_HOME: path.join(tmpHome, '.codex'),
        CODEX_CI: undefined,
        CODEX_MANAGED_BY_BUN: undefined,
        CODEX_THREAD_ID: undefined,
        ANTHROPIC_BASE_URL: undefined,
        CLIPROXY_API_KEY: 'ccs-internal-managed',
        CCS_BROWSER_USER_DATA_DIR: undefined,
        CCS_BROWSER_PROFILE_DIR: undefined,
        CCS_BROWSER_DEVTOOLS_WS_URL: undefined,
      },
    ]);
  });

  it('routes default ccsxp launches through native Codex with the cliproxy provider override', () => {
    if (process.platform === 'win32') return;

    const result = runCcsxpAlias(['fix failing tests'], {
      ...process.env,
      CI: '1',
      NO_COLOR: '1',
      HOME: tmpHome,
      CCS_HOME: tmpHome,
      CCS_CODEX_PATH: fakeCodexPath,
      CCS_TEST_CODEX_ARGS_OUT: codexArgsLogPath,
      CCS_TEST_CODEX_ENV_OUT: codexEnvLogPath,
      CCS_TEST_CODEX_LOG_CLIPROXY_API_KEY: '1',
    });

    expect(result.status).toBe(0);
    expect(readLoggedCodexCalls(codexArgsLogPath)).toEqual([
      ['--config', 'model_provider="cliproxy"', 'fix failing tests'],
    ]);
    const codexConfig = fs.readFileSync(path.join(tmpHome, '.codex', 'config.toml'), 'utf8');
    expect(codexConfig).toContain('[model_providers.cliproxy]');
    expect(codexConfig).toContain('env_key = "CLIPROXY_API_KEY"');
    expect(readLoggedCodexEnv(codexEnvLogPath)).toEqual([
      {
        CODEX_HOME: path.join(tmpHome, '.codex'),
        CODEX_CI: undefined,
        CODEX_MANAGED_BY_BUN: undefined,
        CODEX_THREAD_ID: undefined,
        ANTHROPIC_BASE_URL: undefined,
        CLIPROXY_API_KEY: 'ccs-internal-managed',
        CCS_BROWSER_USER_DATA_DIR: undefined,
        CCS_BROWSER_PROFILE_DIR: undefined,
        CCS_BROWSER_DEVTOOLS_WS_URL: undefined,
      },
    ]);
  });

  it('loads the configured cliproxy provider env_key for ccsxp launches', () => {
    if (process.platform === 'win32') return;

    const codexHome = path.join(tmpHome, '.codex');
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(
      path.join(codexHome, 'config.toml'),
      `[model_providers.cliproxy]
name = "CLIProxy Codex"
base_url = "http://localhost:8317/api/provider/codex"
env_key = "CCS_CUSTOM_CLIPROXY_TOKEN"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false
`,
      'utf8'
    );

    const result = runCcsxpAlias(['fix failing tests'], {
      ...process.env,
      CI: '1',
      NO_COLOR: '1',
      HOME: tmpHome,
      CCS_HOME: tmpHome,
      CCS_CODEX_PATH: fakeCodexPath,
      CCS_TEST_CODEX_ARGS_OUT: codexArgsLogPath,
      CCS_TEST_CODEX_ENV_OUT: codexEnvLogPath,
      CCS_TEST_CODEX_LOG_ENV_KEYS: 'CCS_CUSTOM_CLIPROXY_TOKEN',
    });

    expect(result.status).toBe(0);
    expect(readLoggedCodexCalls(codexArgsLogPath)).toEqual([
      ['--config', 'model_provider="cliproxy"', 'fix failing tests'],
    ]);
    const codexConfig = fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8');
    expect(codexConfig).toContain('env_key = "CCS_CUSTOM_CLIPROXY_TOKEN"');
    expect(readLoggedCodexEnv(codexEnvLogPath)).toEqual([
      {
        CODEX_HOME: codexHome,
        CODEX_CI: undefined,
        CODEX_MANAGED_BY_BUN: undefined,
        CODEX_THREAD_ID: undefined,
        ANTHROPIC_BASE_URL: undefined,
        CCS_CUSTOM_CLIPROXY_TOKEN: 'ccs-internal-managed',
        CCS_BROWSER_USER_DATA_DIR: undefined,
        CCS_BROWSER_PROFILE_DIR: undefined,
        CCS_BROWSER_DEVTOOLS_WS_URL: undefined,
      },
    ]);
  });

  it('keeps ccsxp native when the CCS default profile is a Claude account', () => {
    if (process.platform === 'win32') return;

    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      [
        'version: 2',
        'default: work',
        'accounts:',
        '  work:',
        '    created: "2026-01-01"',
        '    last_used: "2026-01-01"',
      ].join('\n')
    );

    const result = runCcsxpAlias(['fix failing tests'], {
      ...process.env,
      CI: '1',
      NO_COLOR: '1',
      HOME: tmpHome,
      CCS_HOME: tmpHome,
      CCS_CODEX_PATH: fakeCodexPath,
      CCS_TEST_CODEX_ARGS_OUT: codexArgsLogPath,
      CCS_TEST_CODEX_ENV_OUT: codexEnvLogPath,
      CCS_TEST_CODEX_LOG_CLIPROXY_API_KEY: '1',
    });

    expect(result.status).toBe(0);
    expect(readLoggedCodexCalls(codexArgsLogPath)).toEqual([
      ['--config', 'model_provider="cliproxy"', 'fix failing tests'],
    ]);
    expect(readLoggedCodexEnv(codexEnvLogPath)).toEqual([
      {
        CODEX_HOME: path.join(tmpHome, '.codex'),
        CODEX_CI: undefined,
        CODEX_MANAGED_BY_BUN: undefined,
        CODEX_THREAD_ID: undefined,
        ANTHROPIC_BASE_URL: undefined,
        CLIPROXY_API_KEY: 'ccs-internal-managed',
        CCS_BROWSER_USER_DATA_DIR: undefined,
        CCS_BROWSER_PROFILE_DIR: undefined,
        CCS_BROWSER_DEVTOOLS_WS_URL: undefined,
      },
    ]);
  });

  it('keeps implicit ccs --target codex launches native when the CCS default is a Claude account', () => {
    if (process.platform === 'win32') return;

    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      [
        'version: 2',
        'default: work',
        'accounts:',
        '  work:',
        '    created: "2026-01-01"',
        '    last_used: "2026-01-01"',
      ].join('\n')
    );

    const result = runCcs(['--target', 'codex'], {
      ...process.env,
      CI: '1',
      NO_COLOR: '1',
      HOME: tmpHome,
      CCS_HOME: tmpHome,
      CCS_CODEX_PATH: fakeCodexPath,
      CCS_TEST_CODEX_ARGS_OUT: codexArgsLogPath,
      CCS_TEST_CODEX_ENV_OUT: codexEnvLogPath,
      CCS_THINKING: '8192',
    });

    expect(result.status).toBe(0);
    expect(readLoggedCodexCalls(codexArgsLogPath)).toEqual([[]]);
    expect(readLoggedCodexEnv(codexEnvLogPath)).toEqual([
      {
        CODEX_HOME: undefined,
        CODEX_CI: undefined,
        CODEX_MANAGED_BY_BUN: undefined,
        CODEX_THREAD_ID: undefined,
        ANTHROPIC_BASE_URL: undefined,
        CCS_BROWSER_USER_DATA_DIR: undefined,
        CCS_BROWSER_PROFILE_DIR: undefined,
        CCS_BROWSER_DEVTOOLS_WS_URL: undefined,
      },
    ]);
  });

  it('still rejects an explicit Claude account profile on the Codex target', () => {
    if (process.platform === 'win32') return;

    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      [
        'version: 2',
        'accounts:',
        '  work:',
        '    created: "2026-01-01"',
        '    last_used: "2026-01-01"',
      ].join('\n')
    );

    const result = runCcs(['work', '--target', 'codex', 'fix failing tests'], {
      ...process.env,
      CI: '1',
      NO_COLOR: '1',
      CCS_HOME: tmpHome,
      CCS_CODEX_PATH: fakeCodexPath,
      CCS_TEST_CODEX_ARGS_OUT: codexArgsLogPath,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Codex CLI does not support Claude account-based profiles.');
    expect(result.stderr).toContain('CLIProxy Codex pool: ccs codex --target codex or ccsxp');
    expect(readLoggedCodexCalls(codexArgsLogPath)).toEqual([]);
  });

  it('rejects conflicting native provider config overrides for ccsxp', () => {
    if (process.platform === 'win32') return;

    const result = runCcsxpAlias(['--config', 'model_provider="openai"', '--version'], {
      ...process.env,
      CI: '1',
      NO_COLOR: '1',
      HOME: tmpHome,
      CCS_HOME: tmpHome,
      CCS_CODEX_PATH: fakeCodexPath,
      CCS_TEST_CODEX_ARGS_OUT: codexArgsLogPath,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ccsxp does not allow');
    expect(readLoggedCodexCalls(codexArgsLogPath)).toEqual([]);
  });

  it('rejects native profile selection flags for ccsxp', () => {
    if (process.platform === 'win32') return;

    const result = runCcsxpAlias(['--profile', 'other', '--version'], {
      ...process.env,
      CI: '1',
      NO_COLOR: '1',
      HOME: tmpHome,
      CCS_HOME: tmpHome,
      CCS_CODEX_PATH: fakeCodexPath,
      CCS_TEST_CODEX_ARGS_OUT: codexArgsLogPath,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ccsxp does not allow');
    expect(readLoggedCodexCalls(codexArgsLogPath)).toEqual([]);
  });

  it('honors CCSXP_CODEX_HOME for intentionally separate ccsxp history', () => {
    if (process.platform === 'win32') return;

    const explicitCodexHome = path.join(tmpHome, 'explicit-ccsxp-codex-home');
    const result = runCcsxpAlias(['--version'], {
      ...process.env,
      CI: '1',
      NO_COLOR: '1',
      CCS_HOME: tmpHome,
      CCS_CODEX_PATH: fakeCodexPath,
      CCS_TEST_CODEX_ENV_OUT: codexEnvLogPath,
      CCS_TEST_CODEX_VERSION: 'codex-cli 9.9.9-test',
      CCS_TEST_CODEX_LOG_CLIPROXY_API_KEY: '1',
      CODEX_HOME: path.join(tmpHome, 'inherited-codex-home'),
      CCSXP_CODEX_HOME: explicitCodexHome,
    });

    expect(result.status).toBe(0);
    expect(readLoggedCodexEnv(codexEnvLogPath)).toEqual([
      {
        CODEX_HOME: explicitCodexHome,
        CODEX_CI: undefined,
        CODEX_MANAGED_BY_BUN: undefined,
        CODEX_THREAD_ID: undefined,
        ANTHROPIC_BASE_URL: undefined,
        CLIPROXY_API_KEY: 'ccs-internal-managed',
        CCS_BROWSER_USER_DATA_DIR: undefined,
        CCS_BROWSER_PROFILE_DIR: undefined,
        CCS_BROWSER_DEVTOOLS_WS_URL: undefined,
      },
    ]);
  });

  it('fails with a clean CLI error when ccsxp receives a malformed --target flag', () => {
    if (process.platform === 'win32') return;

    const result = runCcsxpAlias(['--target'], {
      ...process.env,
      CI: '1',
      NO_COLOR: '1',
      CCS_HOME: tmpHome,
      CCS_CODEX_PATH: fakeCodexPath,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[X] --target requires a value (claude, droid, codex)');
    expect(result.stderr).not.toContain('at parseTargetFlags');
  });

  it('passes ccs codex --target codex --version through to the native Codex binary', () => {
    if (process.platform === 'win32') return;

    const result = runCcs(['codex', '--target', 'codex', '--version'], {
      ...process.env,
      CI: '1',
      NO_COLOR: '1',
      CCS_HOME: tmpHome,
      CCS_CODEX_PATH: fakeCodexPath,
      CCS_TEST_CODEX_ARGS_OUT: codexArgsLogPath,
      CCS_TEST_CODEX_VERSION: 'codex-cli 9.9.9-test',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('codex-cli 9.9.9-test');
    expect(readLoggedCodexCalls(codexArgsLogPath)).toEqual([['--version']]);
  });

  it('fails fast when native Codex reasoning overrides need unsupported --config support', () => {
    if (process.platform === 'win32') return;

    const result = runCcs(
      ['default', '--target', 'codex', '--effort', 'high', 'fix failing tests'],
      {
        ...process.env,
        CI: '1',
        NO_COLOR: '1',
        CCS_HOME: tmpHome,
        CCS_CODEX_PATH: fakeCodexPath,
        CCS_TEST_CODEX_ARGS_OUT: codexArgsLogPath,
        CCS_TEST_CODEX_CONFIG_OVERRIDE_STATUS: 'unsupported',
        CCS_TEST_CODEX_VERSION: 'codex-cli 9.9.9-test',
        CCS_TEST_CODEX_HELP: '  -p, --profile <CONFIG_PROFILE>\\n',
      }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Codex CLI (codex-cli 9.9.9-test)');
    expect(result.stderr).toContain('does not advertise --config overrides');
    const calls = readLoggedCodexCalls(codexArgsLogPath);
    expect(calls).toEqual([['-c', 'model="gpt-5"', '--version'], ['--help'], ['--version']]);
  });

  it('accepts native Codex reasoning overrides when the direct -c probe succeeds', () => {
    if (process.platform === 'win32') return;

    const result = runCcs(
      ['default', '--target', 'codex', '--effort', 'high', 'fix failing tests'],
      {
        ...process.env,
        CI: '1',
        NO_COLOR: '1',
        CCS_HOME: tmpHome,
        CCS_CODEX_PATH: fakeCodexPath,
        CCS_TEST_CODEX_ARGS_OUT: codexArgsLogPath,
        CCS_TEST_CODEX_VERSION: 'codex-cli 9.9.9-test',
        CCS_TEST_CODEX_HELP: '  -p, --profile <CONFIG_PROFILE>\\n',
      }
    );

    expect(result.status).toBe(0);
    expect(readLoggedCodexCalls(codexArgsLogPath)).toEqual([
      ['-c', 'model="gpt-5"', '--version'],
      ['-c', 'model_reasoning_effort="high"', 'fix failing tests'],
    ]);
  });

  it('reports unsupported generic settings profiles before Codex install guidance', () => {
    if (process.platform === 'win32') return;

    const settingsPath = path.join(ccsDir, 'myglm.settings.json');
    const configPath = path.join(ccsDir, 'config.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: 'https://example.invalid/anthropic',
            ANTHROPIC_AUTH_TOKEN: 'test-token',
            ANTHROPIC_MODEL: 'gpt-5.4',
          },
        },
        null,
        2
      )
    );
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          profiles: {
            myglm: settingsPath,
          },
        },
        null,
        2
      )
    );

    const result = runCcs(['myglm', '--target', 'codex', 'fix failing tests'], {
      ...process.env,
      CI: '1',
      NO_COLOR: '1',
      CCS_HOME: tmpHome,
      PATH: emptyPathDir,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Codex CLI currently supports native default sessions and Codex-routed CLIProxy sessions only.'
    );
    expect(result.stderr).not.toContain('Install a recent @openai/codex build');
  });
});
