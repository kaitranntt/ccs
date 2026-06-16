/**
 * CCS Bar — server liveness probe utilities.
 *
 * Shared by launch-subcommand.ts and serve-subcommand.ts so neither imports
 * from the other (which would create a cross-module dependency that breaks
 * Bun's test module isolation when cache-busting URLs are used).
 */

import * as fs from 'fs';
import * as path from 'path';

export interface DashboardInfo {
  port: number;
  baseUrl: string;
  authRequired?: boolean;
}

/**
 * Read the port recorded in an existing bar.json.
 * Returns null when the file is absent or malformed.
 */

function ensureLoopbackNoProxy(): void {
  const loopbackHosts = ['localhost', '127.0.0.1', '::1'];
  const existing = process.env.NO_PROXY ?? process.env.no_proxy ?? '';
  const parts = new Set(
    existing
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
  );

  for (const host of loopbackHosts) {
    parts.add(host);
  }

  const next = Array.from(parts).join(',');
  process.env.NO_PROXY = next;
  process.env.no_proxy = next;
}

export function resolveBarPort(ccsDir: string): number | null {
  const barJsonPath = path.join(ccsDir, 'bar.json');
  try {
    const raw = fs.readFileSync(barJsonPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<{ port: number }>;
    return typeof parsed.port === 'number' ? parsed.port : null;
  } catch {
    return null;
  }
}

/**
 * Probe candidate ports for a running CCS server.
 *
 * Both IPv4 (127.0.0.1) and IPv6 (::1) loopback addresses are probed for each
 * port. All probes are fired concurrently so worst-case latency is ~1.5 s
 * (one timeout) rather than N × 1.5 s sequentially. Results are awaited in
 * priority order so a lower-priority slow or streaming response cannot block
 * returning an already-known higher-priority hit.
 *
 * Each probe speaks raw HTTP/1.1 over a socket and resolves on the status line,
 * which lets discovery distinguish a live-but-auth-protected server (401/403)
 * from a healthy one (200) without depending on a higher-level HTTP client.
 */
export async function defaultFindRunningServer(ccsDir: string): Promise<DashboardInfo | null> {
  ensureLoopbackNoProxy();

  async function probe(url: string): Promise<{ ok: boolean; authRequired: boolean }> {
    const net = await import('net');
    const parsed = new URL(url);
    const port = Number(parsed.port);
    const host = parsed.hostname.replace(/^\[|\]$/g, '');

    return new Promise((resolve) => {
      let buffer = '';
      let settled = false;
      const finish = (statusCode = 0) => {
        if (settled) return;
        settled = true;
        // Tear down the socket the moment the status line is known. The summary
        // endpoint only needs the status code for liveness, so a non-CCS
        // loopback service that streams forever cannot block discovery from
        // returning a higher-priority hit.
        socket.destroy();
        const authRequired = statusCode === 401 || statusCode === 403;
        resolve({ ok: statusCode === 200 || authRequired, authRequired });
      };
      const socket = net.connect({ host, port }, () => {
        socket.write(
          `GET ${parsed.pathname}${parsed.search} HTTP/1.1\r\nHost: ${parsed.host}\r\nConnection: close\r\n\r\n`
        );
      });
      socket.setTimeout(1500, () => finish());
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        const match = buffer.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/);
        if (match) finish(Number(match[1]));
      });
      socket.on('error', () => finish());
      socket.on('end', () => finish());
    });
  }

  const barJsonPort = resolveBarPort(ccsDir);
  const base = [3000, 3001, 3002, 8000, 8080];
  const candidates: number[] =
    barJsonPort !== null ? [barJsonPort, ...base.filter((p) => p !== barJsonPort)] : base;

  const probeTargets = candidates.flatMap((port) => [
    { port, baseUrl: `http://127.0.0.1:${port}`, url: `http://127.0.0.1:${port}/api/bar/summary` },
    { port, baseUrl: `http://[::1]:${port}`, url: `http://[::1]:${port}/api/bar/summary` },
  ]);

  const probes = probeTargets.map((t) => probe(t.url));

  for (let i = 0; i < probeTargets.length; i++) {
    const result = await probes[i];
    if (result.ok) {
      const { port, baseUrl } = probeTargets[i];
      return { port, baseUrl, authRequired: result.authRequired };
    }
  }
  return null;
}
