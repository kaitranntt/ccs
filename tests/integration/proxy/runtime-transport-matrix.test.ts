import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';

const matrixEnabled = process.env.CCS_RUNTIME_MATRIX === '1';
const fixturePath = path.join(process.cwd(), 'tests/integration/proxy/fixtures/runtime-probe.cjs');
const proxyKeys = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
];

type ProbeResult = {
  status?: number;
  text?: string;
  error?: string;
  closed?: boolean;
  elapsedMs?: number;
};

function resolveNodeBinary(version: 18 | 22 | 26): string {
  const result = spawnSync('npx', ['-y', `node@${version}`, '-p', 'process.execPath'], {
    encoding: 'utf8',
    env: Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !proxyKeys.includes(key))
    ),
  });
  if (result.status !== 0) {
    throw new Error(`Unable to resolve Node ${version}: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

function runProbe(
  binary: string,
  upstream: string,
  env: Record<string, string> = {},
  mode = 'transport'
): Promise<ProbeResult> {
  const cleanEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !proxyKeys.includes(key))
  );
  const ccsHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-runtime-matrix-'));
  return new Promise((resolve, reject) => {
    const child = spawn(binary, [fixturePath], {
      cwd: process.cwd(),
      env: {
        ...cleanEnv,
        ...env,
        CCS_RUNTIME_PROBE_ROOT: process.cwd(),
        CCS_RUNTIME_PROBE_UPSTREAM: upstream,
        CCS_RUNTIME_PROBE_MODE: mode,
        CCS_HOME: ccsHome,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.once('error', (error) => {
      fs.rmSync(ccsHome, { recursive: true, force: true });
      reject(error);
    });
    child.once('close', (code) => {
      fs.rmSync(ccsHome, { recursive: true, force: true });
      if (code !== 0) {
        reject(new Error(`Probe exited ${code}: ${stderr || stdout}`));
        return;
      }
      const lastLine = stdout.trim().split('\n').pop();
      if (!lastLine) {
        reject(new Error(`Probe returned no output: ${stderr}`));
        return;
      }
      resolve(JSON.parse(lastLine) as ProbeResult);
    });
  });
}

describe.skipIf(!matrixEnabled)('real runtime upstream transport matrix', () => {
  let node18 = '';
  let node22 = '';
  let node26 = '';
  let upstreamServer: http.Server | undefined;
  let upstreamPort = 0;
  let corporateProxy: http.Server | undefined;
  let corporateProxyPort = 0;
  let corporateProxyHits = 0;
  let sawProxyAuthorization = false;

  beforeAll(async () => {
    node18 = resolveNodeBinary(18);
    node22 = resolveNodeBinary(22);
    node26 = resolveNodeBinary(26);
    const payload = JSON.stringify({
      id: 'chatcmpl_matrix',
      model: 'sentinel-model',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'matrix-ok' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
    upstreamServer = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(payload);
    });
    corporateProxy = http.createServer((req, res) => {
      corporateProxyHits += 1;
      sawProxyAuthorization = String(req.headers['proxy-authorization'] || '').startsWith('Basic ');
      res.writeHead(200, {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      });
      res.end(payload);
    });
    corporateProxy.on('connect', (req, socket) => {
      corporateProxyHits += 1;
      sawProxyAuthorization = String(req.headers['proxy-authorization'] || '').startsWith('Basic ');
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      socket.once('data', () => {
        socket.end(
          `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(payload)}\r\nConnection: close\r\n\r\n${payload}`
        );
      });
    });
    await Promise.all([
      new Promise<void>((resolve) => upstreamServer!.listen(0, '127.0.0.1', resolve)),
      new Promise<void>((resolve) => corporateProxy!.listen(0, '127.0.0.1', resolve)),
    ]);
    upstreamPort = (upstreamServer.address() as { port: number }).port;
    corporateProxyPort = (corporateProxy.address() as { port: number }).port;
  }, 60_000);

  afterAll(async () => {
    const servers = [upstreamServer, corporateProxy].filter(
      (server): server is http.Server => server !== undefined
    );
    await Promise.all(
      servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve())))
    );
  }, 10_000);

  it('uses the matching fetch transport on Node 18, 22, 26, and Bun', async () => {
    const upstream = `http://127.0.0.1:${upstreamPort}/v1`;
    const results = await Promise.all([
      runProbe(node18, upstream),
      runProbe(node22, upstream),
      runProbe(node26, upstream),
      runProbe(process.execPath, upstream),
    ]);
    for (const result of results) {
      expect(result).toMatchObject({ status: 200, text: 'matrix-ok' });
    }
  });

  it('routes Node 26 and Bun through a real credentialed proxy', async () => {
    const proxyUrl = `http://sentinel-user:sentinel-password@127.0.0.1:${corporateProxyPort}`;
    const nodeResult = await runProbe(node26, 'http://upstream.invalid/v1', {
      HTTP_PROXY: proxyUrl,
      NO_PROXY: '127.0.0.1,localhost',
    });
    const bunResult = await runProbe(process.execPath, 'http://upstream.invalid/v1', {
      HTTP_PROXY: proxyUrl,
      NO_PROXY: '127.0.0.1,localhost',
    });
    expect(nodeResult).toMatchObject({ status: 200, text: 'matrix-ok' });
    expect(bunResult).toMatchObject({ status: 200, text: 'matrix-ok' });
    expect(corporateProxyHits).toBeGreaterThanOrEqual(2);
    expect(sawProxyAuthorization).toBe(true);
  });

  it('honors NO_PROXY without touching the proxy', async () => {
    const hitsBefore = corporateProxyHits;
    const result = await runProbe(node26, 'http://upstream.invalid/v1', {
      HTTP_PROXY: `http://sentinel-user:sentinel-password@127.0.0.1:${corporateProxyPort}`,
      NO_PROXY: 'upstream.invalid',
    });
    expect(result.status).toBe(502);
    expect(corporateProxyHits).toBe(hitsBefore);
  });

  it('shuts down Node 18 with an idle keep-alive connection', async () => {
    const result = await runProbe(node18, `http://127.0.0.1:${upstreamPort}/v1`, {}, 'shutdown');
    expect(result.closed).toBe(true);
    expect(result.elapsedMs).toBeLessThan(2_000);
  });
});
