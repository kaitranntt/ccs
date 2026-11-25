import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import {
  defaultFindRunningServer,
  resolveBarPort,
} from '../../../src/commands/bar/bar-server-probe';
import {
  serializeBarServerProcessRecord,
  getProcessBirthIdentity,
  removeBarDiscoveryIfNoProcess,
  removeBarServerProcessRecordIfOwned,
  stopDetachedBarServer,
  stopBarServerProcessFile,
  stopRecordedBarServer,
} from '../../../src/commands/bar/bar-process-control';
import { parsePortFlag, validatePortArgs } from '../../../src/commands/bar/port-arg';
import { handleBarServe } from '../../../src/commands/bar/serve-subcommand';
import { handleBarStop } from '../../../src/commands/bar/stop-subcommand';

let tempHome: string;
let originalHome: string | undefined;
let originalCcsHome: string | undefined;
const liveChildren = new Set<ReturnType<typeof spawn>>();

beforeEach(() => {
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-bar-lifecycle-'));
  originalHome = process.env.HOME;
  originalCcsHome = process.env.CCS_HOME;
  process.env.HOME = tempHome;
  process.env.CCS_HOME = path.join(tempHome, '.ccs');
  process.exitCode = 0;
});

afterEach(() => {
  for (const child of liveChildren) {
    try {
      child.kill('SIGKILL');
    } catch {
      // Already exited.
    }
  }
  liveChildren.clear();
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalCcsHome === undefined) delete process.env.CCS_HOME;
  else process.env.CCS_HOME = originalCcsHome;
  process.exitCode = 0;
  fs.rmSync(tempHome, { recursive: true, force: true });
});

describe('strict Bar port parsing', () => {
  it('rejects numeric prefixes, fractions, signs, whitespace, and out-of-range values', () => {
    for (const raw of ['3999junk', '3.5', '+3999', ' 3999', '0', '65536']) {
      expect(parsePortFlag(['--port', raw])).toEqual({ present: true, port: null });
    }
    expect(parsePortFlag(['--port', '3999'])).toEqual({ present: true, port: 3999 });
  });

  it('rejects unknown and duplicate launch options', () => {
    expect(validatePortArgs(['--porrt', '3999'])).toBe('Unknown option: --porrt');
    expect(validatePortArgs(['--port', '3999', '--port', '4000'])).toBe('Duplicate option: --port');
  });

  it('rejects malformed persisted ports in both discovery files', () => {
    const ccsDir = process.env.CCS_HOME!;
    fs.mkdirSync(path.join(ccsDir, 'bar'), { recursive: true });
    fs.writeFileSync(path.join(ccsDir, 'bar.json'), JSON.stringify({ port: 3999.5 }));
    fs.writeFileSync(
      path.join(ccsDir, 'bar', 'launch.json'),
      JSON.stringify({ args: ['ccs.js', 'bar', 'serve', '--port', '4555junk'] })
    );
    expect(resolveBarPort(ccsDir)).toBeNull();
  });
});

describe('verified Bar process stopping', () => {
  const rawRecord = serializeBarServerProcessRecord({ pid: 4321, birthIdentity: 'birth-a' });

  it('does not signal when the PID birth identity changed', async () => {
    let signaled = false;
    const outcome = await stopRecordedBarServer(rawRecord, {
      getProcessBirthIdentity: () => 'birth-b',
      killProcess: () => {
        signaled = true;
      },
    });
    expect(outcome.result).toBe('identity-mismatch');
    expect(signaled).toBe(false);
  });

  it('preserves server.pid and bar.json on mismatch, EPERM, and timeout', async () => {
    for (const failure of [
      'identity-mismatch',
      'permission-denied',
      'signal-failed',
      'timeout',
    ] as const) {
      const ccsDir = path.join(tempHome, failure);
      const pidPath = path.join(ccsDir, 'bar', 'server.pid');
      const barJsonPath = path.join(ccsDir, 'bar.json');
      fs.mkdirSync(path.dirname(pidPath), { recursive: true });
      fs.writeFileSync(pidPath, rawRecord);
      fs.writeFileSync(barJsonPath, '{}');

      await handleBarStop([], {
        getCcsDir: () => ccsDir,
        getProcessBirthIdentity: () => (failure === 'identity-mismatch' ? 'birth-b' : 'birth-a'),
        killProcess: () => {
          if (failure === 'permission-denied') {
            const err = new Error('not permitted') as NodeJS.ErrnoException;
            err.code = 'EPERM';
            throw err;
          }
          if (failure === 'signal-failed') throw new Error('signal transport failed');
        },
        waitForProcessExit: async () => (failure === 'timeout' ? 'timeout' : 'exited'),
      });

      expect(fs.existsSync(pidPath)).toBe(true);
      expect(fs.existsSync(barJsonPath)).toBe(true);
      expect(process.exitCode).toBe(1);
      process.exitCode = 0;
    }
  });

  it('never signals a legacy integer PID and gives manual recovery guidance', async () => {
    const ccsDir = path.join(tempHome, 'legacy');
    const pidPath = path.join(ccsDir, 'bar', 'server.pid');
    fs.mkdirSync(path.dirname(pidPath), { recursive: true });
    fs.writeFileSync(pidPath, '4321');
    let signaled = false;

    await handleBarStop([], {
      getCcsDir: () => ccsDir,
      killProcess: () => {
        signaled = true;
      },
    });

    expect(signaled).toBe(false);
    expect(fs.existsSync(pidPath)).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it('atomically preserves a replacement record written while the old process stops', async () => {
    const pidPath = path.join(tempHome, 'race', 'server.pid');
    fs.mkdirSync(path.dirname(pidPath), { recursive: true });
    fs.writeFileSync(pidPath, rawRecord);
    const replacement = serializeBarServerProcessRecord({
      pid: 9876,
      birthIdentity: 'replacement-birth',
    });

    const outcome = await stopBarServerProcessFile(pidPath, {
      getProcessBirthIdentity: () => 'birth-a',
      killProcess: () => fs.writeFileSync(pidPath, replacement),
      waitForProcessExit: async () => 'exited',
    });

    expect(outcome.result).toBe('stopped');
    expect(fs.readFileSync(pidPath, 'utf8')).toBe(replacement);
  });

  it('does not let an old serve cleanup unlink a replacement record', () => {
    const pidPath = path.join(tempHome, 'serve-race', 'server.pid');
    fs.mkdirSync(path.dirname(pidPath), { recursive: true });
    const replacement = serializeBarServerProcessRecord({
      pid: 9876,
      birthIdentity: 'replacement-birth',
    });
    fs.writeFileSync(pidPath, replacement);

    removeBarServerProcessRecordIfOwned(pidPath, { pid: 4321, birthIdentity: 'birth-a' });

    expect(fs.readFileSync(pidPath, 'utf8')).toBe(replacement);
  });

  it('stops a real recorded process through the claimed process file', async () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
    });
    liveChildren.add(child);
    const birthIdentity = await waitForBirthIdentity(child.pid!);
    const pidPath = path.join(tempHome, 'real-stop', 'server.pid');
    fs.mkdirSync(path.dirname(pidPath), { recursive: true });
    fs.writeFileSync(pidPath, serializeBarServerProcessRecord({ pid: child.pid!, birthIdentity }));

    const outcome = await stopBarServerProcessFile(pidPath);

    expect(outcome.result).toBe('stopped');
    expect(fs.existsSync(pidPath)).toBe(false);
    liveChildren.delete(child);
  });

  it('stops a real recorded process through the launch-move stop path', async () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
    });
    liveChildren.add(child);
    const birthIdentity = await waitForBirthIdentity(child.pid!);
    const ccsDir = path.join(tempHome, 'real-move');
    const pidPath = path.join(ccsDir, 'bar', 'server.pid');
    fs.mkdirSync(path.dirname(pidPath), { recursive: true });
    fs.writeFileSync(pidPath, serializeBarServerProcessRecord({ pid: child.pid!, birthIdentity }));
    await stopDetachedBarServer(ccsDir);

    expect(fs.existsSync(pidPath)).toBe(false);
    liveChildren.delete(child);
  });
});

describe('Bar serve publication ownership', () => {
  it('publishes server.pid before bar.json so old-stop cleanup preserves replacement discovery', async () => {
    const ccsDir = path.join(tempHome, 'serve-publication');
    const pidPath = path.join(ccsDir, 'bar', 'server.pid');
    const barJsonPath = path.join(ccsDir, 'bar.json');
    const publicationOrder: string[] = [];
    let oldStopRemovedDiscovery = null as boolean | null;

    await handleBarServe(['--port', '4555'], {
      getCcsDir: () => ccsDir,
      findRunningServer: async () => null,
      getPort: async () => 4555,
      startServer: async () => ({ port: 4555, baseUrl: 'http://127.0.0.1:4555' }),
      getProcessBirthIdentity: () => 'replacement-birth',
      writeFile: (filePath, content) => {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content);
        publicationOrder.push(filePath);
        if (filePath === barJsonPath) {
          oldStopRemovedDiscovery = removeBarDiscoveryIfNoProcess(barJsonPath, pidPath);
        }
      },
      onSignal: () => {},
      exit: (code) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(publicationOrder).toEqual([pidPath, barJsonPath]);
    expect(oldStopRemovedDiscovery).toBe(false);
    expect(fs.existsSync(pidPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(barJsonPath, 'utf8')).port).toBe(4555);
  });

  it('conditionally rolls back its owned process record when discovery publication fails', async () => {
    const ccsDir = path.join(tempHome, 'serve-rollback');
    const pidPath = path.join(ccsDir, 'bar', 'server.pid');
    const barJsonPath = path.join(ccsDir, 'bar.json');

    await expect(
      handleBarServe(['--port', '4555'], {
        getCcsDir: () => ccsDir,
        findRunningServer: async () => null,
        getPort: async () => 4555,
        startServer: async () => ({ port: 4555, baseUrl: 'http://127.0.0.1:4555' }),
        getProcessBirthIdentity: () => 'replacement-birth',
        writeFile: (filePath, content) => {
          if (filePath === barJsonPath) throw new Error('discovery write failed');
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, content);
        },
        onSignal: () => {},
        exit: (code) => {
          throw new Error(`exit ${code}`);
        },
      })
    ).rejects.toThrow('exit 1');

    expect(fs.existsSync(pidPath)).toBe(false);
  });
});

async function waitForBirthIdentity(pid: number): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const identity = getProcessBirthIdentity(pid);
    if (identity !== null) return identity;
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Process ${pid} never became observable`);
}

describe('Bar server identity probe', () => {
  it('ignores unrelated services returning 401 or 403 without a CCS proof', async () => {
    for (const status of [401, 403]) {
      const server = http.createServer((_req, res) => {
        res.writeHead(status);
        res.end();
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const port = (server.address() as { port: number }).port;
      const ccsDir = path.join(tempHome, `status-${status}`);
      fs.mkdirSync(ccsDir, { recursive: true });
      fs.writeFileSync(path.join(ccsDir, 'bar.json'), JSON.stringify({ port }));
      try {
        const result = await defaultFindRunningServer(ccsDir);
        expect(result?.port).not.toBe(port);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }
  });
});
