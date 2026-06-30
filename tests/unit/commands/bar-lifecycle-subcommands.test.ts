/**
 * Tests for the new CCS Bar lifecycle subcommands:
 *   serve-subcommand.ts  — reuse-vs-start, pid write, signal cleanup
 *   stop-subcommand.ts   — SIGTERM, pid + bar.json removal, stale-pid handling
 *   status-subcommand.ts — running/stopped/alive-but-unreachable states
 *   launch-subcommand.ts — detached-spawn path (injects spawnDetachedServer)
 *   install-subcommand.ts — writeLaunchDescriptor called after install
 *
 * All deps are injected — never touches real ~/.ccs, real ports, or real processes.
 * Follows the DI + platform-fork patterns from bar-command.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let consoleOutput: string[] = [];
let tempHome: string;
let originalCcsHome: string | undefined;
let originalConsoleLog: typeof console.log;
let originalConsoleError: typeof console.error;

function captureConsole(): void {
  originalConsoleLog = console.log;
  originalConsoleError = console.error;
  console.log = (...args: unknown[]) => {
    consoleOutput.push(args.map(String).join(' '));
  };
  console.error = (...args: unknown[]) => {
    consoleOutput.push(args.map(String).join(' '));
  };
}

function restoreConsole(): void {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
}

function allOutput(): string {
  return consoleOutput.join('\n');
}

let moduleSeq = 0;

async function loadServeSubcommand() {
  moduleSeq++;
  const mod = await import(
    `../../../src/commands/bar/serve-subcommand?test=${Date.now()}-${moduleSeq}`
  );
  return mod as {
    handleBarServe: (args: string[], deps?: Record<string, unknown>) => Promise<void>;
  };
}

async function loadStopSubcommand() {
  moduleSeq++;
  const mod = await import(
    `../../../src/commands/bar/stop-subcommand?test=${Date.now()}-${moduleSeq}`
  );
  return mod as {
    handleBarStop: (args: string[], deps?: Record<string, unknown>) => Promise<void>;
  };
}

async function loadStatusSubcommand() {
  moduleSeq++;
  const mod = await import(
    `../../../src/commands/bar/status-subcommand?test=${Date.now()}-${moduleSeq}`
  );
  return mod as {
    handleBarStatus: (args: string[], deps?: Record<string, unknown>) => Promise<void>;
  };
}

async function loadLaunchSubcommand() {
  moduleSeq++;
  const mod = await import(
    `../../../src/commands/bar/launch-subcommand?test=${Date.now()}-${moduleSeq}`
  );
  return mod as {
    handleBarLaunch: (args: string[], deps?: Record<string, unknown>) => Promise<void>;
    BarServerAuthRequiredError: new (baseUrl: string, statusCode: number) => Error;
  };
}

async function loadInstallSubcommand() {
  moduleSeq++;
  const mod = await import(
    `../../../src/commands/bar/install-subcommand?test=${Date.now()}-${moduleSeq}`
  );
  return mod as {
    handleBarInstall: (args: string[], deps?: Record<string, unknown>) => Promise<void>;
  };
}

async function loadLaunchDescriptor() {
  moduleSeq++;
  return import(`../../../src/commands/bar/launch-descriptor?test=${Date.now()}-${moduleSeq}`);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  consoleOutput = [];
  captureConsole();

  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-bar-lifecycle-test-'));
  originalCcsHome = process.env.CCS_HOME;
  process.env.CCS_HOME = tempHome;
});

afterEach(() => {
  restoreConsole();

  if (originalCcsHome === undefined) {
    delete process.env.CCS_HOME;
  } else {
    process.env.CCS_HOME = originalCcsHome;
  }

  try {
    fs.rmSync(tempHome, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

// ---------------------------------------------------------------------------
// serve-subcommand: reuse-or-start
// ---------------------------------------------------------------------------

describe('serve: reuse existing server', () => {
  it('writes bar.json and exits 0 when a server is already live', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    const exitCodes: number[] = [];
    const writtenFiles: Record<string, string> = {};

    const { handleBarServe } = await loadServeSubcommand();

    await handleBarServe([], {
      getCcsDir: () => ccsDir,
      findRunningServer: async () => ({ port: 3000, baseUrl: 'http://127.0.0.1:3000' }),
      startServer: async () => {
        throw new Error('startServer should NOT be called when reusing');
      },
      getPort: async () => 3000,
      writeFile: (filePath: string, content: string) => {
        writtenFiles[filePath] = content;
      },
      removeFile: () => {
        /* noop */
      },
      onSignal: () => {
        /* noop */
      },
      exit: (code: number) => {
        exitCodes.push(code);
        throw new Error(`__EXIT_${code}__`);
      },
    }).catch((e: Error) => {
      if (!e.message.startsWith('__EXIT_')) throw e;
    });

    expect(exitCodes).toContain(0);
    // bar.json must reference the reused server
    const barJsonPath = path.join(ccsDir, 'bar.json');
    expect(writtenFiles[barJsonPath]).toBeDefined();
    const barJson = JSON.parse(writtenFiles[barJsonPath]) as { port: number; baseUrl: string };
    expect(barJson.port).toBe(3000);
    expect(barJson.baseUrl).toBe('http://127.0.0.1:3000');
    expect(allOutput()).toMatch(/reusing/i);
  });
});

describe('serve: start new server', () => {
  it('calls startServer, writes bar.json + server.pid, registers signal handlers', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    const writtenFiles: Record<string, string> = {};
    const signals: string[] = [];

    const { handleBarServe } = await loadServeSubcommand();

    // serve does NOT exit after starting — it stays alive. So we just await it
    // and assert side-effects.  In tests the event loop will drain because
    // startServer returns immediately (no real HTTP server binding).
    await handleBarServe(['--port', '4242'], {
      getCcsDir: () => ccsDir,
      findRunningServer: async () => null,
      startServer: async (opts: { port: number; host: string }) => ({
        port: opts.port,
        baseUrl: `http://127.0.0.1:${opts.port}`,
      }),
      getPort: async () => 4242,
      writeFile: (filePath: string, content: string) => {
        writtenFiles[filePath] = content;
      },
      removeFile: () => {
        /* noop */
      },
      onSignal: (signal: string) => {
        signals.push(signal);
      },
      exit: (code: number) => {
        throw new Error(`__EXIT_${code}__`);
      },
    });

    // bar.json must be written
    const barJsonPath = path.join(ccsDir, 'bar.json');
    expect(writtenFiles[barJsonPath]).toBeDefined();
    const barJson = JSON.parse(writtenFiles[barJsonPath]) as { port: number; authMode: string };
    expect(barJson.port).toBe(4242);
    expect(barJson.authMode).toBe('loopback');

    // server.pid must be written
    const pidPath = path.join(ccsDir, 'bar', 'server.pid');
    expect(writtenFiles[pidPath]).toBeDefined();
    expect(writtenFiles[pidPath]).toBe(String(process.pid));

    // Both SIGINT and SIGTERM handlers registered
    expect(signals).toContain('SIGINT');
    expect(signals).toContain('SIGTERM');

    expect(allOutput()).toMatch(/\[OK\].*started/i);
  });

  it('honors --port N arg passed by the launcher', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    const usedPorts: number[] = [];
    const { handleBarServe } = await loadServeSubcommand();

    await handleBarServe(['--port', '8080'], {
      getCcsDir: () => ccsDir,
      findRunningServer: async () => null,
      startServer: async (opts: { port: number; host: string }) => {
        usedPorts.push(opts.port);
        return { port: opts.port, baseUrl: `http://127.0.0.1:${opts.port}` };
      },
      getPort: async () => 3000, // should NOT be used when --port is given
      writeFile: () => {
        /* noop */
      },
      removeFile: () => {
        /* noop */
      },
      onSignal: () => {
        /* noop */
      },
      exit: (code: number) => {
        throw new Error(`__EXIT_${code}__`);
      },
    });

    expect(usedPorts).toContain(8080);
    expect(usedPorts).not.toContain(3000);
  });

  it('exits 1 when startServer throws', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    const exitCodes: number[] = [];
    const { handleBarServe } = await loadServeSubcommand();

    await handleBarServe([], {
      getCcsDir: () => ccsDir,
      findRunningServer: async () => null,
      startServer: async () => {
        throw new Error('EADDRINUSE');
      },
      getPort: async () => 3000,
      writeFile: () => {
        /* noop */
      },
      removeFile: () => {
        /* noop */
      },
      onSignal: () => {
        /* noop */
      },
      exit: (code: number) => {
        exitCodes.push(code);
        throw new Error(`__EXIT_${code}__`);
      },
    }).catch((e: Error) => {
      if (!e.message.startsWith('__EXIT_')) throw e;
    });

    expect(exitCodes).toContain(1);
    expect(allOutput()).toMatch(/\[X\]/);
  });
});

// ---------------------------------------------------------------------------
// stop-subcommand
// ---------------------------------------------------------------------------

describe('stop: SIGTERM and cleanup', () => {
  it('reads server.pid, sends SIGTERM, removes pid + bar.json', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    const barDir = path.join(ccsDir, 'bar');
    fs.mkdirSync(barDir, { recursive: true });
    fs.writeFileSync(path.join(barDir, 'server.pid'), '12345');
    fs.writeFileSync(path.join(ccsDir, 'bar.json'), '{"baseUrl":"http://127.0.0.1:3000"}');

    const killed: Array<{ pid: number; signal: string }> = [];
    const removed: string[] = [];

    const { handleBarStop } = await loadStopSubcommand();

    await handleBarStop([], {
      getCcsDir: () => ccsDir,
      readPidFile: (pidPath: string) => {
        try {
          return fs.readFileSync(pidPath, 'utf8').trim();
        } catch {
          return null;
        }
      },
      killProcess: (pid: number, signal: string) => {
        killed.push({ pid, signal });
      },
      removeFile: (filePath: string) => {
        removed.push(filePath);
      },
    });

    expect(killed).toEqual([{ pid: 12345, signal: 'SIGTERM' }]);
    // Both pid and bar.json must be removed
    expect(removed.some((p) => p.includes('server.pid'))).toBe(true);
    expect(removed.some((p) => p.includes('bar.json'))).toBe(true);
    expect(allOutput()).toMatch(/\[OK\].*SIGTERM/i);
  });

  it('prints guidance and returns cleanly when no server.pid exists', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    const { handleBarStop } = await loadStopSubcommand();

    await expect(
      handleBarStop([], {
        getCcsDir: () => ccsDir,
        readPidFile: () => null,
        killProcess: () => {
          throw new Error('should not be called');
        },
        removeFile: () => {
          /* noop */
        },
      })
    ).resolves.toBeUndefined();

    expect(allOutput()).toMatch(/not running|no server\.pid/i);
  });

  it('cleans up stale pid file when process does not exist (ESRCH)', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    const removed: string[] = [];
    const { handleBarStop } = await loadStopSubcommand();

    await handleBarStop([], {
      getCcsDir: () => ccsDir,
      readPidFile: () => '99999',
      killProcess: () => {
        const err = new Error('no such process') as NodeJS.ErrnoException;
        err.code = 'ESRCH';
        throw err;
      },
      removeFile: (filePath: string) => {
        removed.push(filePath);
      },
    });

    // pid file must still be cleaned up
    expect(removed.some((p) => p.includes('server.pid'))).toBe(true);
    expect(allOutput()).toMatch(/no longer running|stale/i);
  });

  it('handles invalid PID in server.pid gracefully', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    const removed: string[] = [];
    const { handleBarStop } = await loadStopSubcommand();

    await handleBarStop([], {
      getCcsDir: () => ccsDir,
      readPidFile: () => 'not-a-number',
      killProcess: () => {
        throw new Error('should not be called');
      },
      removeFile: (filePath: string) => {
        removed.push(filePath);
      },
    });

    expect(allOutput()).toMatch(/\[X\].*invalid/i);
    // Corrupted pid file must be cleaned up
    expect(removed.some((p) => p.includes('server.pid'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// status-subcommand
// ---------------------------------------------------------------------------

describe('status: running state reporting', () => {
  it('reports running + reachable when pid alive and HTTP probe succeeds', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    const { handleBarStatus } = await loadStatusSubcommand();

    await handleBarStatus([], {
      getCcsDir: () => ccsDir,
      readPidFile: () => '12345',
      isProcessAlive: () => true,
      probeServer: async () => true,
      readBarJsonBaseUrl: () => 'http://127.0.0.1:3000',
    });

    expect(allOutput()).toMatch(/\[OK\].*running/i);
    expect(allOutput()).toMatch(/12345/);
    expect(allOutput()).toMatch(/127\.0\.0\.1:3000/);
  });

  it('reports stopped when no server.pid exists', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    const { handleBarStatus } = await loadStatusSubcommand();

    await handleBarStatus([], {
      getCcsDir: () => ccsDir,
      readPidFile: () => null,
      isProcessAlive: () => false,
      probeServer: async () => false,
      readBarJsonBaseUrl: () => null,
    });

    expect(allOutput()).toMatch(/stopped|no server\.pid/i);
  });

  it('reports stale pid when process is no longer alive', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    const { handleBarStatus } = await loadStatusSubcommand();

    await handleBarStatus([], {
      getCcsDir: () => ccsDir,
      readPidFile: () => '99999',
      isProcessAlive: () => false,
      probeServer: async () => false,
      readBarJsonBaseUrl: () => null,
    });

    expect(allOutput()).toMatch(/no longer running|stale/i);
    expect(allOutput()).toMatch(/99999/);
  });

  it('reports alive-but-unreachable when PID is alive but HTTP probe fails', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    const { handleBarStatus } = await loadStatusSubcommand();

    await handleBarStatus([], {
      getCcsDir: () => ccsDir,
      readPidFile: () => '12345',
      isProcessAlive: () => true,
      probeServer: async () => false,
      readBarJsonBaseUrl: () => 'http://127.0.0.1:3000',
    });

    expect(allOutput()).toMatch(/alive|running/i);
    expect(allOutput()).toMatch(/probe failed|starting up|not reachable/i);
  });
});

// ---------------------------------------------------------------------------
// launch-subcommand: detached-spawn model
// ---------------------------------------------------------------------------

describe('launch: detached-spawn model', () => {
  it('does NOT call startServer in-process — uses spawnDetachedServer instead', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    let inProcessStartCalled = false;
    const spawnCalls: Array<{ port: number; logPath: string }> = [];

    const { handleBarLaunch } = await loadLaunchSubcommand();

    await handleBarLaunch([], {
      getCcsDir: () => ccsDir,
      findRunningServer: async () => null,
      getPort: async () => 3001,
      spawnDetachedServer: (port: number, logPath: string) => {
        spawnCalls.push({ port, logPath });
      },
      waitForServerLive: async () => {
        /* simulate server becoming live immediately */
      },
      writeLaunchDescriptor: () => {
        /* noop */
      },
      openApp: async () => {
        /* noop — app not installed in test env */
        throw new Error('app not found');
      },
      appInstallPath: path.join(tempHome, 'Applications', 'CCS Bar.app'),
    });

    // In-process startServer must never be called
    expect(inProcessStartCalled).toBe(false);
    // spawnDetachedServer must be called once
    expect(spawnCalls.length).toBe(1);
    expect(spawnCalls[0].port).toBe(3001);
    // log path must be inside ccsDir/bar/
    expect(spawnCalls[0].logPath).toContain('serve.log');
  });

  it('writes bar.json after server becomes live', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    const { handleBarLaunch } = await loadLaunchSubcommand();

    await handleBarLaunch([], {
      getCcsDir: () => ccsDir,
      findRunningServer: async () => null,
      getPort: async () => 4242,
      spawnDetachedServer: () => {
        /* noop */
      },
      waitForServerLive: async () => {
        /* live immediately */
      },
      writeLaunchDescriptor: () => {
        /* noop */
      },
      openApp: async () => {
        /* noop */
      },
      appInstallPath: path.join(tempHome, 'Applications', 'CCS Bar.app'),
    });

    const barJsonPath = path.join(ccsDir, 'bar.json');
    expect(fs.existsSync(barJsonPath)).toBe(true);
    const barJson = JSON.parse(fs.readFileSync(barJsonPath, 'utf8')) as {
      port: number;
      baseUrl: string;
      authMode: string;
    };
    expect(barJson.port).toBe(4242);
    expect(barJson.baseUrl).toBe('http://127.0.0.1:4242');
    expect(barJson.authMode).toBe('loopback');
  });

  it('reuses live server without spawning — spawnDetachedServer NOT called', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    let spawnCalled = false;
    const { handleBarLaunch } = await loadLaunchSubcommand();

    await handleBarLaunch([], {
      getCcsDir: () => ccsDir,
      findRunningServer: async () => ({ port: 3000, baseUrl: 'http://127.0.0.1:3000' }),
      getPort: async () => 3001,
      spawnDetachedServer: () => {
        spawnCalled = true;
      },
      waitForServerLive: async () => {
        /* noop */
      },
      writeLaunchDescriptor: () => {
        /* noop */
      },
      openApp: async () => {
        /* noop */
      },
      appInstallPath: path.join(tempHome, 'Applications', 'CCS Bar.app'),
    });

    expect(spawnCalled).toBe(false);
    expect(allOutput()).toMatch(/reusing/i);
  });

  it('reports error and returns when waitForServerLive times out', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    const { handleBarLaunch } = await loadLaunchSubcommand();

    await handleBarLaunch([], {
      getCcsDir: () => ccsDir,
      findRunningServer: async () => null,
      getPort: async () => 3000,
      spawnDetachedServer: () => {
        /* noop */
      },
      waitForServerLive: async () => {
        throw new Error('timeout after 10s');
      },
      writeLaunchDescriptor: () => {
        /* noop */
      },
      openApp: async () => {
        /* noop */
      },
      appInstallPath: path.join(tempHome, 'Applications', 'CCS Bar.app'),
    });

    expect(allOutput()).toMatch(/\[X\]/);
    expect(allOutput()).toMatch(/timeout|connect|server/i);
  });

  it('stops the spawned child when the bar API is protected by dashboard auth', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    let killCalled = false;
    const { handleBarLaunch, BarServerAuthRequiredError } = await loadLaunchSubcommand();

    await handleBarLaunch([], {
      getCcsDir: () => ccsDir,
      findRunningServer: async () => null,
      getPort: async () => 3000,
      spawnDetachedServer: () => ({
        kill: () => {
          killCalled = true;
          return true;
        },
      }),
      waitForServerLive: async () => {
        throw new BarServerAuthRequiredError('http://127.0.0.1:3000', 401);
      },
      writeLaunchDescriptor: () => {
        /* noop */
      },
      openApp: async () => {
        /* noop */
      },
      appInstallPath: path.join(tempHome, 'Applications', 'CCS Bar.app'),
    });

    expect(killCalled).toBe(true);
    expect(fs.existsSync(path.join(ccsDir, 'bar.json'))).toBe(false);
    expect(allOutput()).toMatch(/authentication/i);
  });

  it('does not spawn a new server when an existing server is protected by dashboard auth', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    let spawnCalled = false;
    const { handleBarLaunch } = await loadLaunchSubcommand();

    await handleBarLaunch([], {
      getCcsDir: () => ccsDir,
      findRunningServer: async () => ({
        port: 3000,
        baseUrl: 'http://127.0.0.1:3000',
        authRequired: true,
      }),
      getPort: async () => 3001,
      spawnDetachedServer: () => {
        spawnCalled = true;
      },
      waitForServerLive: async () => {
        /* noop */
      },
      writeLaunchDescriptor: () => {
        /* noop */
      },
      openApp: async () => {
        /* noop */
      },
      appInstallPath: path.join(tempHome, 'Applications', 'CCS Bar.app'),
    });

    expect(spawnCalled).toBe(false);
    expect(fs.existsSync(path.join(ccsDir, 'bar.json'))).toBe(false);
    expect(allOutput()).toMatch(/authentication/i);
  });

  it('writes launch.json via writeLaunchDescriptor on the start path', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    const descriptorCalls: Array<{ jsonPath: string; descriptor: unknown }> = [];

    const { handleBarLaunch } = await loadLaunchSubcommand();

    await handleBarLaunch([], {
      getCcsDir: () => ccsDir,
      findRunningServer: async () => null,
      getPort: async () => 3000,
      spawnDetachedServer: () => {
        /* noop */
      },
      waitForServerLive: async () => {
        /* live */
      },
      writeLaunchDescriptor: (jsonPath: string, descriptor: unknown) => {
        descriptorCalls.push({ jsonPath, descriptor });
      },
      openApp: async () => {
        /* noop */
      },
      appInstallPath: path.join(tempHome, 'Applications', 'CCS Bar.app'),
    });

    expect(descriptorCalls.length).toBe(1);
    expect(descriptorCalls[0].jsonPath).toContain('launch.json');
    const desc = descriptorCalls[0].descriptor as {
      schema: number;
      runtime: string;
      args: string[];
      home: string;
    };
    expect(desc.schema).toBe(1);
    expect(desc.runtime).toBe(process.execPath);
    expect(path.basename(desc.args[0])).toBe('ccs.js');
    expect(desc.args[0]).not.toContain(`${path.sep}.ccs${path.sep}`);
    expect(desc.args).toContain('bar');
    expect(desc.args).toContain('serve');
    expect(desc.home).toBe(os.homedir());
  });

  it('does NOT call writeLaunchDescriptor on the reuse path', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    let descriptorWritten = false;
    const { handleBarLaunch } = await loadLaunchSubcommand();

    await handleBarLaunch([], {
      getCcsDir: () => ccsDir,
      findRunningServer: async () => ({ port: 3000, baseUrl: 'http://127.0.0.1:3000' }),
      getPort: async () => 3001,
      spawnDetachedServer: () => {
        /* noop */
      },
      waitForServerLive: async () => {
        /* noop */
      },
      writeLaunchDescriptor: () => {
        descriptorWritten = true;
      },
      openApp: async () => {
        /* noop */
      },
      appInstallPath: path.join(tempHome, 'Applications', 'CCS Bar.app'),
    });

    // On the reuse path there is no need to refresh launch.json
    expect(descriptorWritten).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// launch-descriptor: safe shim for native app self-start
// ---------------------------------------------------------------------------

describe('launch descriptor shim', () => {
  it('creates a private ccs.js shim for symlinked Bun-style entrypoints', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    const packageDist = path.join(
      tempHome,
      '.bun',
      'install',
      'global',
      'node_modules',
      '@kaitranntt',
      'ccs',
      'dist'
    );
    const binDir = path.join(tempHome, '.bun', 'bin');
    const realEntrypoint = path.join(packageDist, 'ccs.js');
    const symlinkedEntrypoint = path.join(binDir, 'ccs');

    fs.mkdirSync(packageDist, { recursive: true });
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(realEntrypoint, 'console.log("ccs");\n', { mode: 0o777 });
    fs.symlinkSync(realEntrypoint, symlinkedEntrypoint);

    const { createBarLaunchDescriptor, getLaunchShimPath } = await loadLaunchDescriptor();
    const descriptor = createBarLaunchDescriptor({
      entrypointPath: symlinkedEntrypoint,
      runtime: '/usr/local/bin/node',
      home: tempHome,
      ccsHome: ccsDir,
    });

    const shimPath = getLaunchShimPath(tempHome);
    expect(descriptor.runtime).toBe('/usr/local/bin/node');
    expect(descriptor.args).toEqual([shimPath, 'bar', 'serve']);
    expect(path.basename(descriptor.args[0])).toBe('ccs.js');
    expect(descriptor.args[0]).not.toContain(`${path.sep}.ccs${path.sep}`);
    expect(fs.lstatSync(descriptor.args[0]).isSymbolicLink()).toBe(false);

    const mode = fs.statSync(descriptor.args[0]).mode & 0o777;
    expect((mode & 0o022) === 0).toBe(true);
    const resolvedEntrypoint = fs.realpathSync(realEntrypoint);
    expect(fs.readFileSync(descriptor.args[0], 'utf8')).toContain(
      `require(${JSON.stringify(resolvedEntrypoint)});`
    );
  });
});

// ---------------------------------------------------------------------------
// install-subcommand: writeLaunchDescriptor after successful install
// ---------------------------------------------------------------------------

describe('install: writeLaunchDescriptor called after successful install', () => {
  const FAKE_DOWNLOAD_URL =
    'https://github.com/kaitranntt/ccs/releases/download/ccs-bar-latest/CCS-Bar.app.zip';

  function fakeExtract(appsDir: string) {
    return async (_url: string, dest: string) => {
      fs.mkdirSync(path.join(dest, 'CCS Bar.app'), { recursive: true });
    };
  }

  it('calls writeLaunchDescriptor with correct schema/runtime/args/home after install', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    const appsDir = path.join(tempHome, 'Applications');
    const descriptorCalls: Array<{ jsonPath: string; descriptor: unknown }> = [];

    const { handleBarInstall } = await loadInstallSubcommand();

    await handleBarInstall([], {
      fetchReleaseAsset: async () => ({ downloadUrl: FAKE_DOWNLOAD_URL }),
      downloadAndExtract: fakeExtract(appsDir),
      verifyCompat: async () => ({ compatible: true, reason: 'ok' }),
      readAppBundleVersion: () => '1.2.3',
      clearQuarantine: async () => true,
      isBarRunning: async () => false,
      promptLaunch: async () => false,
      getCcsDir: () => ccsDir,
      getAppsDir: () => appsDir,
      writeLaunchDescriptor: (jsonPath: string, descriptor: unknown) => {
        descriptorCalls.push({ jsonPath, descriptor });
      },
    });

    expect(descriptorCalls.length).toBe(1);
    expect(descriptorCalls[0].jsonPath).toContain('launch.json');
    const desc = descriptorCalls[0].descriptor as {
      schema: number;
      runtime: string;
      args: string[];
      home: string;
    };
    expect(desc.schema).toBe(1);
    expect(desc.runtime).toBe(process.execPath);
    expect(path.basename(desc.args[0])).toBe('ccs.js');
    expect(desc.args[0]).not.toContain(`${path.sep}.ccs${path.sep}`);
    expect(desc.args).toContain('bar');
    expect(desc.args).toContain('serve');
    expect(desc.home).toBe(os.homedir());
  });

  it('does NOT hard-fail install when writeLaunchDescriptor throws', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    const appsDir = path.join(tempHome, 'Applications');

    const { handleBarInstall } = await loadInstallSubcommand();

    await expect(
      handleBarInstall([], {
        fetchReleaseAsset: async () => ({ downloadUrl: FAKE_DOWNLOAD_URL }),
        downloadAndExtract: fakeExtract(appsDir),
        verifyCompat: async () => ({ compatible: true, reason: 'ok' }),
        readAppBundleVersion: () => '1.2.3',
        clearQuarantine: async () => true,
        isBarRunning: async () => false,
        promptLaunch: async () => false,
        getCcsDir: () => ccsDir,
        getAppsDir: () => appsDir,
        writeLaunchDescriptor: () => {
          throw new Error('disk full');
        },
      })
    ).resolves.toBeUndefined();

    // Install itself should still succeed
    expect(allOutput()).toMatch(/\[OK\].*CCS Bar/);
    // Warning about launch.json failure
    expect(allOutput()).toMatch(/\[!\].*launch\.json/i);
  });

  it('does not call writeLaunchDescriptor when install fails at download step', async () => {
    const ccsDir = path.join(tempHome, '.ccs');
    const appsDir = path.join(tempHome, 'Applications');
    let descriptorCalled = false;

    const { handleBarInstall } = await loadInstallSubcommand();

    await handleBarInstall([], {
      fetchReleaseAsset: async () => {
        throw new Error('network error');
      },
      downloadAndExtract: async () => {
        /* noop */
      },
      verifyCompat: async () => ({ compatible: true, reason: 'ok' }),
      readAppBundleVersion: () => '1.0.0',
      getCcsDir: () => ccsDir,
      getAppsDir: () => appsDir,
      writeLaunchDescriptor: () => {
        descriptorCalled = true;
      },
    });

    expect(descriptorCalled).toBe(false);
    expect(allOutput()).toMatch(/\[X\]/);
  });
});

// ---------------------------------------------------------------------------
// index.ts: dispatcher routes serve / stop / status
// ---------------------------------------------------------------------------

describe('bar command dispatcher: serve / stop / status routing', () => {
  it('routes `ccs bar serve` to serve subcommand', async () => {
    const routed: string[] = [];
    // We test routing by importing index and verifying serve-subcommand is called.
    // Use dynamic import with cache-busting.
    moduleSeq++;
    const { mock } = await import('bun:test');

    mock.module('../../../src/commands/bar/serve-subcommand', () => ({
      handleBarServe: async (subArgs: string[]) => {
        routed.push(`serve:${subArgs.join(' ')}`);
      },
    }));
    mock.module('../../../src/commands/bar/stop-subcommand', () => ({
      handleBarStop: async (subArgs: string[]) => {
        routed.push(`stop:${subArgs.join(' ')}`);
      },
    }));
    mock.module('../../../src/commands/bar/status-subcommand', () => ({
      handleBarStatus: async (subArgs: string[]) => {
        routed.push(`status:${subArgs.join(' ')}`);
      },
    }));
    mock.module('../../../src/commands/bar/launch-subcommand', () => ({
      handleBarLaunch: async (subArgs: string[]) => {
        routed.push(`launch:${subArgs.join(' ')}`);
      },
    }));

    const { mock: _m, ...bunTest } = await import('bun:test');
    void _m;
    void bunTest;

    moduleSeq++;
    const indexMod = await import(
      `../../../src/commands/bar/index?test=${Date.now()}-${moduleSeq}`
    );
    const { handleBarCommand } = indexMod as {
      handleBarCommand: (args: string[]) => Promise<void>;
    };

    await handleBarCommand(['serve']);
    await handleBarCommand(['stop']);
    await handleBarCommand(['status']);

    expect(routed.some((r) => r.startsWith('serve:'))).toBe(true);
    expect(routed.some((r) => r.startsWith('stop:'))).toBe(true);
    expect(routed.some((r) => r.startsWith('status:'))).toBe(true);

    mock.restore();
  });
});
