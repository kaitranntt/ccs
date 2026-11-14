import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import { isDaemonRunning, startDaemon, stopDaemon } from '../../../src/copilot/copilot-daemon';
import { DEFAULT_COPILOT_CONFIG } from '../../../src/config/unified-config-types';
import { getCcsDir } from '../../../src/utils/config-manager';

const activeServers: http.Server[] = [];
let originalCcsHome: string | undefined;
let tempDir: string;

async function waitForProcessCommandLine(pid: number): Promise<void> {
  const procPath = `/proc/${pid}/cmdline`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (fs.existsSync(procPath) && fs.readFileSync(procPath, 'utf8').trim().length > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

beforeEach(() => {
  originalCcsHome = process.env.CCS_HOME;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-copilot-daemon-test-'));
  process.env.CCS_HOME = tempDir;
});

afterEach(async () => {
  await Promise.all(
    activeServers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        })
    )
  );

  if (originalCcsHome !== undefined) {
    process.env.CCS_HOME = originalCcsHome;
  } else {
    delete process.env.CCS_HOME;
  }

  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

async function createServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse<http.IncomingMessage>) => void
): Promise<number> {
  const server = http.createServer(handler);
  activeServers.push(server);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to resolve server port');
  }

  return address.port;
}

function writeCopilotPortConfig(port: number): void {
  const configPath = path.join(getCcsDir(), 'config.yaml');
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `version: 8\ncopilot:\n  port: ${port}\n`);
}

describe('copilot daemon health detection', () => {
  it('returns false for invalid port inputs', async () => {
    expect(await isDaemonRunning(0)).toBe(false);
    expect(await isDaemonRunning(65536)).toBe(false);
  });

  it('returns false when no daemon is running on port', async () => {
    const running = await isDaemonRunning(19998);
    expect(running).toBe(false);
  });

  it('returns true when daemon root endpoint confirms server is running', async () => {
    const port = await createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Server running');
    });

    const running = await isDaemonRunning(port);
    expect(running).toBe(true);
  });

  it('returns false when root endpoint returns 200 but unexpected body', async () => {
    const port = await createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    });

    const running = await isDaemonRunning(port);
    expect(running).toBe(false);
  });

  it('returns false when root endpoint returns 200 with empty body', async () => {
    const port = await createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('');
    });

    const running = await isDaemonRunning(port);
    expect(running).toBe(false);
  });

  it('returns false when root endpoint is non-200', async () => {
    const port = await createServer((_req, res) => {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('unavailable');
    });

    const running = await isDaemonRunning(port);
    expect(running).toBe(false);
  });

  it('fails fast when startDaemon is called with invalid port', async () => {
    const result = await startDaemon({
      ...DEFAULT_COPILOT_CONFIG,
      port: 70000,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid Copilot daemon port');
  });
});

describe('copilot daemon stop safety', () => {
  it('returns failure when stale PID points to unrelated process but daemon is still live', async () => {
    const port = await createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Server running');
    });

    writeCopilotPortConfig(port);

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

    const pidFile = path.join(getCcsDir(), 'copilot', 'daemon.pid');
    fs.mkdirSync(path.dirname(pidFile), { recursive: true });
    fs.writeFileSync(pidFile, String(unrelatedPid));
    await waitForProcessCommandLine(unrelatedPid);

    try {
      const result = await stopDaemon();
      expect(result.success).toBe(false);
      expect(result.error).toContain('daemon is still responding on port');

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

  it('does not terminate unrelated process from stale PID file', async () => {
    writeCopilotPortConfig(65534);

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

    const pidFile = path.join(getCcsDir(), 'copilot', 'daemon.pid');
    fs.mkdirSync(path.dirname(pidFile), { recursive: true });
    fs.writeFileSync(pidFile, String(unrelatedPid));
    await waitForProcessCommandLine(unrelatedPid);

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
});
