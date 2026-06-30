/**
 * CCS Bar — server liveness probe utilities.
 *
 * Shared by launch-subcommand.ts and serve-subcommand.ts so neither imports
 * from the other (which would create a cross-module dependency that breaks
 * Bun's test module isolation when cache-busting URLs are used).
 */

import * as fs from 'fs';
import * as path from 'path';
import { BAR_AUTH_TOKEN_HEADER, getOrCreateBarAuthToken } from '../../utils/bar-auth-token';

export interface DashboardInfo {
  port: number;
  baseUrl: string;
  authRequired?: boolean;
}

/**
 * Read the port recorded in an existing bar.json.
 * Returns null when the file is absent or malformed.
 */

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
 *
 * Token authentication: the probe does NOT send the token in the request.
 * The real CCS Bar server reads the token from the 0600 file and includes it
 * unconditionally in the x-ccs-bar-token response header. The probe then checks
 * that the echoed value matches the locally-read token. A rogue loopback process
 * that has not read the 0600 file cannot produce the correct value, so a 200
 * without a matching token header is rejected. Sending the token in the request
 * would defeat this — any process could echo what it received.
 */
export async function defaultFindRunningServer(ccsDir: string): Promise<DashboardInfo | null> {
  const token = getOrCreateBarAuthToken(ccsDir);

  async function probe(url: string): Promise<{ ok: boolean; authRequired: boolean }> {
    const net = await import('net');
    const parsed = new URL(url);
    const port = Number(parsed.port);
    const host = parsed.hostname.replace(/^\[|\]$/g, '');

    return new Promise((resolve) => {
      let rawResponse = '';
      let settled = false;
      const finish = (statusCode = 0, headerSection = '') => {
        if (settled) return;
        settled = true;
        // Tear down the socket the moment we have enough to decide. The summary
        // endpoint only needs the status code for liveness, so a non-CCS
        // loopback service that streams forever cannot block discovery from
        // returning a higher-priority hit.
        socket.destroy();
        const authRequired = statusCode === 401 || statusCode === 403;
        if (authRequired) {
          resolve({ ok: true, authRequired: true });
          return;
        }
        if (statusCode === 200) {
          // Accept only when the server includes the correct token in the
          // response without having received it in the request. Only the real
          // CCS Bar process (which owns the 0600 file) can produce this value.
          const echoMatch = headerSection.match(
            new RegExp(`${BAR_AUTH_TOKEN_HEADER}:\\s*([^\\r\\n]+)`, 'i')
          );
          const echoedToken = echoMatch ? echoMatch[1].trim() : '';
          resolve({ ok: echoedToken === token, authRequired: false });
          return;
        }
        resolve({ ok: false, authRequired: false });
      };
      const socket = net.connect({ host, port }, () => {
        // Do NOT include the token in the request — sending the secret to the
        // party being authenticated lets any reflector trivially pass the check.
        socket.write(
          `GET ${parsed.pathname}${parsed.search} HTTP/1.1\r\nHost: ${parsed.host}\r\nConnection: close\r\n\r\n`
        );
      });
      socket.setTimeout(1500, () => finish());
      socket.on('data', (chunk) => {
        rawResponse += chunk.toString('utf8');
        const statusMatch = rawResponse.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/);
        if (statusMatch) {
          const code = Number(statusMatch[1]);
          // For non-200 we can finish on the status line alone.
          if (code !== 200) {
            finish(code, rawResponse);
            return;
          }
          // For 200 we need the headers section to extract the token.
          if (rawResponse.includes('\r\n\r\n')) {
            finish(code, rawResponse.split('\r\n\r\n')[0]);
          }
        }
      });
      socket.on('error', () => finish());
      socket.on('end', () => {
        const statusMatch = rawResponse.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/);
        if (statusMatch) finish(Number(statusMatch[1]), rawResponse);
        else finish();
      });
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
