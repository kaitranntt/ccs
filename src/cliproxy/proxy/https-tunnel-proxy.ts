/**
 * HTTPS Tunnel Proxy
 *
 * Local HTTP server that tunnels requests to a remote HTTPS CLIProxyAPI.
 * Required because Claude Code (via undici/node-fetch) doesn't support
 * HTTPS in ANTHROPIC_BASE_URL directly.
 *
 * Flow:
 *   Claude CLI --HTTP--> Local Tunnel (port X) --HTTPS--> Remote CLIProxyAPI
 *
 * Note: Unlike CodexReasoningProxy, this tunnel does NOT buffer or limit response sizes.
 * Responses are streamed directly (pipe) which is appropriate for a transparent tunnel.
 * Socket-level timeouts handle hung connections; size limits are enforced by the remote server.
 */

import * as http from 'http';
import * as https from 'https';
import type { Socket } from 'net';
import { createLogger } from '../../services/logging';

const logger = createLogger('cliproxy:https-tunnel-proxy');

export interface HttpsTunnelConfig {
  /** Remote server hostname */
  remoteHost: string;
  /** Remote server port (default: 443) */
  remotePort?: number;
  /** Auth token for remote server */
  authToken?: string;
  /** Request timeout in ms (default: 120000) */
  timeoutMs?: number;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Skip TLS certificate validation (for self-signed certs) */
  allowSelfSigned?: boolean;
}

export class HttpsTunnelProxy {
  private server: http.Server | null = null;
  private port: number | null = null;
  private startingPromise: Promise<number> | null = null;
  private activeConnections = new Set<Socket>();
  private readonly config: Required<
    Pick<
      HttpsTunnelConfig,
      'remoteHost' | 'remotePort' | 'timeoutMs' | 'verbose' | 'allowSelfSigned'
    >
  > &
    Pick<HttpsTunnelConfig, 'authToken'>;

  constructor(config: HttpsTunnelConfig) {
    // Validate hostname format (basic check for common issues)
    if (!config.remoteHost || !/^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$/.test(config.remoteHost)) {
      if (
        config.remoteHost &&
        config.remoteHost.length === 1 &&
        /^[a-zA-Z0-9]$/.test(config.remoteHost)
      ) {
        // Single character hostname is valid
      } else {
        throw new Error(
          `Invalid remoteHost format: "${config.remoteHost}". ` +
            'Expected hostname without protocol (e.g., "api.example.com")'
        );
      }
    }

    this.config = {
      remoteHost: config.remoteHost,
      remotePort: config.remotePort ?? 443,
      timeoutMs: config.timeoutMs ?? 120000,
      verbose: config.verbose ?? false,
      allowSelfSigned: config.allowSelfSigned ?? false,
      authToken: config.authToken,
    };
  }

  /**
   * Trace-level operational log gated on verbose mode (request routing, lifecycle chatter).
   * Errors/warnings are logged directly via logger.* and are not gated.
   */
  private trace(message: string): void {
    if (this.config.verbose) {
      logger.info('tunnel.trace', message);
    }
  }

  async start(): Promise<number> {
    // Already started
    if (this.server) return this.port ?? 0;

    // Prevent race condition: if start() is already in progress, return the same promise
    if (this.startingPromise) return this.startingPromise;

    this.startingPromise = new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        void this.handleRequest(req, res);
      });

      // Track connections for proper cleanup
      this.server.on('connection', (socket: Socket) => {
        this.activeConnections.add(socket);
        socket.on('close', () => this.activeConnections.delete(socket));
      });

      this.server.listen(0, '127.0.0.1', () => {
        const address = this.server?.address();
        this.port = typeof address === 'object' && address ? address.port : 0;
        if (this.port === 0) {
          this.startingPromise = null;
          reject(new Error('Failed to bind to any port'));
          return;
        }
        this.trace(
          `Started on port ${this.port}, tunneling to https://${this.config.remoteHost}:${this.config.remotePort}`
        );
        resolve(this.port);
      });

      this.server.on('error', (err) => {
        this.startingPromise = null;
        reject(err);
      });
    });

    return this.startingPromise;
  }

  stop(): void {
    if (!this.server) return;

    // Forcefully close all active connections
    for (const socket of this.activeConnections) {
      socket.destroy();
    }
    this.activeConnections.clear();

    this.server.close();
    this.server = null;
    this.port = null;
    this.startingPromise = null;
    this.trace('Stopped');
  }

  getPort(): number | null {
    return this.port;
  }

  private buildForwardHeaders(originalHeaders: http.IncomingHttpHeaders): http.OutgoingHttpHeaders {
    const headers: http.OutgoingHttpHeaders = {};

    // RFC 7230 hop-by-hop headers that should not be forwarded
    const hopByHop = new Set([
      'host',
      'connection',
      'transfer-encoding',
      'keep-alive',
      'proxy-authenticate',
      'proxy-authorization',
      'te',
      'trailer',
      'upgrade',
    ]);

    for (const [key, value] of Object.entries(originalHeaders)) {
      if (!value) continue;
      const lower = key.toLowerCase();
      if (hopByHop.has(lower)) continue;
      headers[key] = value;
    }

    // Set correct host header for remote (include port when non-default)
    if (this.config.remotePort === 443) {
      headers['Host'] = this.config.remoteHost;
    } else {
      headers['Host'] = `${this.config.remoteHost}:${this.config.remotePort}`;
    }

    // Inject Authorization header if not present but authToken is configured
    // This is a fallback - normally the client (CodexReasoningProxy) forwards the header
    if (!headers['authorization'] && !headers['Authorization'] && this.config.authToken) {
      headers['Authorization'] = `Bearer ${this.config.authToken}`;
    }

    return headers;
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const method = req.method || 'GET';
    const requestPath = req.url || '/';

    this.trace(
      `${method} ${requestPath} → https://${this.config.remoteHost}:${this.config.remotePort}${requestPath}`
    );

    try {
      await this.forwardRequest(req, res, requestPath);
    } catch (error) {
      const err = error as Error;
      logger.error('tunnel.request_failed', 'Tunnel request handler failed', {
        err: { name: err.name, message: err.message },
      });
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
      }
      // Sanitize error message: show details only in verbose mode (localhost-only anyway)
      const errorMessage = this.config.verbose ? err.message : 'Upstream request failed';
      res.end(JSON.stringify({ error: errorMessage }));
    }
  }

  private forwardRequest(
    originalReq: http.IncomingMessage,
    clientRes: http.ServerResponse,
    requestPath: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const headers = this.buildForwardHeaders(originalReq.headers);

      const options: https.RequestOptions = {
        hostname: this.config.remoteHost,
        port: this.config.remotePort,
        path: requestPath,
        method: originalReq.method,
        timeout: this.config.timeoutMs,
        headers,
        // Allow self-signed certificates if configured
        rejectUnauthorized: !this.config.allowSelfSigned,
      };

      const upstreamReq = https.request(options, (upstreamRes) => {
        // Forward status and headers
        clientRes.writeHead(upstreamRes.statusCode || 200, upstreamRes.headers);

        // Pipe response body
        upstreamRes.pipe(clientRes);
        upstreamRes.on('end', () => resolve());
        upstreamRes.on('error', reject);
      });

      upstreamReq.on('timeout', () => {
        const timeoutError = new Error('Upstream request timeout');
        logger.warn('tunnel.upstream_timeout', timeoutError.message);
        upstreamReq.destroy();
        reject(timeoutError);
      });

      upstreamReq.on('error', (err) => {
        logger.error('tunnel.upstream_error', 'Upstream request error', {
          err: { name: err.name, message: err.message },
        });
        reject(err);
      });

      // Handle client disconnect (premature close)
      originalReq.on('error', (err) => {
        logger.error('tunnel.client_request_error', 'Client request error', {
          err: { name: err.name, message: err.message },
        });
        upstreamReq.destroy();
        reject(err);
      });

      originalReq.on('close', () => {
        if (!originalReq.complete) {
          logger.warn('tunnel.client_premature_close', 'Client disconnected prematurely');
          upstreamReq.destroy();
        }
      });

      // Pipe request body to upstream
      originalReq.pipe(upstreamReq);
    });
  }
}
