/**
 * Tool Sanitization Proxy
 *
 * HTTP proxy that intercepts Claude CLI -> CLIProxy requests to:
 * 1. Sanitize MCP tool names exceeding Gemini's 64-char limit
 * 2. Sanitize MCP tool input_schema to remove non-standard JSON Schema properties
 * 3. Forward sanitized requests to upstream
 * 4. Restore original names in responses
 */

import * as http from 'http';
import { URL } from 'url';
import { ToolNameMapper } from '../ai-providers/tool-name-mapper';
import { extractProviderFromPathname } from '../ai-providers/model-id-normalizer';
import { createLogger } from '../../services/logging';
import {
  readRequestBody,
  RequestBodyTooLargeError,
  respondRequestTooLarge,
} from '../../utils/request-body';
import { resolveUpstreamTimeoutMs } from './upstream-response-timeout';
import {
  isRecord,
  sanitizeJsonRequestBody,
  type ToolSanitizationProxyConfig,
} from './tool-sanitization-proxy/request-sanitizer';
import {
  attachClientCloseAbort,
  forwardJsonBuffered,
  forwardJsonStreaming,
  forwardRaw,
} from './tool-sanitization-proxy/request-forwarders';

export type { ToolSanitizationProxyConfig };
export { attachClientCloseAbort };

export class ToolSanitizationProxy {
  private server: http.Server | null = null;
  private port: number | null = null;
  private readonly config: Required<ToolSanitizationProxyConfig>;
  private readonly logger = createLogger('cliproxy:tool-sanitization-proxy');

  constructor(config: ToolSanitizationProxyConfig) {
    this.config = {
      upstreamBaseUrl: config.upstreamBaseUrl,
      verbose: config.verbose ?? false,
      warnOnSanitize: config.warnOnSanitize ?? true,
      timeoutMs: config.timeoutMs ?? resolveUpstreamTimeoutMs(),
      allowSelfSigned: config.allowSelfSigned ?? false,
      sanitizeSchemas: config.sanitizeSchemas ?? true,
    };
  }

  /**
   * Start the proxy server on an ephemeral port.
   * @returns The assigned port number
   */
  async start(): Promise<number> {
    if (this.server) return this.port ?? 0;

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        void this.handleRequest(req, res);
      });

      this.server.listen(0, '127.0.0.1', () => {
        const address = this.server?.address();
        this.port = typeof address === 'object' && address ? address.port : 0;
        this.logger.info(
          'tool-sanitization.proxy.active',
          `Tool sanitization proxy active (port ${this.port})`
        );
        resolve(this.port);
      });

      this.server.on('error', (err) => reject(err));
    });
  }

  /**
   * Stop the proxy server.
   */
  stop(): void {
    if (!this.server) return;
    this.server.close();
    this.server = null;
    this.port = null;
  }

  /**
   * Get the port the proxy is listening on.
   */
  getPort(): number | null {
    return this.port;
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const method = req.method || 'GET';
    const requestPath = req.url || '/';
    const upstreamBase = new URL(this.config.upstreamBaseUrl);
    const fullUpstreamUrl = new URL(requestPath, upstreamBase);
    const providerFromPath = extractProviderFromPathname(fullUpstreamUrl.pathname);

    if (this.config.verbose) {
      this.logger.info(
        'tool-sanitization.proxy.request',
        `${method} ${requestPath} → ${fullUpstreamUrl.href}`
      );
    }

    const contentType = String(req.headers['content-type'] || '');
    const isJson = contentType.includes('application/json');
    const shouldRewrite = isJson && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase());

    try {
      if (!shouldRewrite) {
        await forwardRaw(req, res, fullUpstreamUrl, this.config);
        return;
      }

      const rawBody = await readRequestBody(req);
      let parsed: unknown;
      try {
        parsed = rawBody.length ? JSON.parse(rawBody) : {};
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON in request body' }));
        return;
      }

      const mapper = new ToolNameMapper();
      const { deniedReason, modifiedBody } = sanitizeJsonRequestBody(
        parsed,
        providerFromPath,
        mapper,
        this.config,
        this.logger
      );
      if (deniedReason) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: deniedReason }));
        return;
      }

      const isStreaming = isRecord(modifiedBody) && modifiedBody.stream === true;
      if (isStreaming) {
        await forwardJsonStreaming(
          req,
          res,
          fullUpstreamUrl,
          modifiedBody,
          mapper,
          this.config,
          this.logger
        );
      } else {
        await forwardJsonBuffered(
          req,
          res,
          fullUpstreamUrl,
          modifiedBody,
          mapper,
          this.config,
          this.logger
        );
      }
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        respondRequestTooLarge(req, res, error, this.logger);
        return;
      }
      const err = error as Error;
      this.logger.warn('tool-sanitization.proxy.request-error', `Error: ${err.message}`, {
        error: err.message,
        method,
        path: requestPath,
      });
      if (res.writableEnded || res.destroyed || req.socket?.destroyed) return;
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
      }
      res.end(JSON.stringify({ error: err.message }));
    }
  }
}
