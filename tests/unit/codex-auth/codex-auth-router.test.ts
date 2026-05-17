import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let tempDir: string;
let ccsHome: string;
const ORIG_CCS_HOME = process.env.CCS_HOME;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-router-test-'));
  ccsHome = path.join(tempDir, 'ccs');
  fs.mkdirSync(path.join(ccsHome, '.ccs'), { recursive: true });
  process.env.CCS_HOME = ccsHome;
});

afterEach(() => {
  if (ORIG_CCS_HOME === undefined) delete process.env.CCS_HOME;
  else process.env.CCS_HOME = ORIG_CCS_HOME;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function loadRouter() {
  // Re-import fresh each test via dynamic import cache busting with timestamp
  const { runCodexAuth } = await import('../../../src/codex-auth/codex-auth-router');
  return runCodexAuth;
}

describe('runCodexAuth — help and no-arg', () => {
  it('no args → prints help and returns 0', async () => {
    const runCodexAuth = await loadRouter();
    const out: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array) => {
      out.push(String(chunk));
      return true;
    };
    try {
      const code = await runCodexAuth([]);
      expect(code).toBe(0);
      expect(out.join('')).toContain('ccsx auth');
    } finally {
      process.stdout.write = origWrite;
    }
  });

  it('--help → returns 0 and prints help', async () => {
    const runCodexAuth = await loadRouter();
    const out: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array) => {
      out.push(String(chunk));
      return true;
    };
    try {
      const code = await runCodexAuth(['--help']);
      expect(code).toBe(0);
      expect(out.join('')).toContain('Commands');
    } finally {
      process.stdout.write = origWrite;
    }
  });

  it('-h → returns 0', async () => {
    const runCodexAuth = await loadRouter();
    const out: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array) => {
      out.push(String(chunk));
      return true;
    };
    try {
      const code = await runCodexAuth(['-h']);
      expect(code).toBe(0);
    } finally {
      process.stdout.write = origWrite;
    }
  });
});

describe('runCodexAuth — unknown subcommand', () => {
  it('unknown subcommand → returns 1 and writes to stderr', async () => {
    const runCodexAuth = await loadRouter();
    const errOut: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk: string | Uint8Array) => {
      errOut.push(String(chunk));
      return true;
    };
    try {
      const code = await runCodexAuth(['bogus']);
      expect(code).toBe(1);
      expect(errOut.join('')).toContain('Unknown command');
      expect(errOut.join('')).toContain('bogus');
    } finally {
      process.stderr.write = origWrite;
    }
  });
});

describe('runCodexAuth — version', () => {
  it('--version → returns 0 and prints version', async () => {
    const runCodexAuth = await loadRouter();
    const out: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array) => {
      out.push(String(chunk));
      return true;
    };
    try {
      const code = await runCodexAuth(['--version']);
      expect(code).toBe(0);
      expect(out.join('')).toMatch(/\d+\.\d+/);
    } finally {
      process.stdout.write = origWrite;
    }
  });
});

describe('runCodexAuth — dispatches show without crashing', () => {
  it('show with no profiles → exit 0', async () => {
    const runCodexAuth = await loadRouter();
    const out: string[] = [];
    const origLog = console.log;
    const origWrite = process.stdout.write.bind(process.stdout);
    console.log = (...a: unknown[]) => out.push(a.map(String).join(' '));
    process.stdout.write = (chunk: string | Uint8Array) => {
      out.push(String(chunk));
      return true;
    };
    try {
      const code = await runCodexAuth(['show']);
      expect(code).toBe(0);
      expect(out.join('')).toContain('No Codex profiles');
    } finally {
      console.log = origLog;
      process.stdout.write = origWrite;
    }
  });
});
