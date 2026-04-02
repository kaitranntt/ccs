/**
 * Unit tests for Cursor daemon module
 */

import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import { spawn } from 'child_process';
import {
  getPidFromFile,
  writePidToFile,
  removePidFile,
  isDaemonRunning,
  getDaemonStatus,
  stopDaemon,
  startDaemon,
} from '../../../src/cursor/cursor-daemon';
import { getCcsDir } from '../../../src/utils/config-manager';
import { handleCursorCommand } from '../../../src/commands/cursor-command';
import {
  renderCursorHelp,
  renderCursorStatus,
} from '../../../src/commands/cursor-command-display';
import { loadCredentials } from '../../../src/cursor/cursor-auth';
import { DEFAULT_CURSOR_CONFIG } from '../../../src/config/unified-config-types';

// Test isolation
let originalCcsHome: string | undefined;
let tempDir: string;

beforeEach(() => {
  originalCcsHome = process.env.CCS_HOME;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-daemon-test-'));
  process.env.CCS_HOME = tempDir;
});

afterEach(() => {
  if (originalCcsHome !== undefined) {
    process.env.CCS_HOME = originalCcsHome;
  } else {
    delete process.env.CCS_HOME;
  }

  // Cleanup temp directory
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

// Use getCcsDir() for consistent path resolution with production code
const getTestCursorDir = () => path.join(getCcsDir(), 'cursor');

async function waitForProcessReady(pid: number): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      process.kill(pid, 0);

      if (process.platform !== 'linux') {
        return;
      }

      const commandLine = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, '').trim();
      if (commandLine.length > 0) {
        return;
      }
    } catch {
      // Process is still starting up.
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe('getPidFromFile', () => {
  it('returns null when no PID file exists', () => {
    expect(getPidFromFile()).toBeNull();
  });

  it('returns PID when valid PID file exists', () => {
    const dir = getTestCursorDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'daemon.pid'), '12345');

    expect(getPidFromFile()).toBe(12345);
  });

  it('returns null when PID file contains invalid content', () => {
    const dir = getTestCursorDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'daemon.pid'), 'not-a-number');

    expect(getPidFromFile()).toBeNull();
  });

  it('trims whitespace from PID file content', () => {
    const dir = getTestCursorDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'daemon.pid'), '  42  \n');

    expect(getPidFromFile()).toBe(42);
  });
});

describe('writePidToFile', () => {
  it('creates PID file with correct content', () => {
    writePidToFile(12345);

    const pidFile = path.join(getTestCursorDir(), 'daemon.pid');
    expect(fs.existsSync(pidFile)).toBe(true);
    expect(fs.readFileSync(pidFile, 'utf8')).toBe('12345');
  });

  it('creates cursor directory if it does not exist', () => {
    const dir = getTestCursorDir();
    expect(fs.existsSync(dir)).toBe(false);

    writePidToFile(999);

    expect(fs.existsSync(dir)).toBe(true);
  });

  it('overwrites existing PID file', () => {
    writePidToFile(111);
    writePidToFile(222);

    const pidFile = path.join(getTestCursorDir(), 'daemon.pid');
    expect(fs.readFileSync(pidFile, 'utf8')).toBe('222');
  });
});

describe('removePidFile', () => {
  it('removes existing PID file', () => {
    writePidToFile(12345);
    const pidFile = path.join(getTestCursorDir(), 'daemon.pid');
    expect(fs.existsSync(pidFile)).toBe(true);

    removePidFile();

    expect(fs.existsSync(pidFile)).toBe(false);
  });

  it('does not throw when PID file does not exist', () => {
    expect(() => removePidFile()).not.toThrow();
  });
});

describe('startDaemon', () => {
  it('rejects invalid port (0)', async () => {
    const result = await startDaemon({ port: 0 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid port');
  });

  it('rejects invalid port (65536)', async () => {
    const result = await startDaemon({ port: 65536 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid port');
  });

  it('rejects non-integer port', async () => {
    const result = await startDaemon({ port: 3.14 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid port');
  });
});

describe('isDaemonRunning', () => {
  it('returns false when no daemon is running on port', async () => {
    // Use a port that should not have anything running
    const result = await isDaemonRunning(19999);
    expect(result).toBe(false);
  });

  it('returns false when /health is 200 but service is not cursor-daemon', async () => {
    const server = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, service: 'not-cursor-daemon' }));
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    try {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Unable to resolve test server port');
      }

      const result = await isDaemonRunning(address.port);
      expect(result).toBe(false);
    } finally {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });
});

describe('getDaemonStatus', () => {
  it('returns status with running=false when no daemon running', async () => {
    const status = await getDaemonStatus(19999);
    expect(status.running).toBe(false);
    expect(status.port).toBe(19999);
    expect(status.pid).toBeUndefined();
  });

  it('returns status with pid when PID file exists but daemon not running', async () => {
    writePidToFile(99999);
    const status = await getDaemonStatus(19999);
    expect(status.running).toBe(false);
    expect(status.port).toBe(19999);
    expect(status.pid).toBeUndefined();
  });
});

describe('stopDaemon', () => {
  it('returns success when no PID file exists', async () => {
    const result = await stopDaemon();
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns success when PID refers to non-existent process', async () => {
    // Write a PID that doesn't exist
    writePidToFile(999999);
    const result = await stopDaemon();
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();

    // PID file should be removed
    const pidFile = path.join(getTestCursorDir(), 'daemon.pid');
    expect(fs.existsSync(pidFile)).toBe(false);
  });

  it('does not terminate unrelated process from stale PID file', async () => {
    const unrelatedProcess = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000);'], {
      detached: true,
      stdio: 'ignore',
    });
    unrelatedProcess.unref();

    const unrelatedPid = unrelatedProcess.pid;
    expect(unrelatedPid).toBeDefined();
    if (!unrelatedPid) {
      throw new Error('Failed to spawn unrelated process');
    }

    await waitForProcessReady(unrelatedPid);
    writePidToFile(unrelatedPid);

    try {
      const result = await stopDaemon();
      expect(result.success).toBe(true);

      // Unrelated process should still be alive.
      expect(() => process.kill(unrelatedPid, 0)).not.toThrow();
    } finally {
      try {
        process.kill(unrelatedPid, 'SIGTERM');
      } catch {
        // Process already exited.
      }
    }
  });

  it('refuses to stop when daemon ownership cannot be verified', async () => {
    const killSpy = spyOn(process, 'kill').mockImplementation(
      ((pid: number, signal?: NodeJS.Signals | number) => {
        if (pid === process.pid && signal === 0) {
          const err = new Error('EPERM') as NodeJS.ErrnoException;
          err.code = 'EPERM';
          throw err;
        }

        return true;
      }) as typeof process.kill
    );

    writePidToFile(process.pid);

    try {
      const result = await stopDaemon();

      expect(result.success).toBe(false);
      expect(result.error).toContain('unable to verify daemon ownership');
      expect(fs.existsSync(path.join(getTestCursorDir(), 'daemon.pid'))).toBe(true);
    } finally {
      killSpy.mockRestore();
      removePidFile();
    }
  });
});

describe('handleCursorCommand', () => {
  it('shows help when invoked without an admin subcommand', async () => {
    const originalLog = console.log;
    const originalError = console.error;
    const logs: string[] = [];
    const errors: string[] = [];

    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(' '));
    };
    console.error = (...args: unknown[]) => {
      errors.push(args.map((arg) => String(arg)).join(' '));
    };

    try {
      const exitCode = await handleCursorCommand([]);

      expect(exitCode).toBe(0);
      expect(errors).toHaveLength(0);
      expect(logs.some((line) => line.includes('Cursor IDE Integration'))).toBe(true);
      expect(logs.some((line) => line.includes('Usage: ccs cursor <subcommand>'))).toBe(true);
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
  });

  it('returns exit code 1 for unknown subcommand', async () => {
    const exitCode = await handleCursorCommand(['nonexistent']);
    expect(exitCode).toBe(1);
  });

  it('supports manual auth import from CLI flags', async () => {
    const token = 'a'.repeat(60);
    const machineId = '1234567890abcdef1234567890abcdef';

    const exitCode = await handleCursorCommand([
      'auth',
      '--manual',
      '--token',
      token,
      '--machine-id',
      machineId,
    ]);

    expect(exitCode).toBe(0);

    const credentials = loadCredentials();
    expect(credentials).not.toBeNull();
    expect(credentials?.authMethod).toBe('manual');
    expect(credentials?.machineId).toBe(machineId);
  });
});

describe('renderCursorStatus', () => {
  it('shows runtime endpoint guidance when Cursor is ready', () => {
    const originalLog = console.log;
    const logs: string[] = [];

    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(' '));
    };

    try {
      renderCursorStatus(
        { ...DEFAULT_CURSOR_CONFIG, enabled: true, port: 20129 },
        {
          authenticated: true,
          expired: false,
          tokenAge: 0,
          credentials: {
            accessToken: 'a'.repeat(60),
            machineId: '1234567890abcdef1234567890abcdef',
            authMethod: 'manual',
            importedAt: new Date().toISOString(),
          },
        },
        { running: true, port: 20129, pid: 1234 }
      );

      expect(logs.some((line) => line.includes('OpenAI base:     http://127.0.0.1:20129/v1'))).toBe(
        true
      );
      expect(
        logs.some((line) => line.includes('Chat route:      http://127.0.0.1:20129/v1/chat/completions'))
      ).toBe(true);
      expect(
        logs.some((line) => line.includes('Anthropic base:  http://127.0.0.1:20129'))
      ).toBe(true);
      expect(
        logs.some((line) => line.includes(`Raw settings:    ${getCcsDir()}/cursor.settings.json`))
      ).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  it('shows runtime guidance even when setup is incomplete', () => {
    const originalLog = console.log;
    const logs: string[] = [];

    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(' '));
    };

    try {
      renderCursorStatus(
        { ...DEFAULT_CURSOR_CONFIG, enabled: false, port: 20129 },
        {
          authenticated: false,
          expired: false,
          tokenAge: undefined,
          credentials: undefined,
        },
        { running: false, port: 20129, pid: undefined }
      );

      expect(logs.some((line) => line.includes('OpenAI base:     http://127.0.0.1:20129/v1'))).toBe(
        true
      );
      expect(logs.some((line) => line.includes('Next steps:'))).toBe(true);
      expect(logs.some((line) => line.includes('  - Help:        ccs cursor help'))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  it('falls back to ~/.ccs in status output when no CCS override is active', () => {
    const originalLog = console.log;
    const originalCcsHomeValue = process.env.CCS_HOME;
    const logs: string[] = [];

    delete process.env.CCS_HOME;
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(' '));
    };

    try {
      renderCursorStatus(
        { ...DEFAULT_CURSOR_CONFIG, enabled: true, port: 20129 },
        {
          authenticated: true,
          expired: false,
          tokenAge: 0,
          credentials: {
            accessToken: 'a'.repeat(60),
            machineId: '1234567890abcdef1234567890abcdef',
            authMethod: 'manual',
            importedAt: new Date().toISOString(),
          },
        },
        { running: true, port: 20129, pid: 1234 }
      );

      expect(logs.some((line) => line.includes('Raw settings:    ~/.ccs/cursor.settings.json'))).toBe(
        true
      );
    } finally {
      if (originalCcsHomeValue !== undefined) {
        process.env.CCS_HOME = originalCcsHomeValue;
      } else {
        delete process.env.CCS_HOME;
      }
      console.log = originalLog;
    }
  });
});

describe('renderCursorHelp', () => {
  it('shows bare ccs cursor as the runtime entrypoint', () => {
    const originalLog = console.log;
    const logs: string[] = [];

    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(' '));
    };

    try {
      const exitCode = renderCursorHelp();

      expect(exitCode).toBe(0);
      expect(logs.some((line) => line.includes('Usage: ccs cursor <subcommand>'))).toBe(true);
      expect(
        logs.some((line) => line.includes('ccs cursor [claude args]'))
      ).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });
});
