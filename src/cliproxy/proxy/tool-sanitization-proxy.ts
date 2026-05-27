/**
 * Tool Sanitization Proxy
 *
 * HTTP proxy that intercepts Claude CLI → CLIProxy requests to:
 * 1. Sanitize MCP tool names exceeding Gemini's 64-char limit
 * 2. Sanitize MCP tool input_schema to remove non-standard JSON Schema properties
 * 3. Forward sanitized requests to upstream
 * 4. Restore original names in responses
 *
 * Follows CodexReasoningProxy pattern for consistency.
 */

import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { URL } from 'url';
import { ToolNameMapper, type Tool, type ContentBlock } from '../ai-providers/tool-name-mapper';
import { sanitizeToolSchemas } from '../ai-providers/schema-sanitizer';
import {
  extractProviderFromPathname,
  getDeniedModelIdReasonForProvider,
  normalizeModelIdForRouting,
  stripCodexEffortSuffix,
} from '../ai-providers/model-id-normalizer';
import { getModelMaxLevel } from '../model-catalog';

import { createLogger } from '../../services/logging';
import { getCcsDir } from '../../config/config-loader-facade';
import {
  attachUpstreamResponseTimeout,
  writeForwardResponseHead,
} from './upstream-response-timeout';

export interface ToolSanitizationProxyConfig {
  /** Upstream CLIProxy URL */
  upstreamBaseUrl: string;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Log warnings when sanitization occurs */
  warnOnSanitize?: boolean;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Skip TLS certificate validation for self-signed remote HTTPS proxies */
  allowSelfSigned?: boolean;
}

/**
 * Type guard to check if a value is a plain object (Record).
 * Used for safely accessing properties on unknown JSON values.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const GEMINI_UNSUPPORTED_TOOL_FIELDS = new Set([
  'strict',
  'input_examples',
  'type',
  'cache_control',
  'defer_loading',
]);

const CODEX_UNSUPPORTED_TOOL_FIELDS = new Set(['cache_control']);
const EXTENDED_CONTEXT_SUFFIX_REGEX = /\[1m\]$/i;
const LEGACY_CODEX_MODEL_ID_REGEX = /^gpt-5(?:\.\d+)?-codex(?:-(?:mini|max))?$/i;

function canonicalizeCodexModelId(model: string | undefined): string | null {
  const normalizedModel = model?.trim().toLowerCase();
  if (!normalizedModel) {
    return null;
  }

  const withoutExtendedContext = normalizedModel.replace(EXTENDED_CONTEXT_SUFFIX_REGEX, '').trim();
  return stripCodexEffortSuffix(withoutExtendedContext);
}

function isKnownCodexModelId(model: string | undefined): boolean {
  const normalizedModel = canonicalizeCodexModelId(model);
  if (!normalizedModel) {
    return false;
  }

  // Root-routed requests can carry Codex model IDs that CCS uses outside the
  // small interactive catalog (for example image analysis and Cursor defaults).
  return (
    LEGACY_CODEX_MODEL_ID_REGEX.test(normalizedModel) ||
    getModelMaxLevel('codex', normalizedModel) !== undefined
  );
}

function getUnsupportedToolFields(
  providerFromPath: string | null,
  model: string | undefined
): ReadonlySet<string> | null {
  const normalizedProvider = providerFromPath?.trim().toLowerCase() ?? null;
  const normalizedModel = model?.trim().toLowerCase();

  if (
    normalizedProvider === 'gemini' ||
    normalizedProvider === 'gemini-cli' ||
    (normalizedProvider === null && normalizedModel?.startsWith('gemini-'))
  ) {
    return GEMINI_UNSUPPORTED_TOOL_FIELDS;
  }

  if (
    normalizedProvider === 'codex' ||
    (normalizedProvider === null && isKnownCodexModelId(model))
  ) {
    return CODEX_UNSUPPORTED_TOOL_FIELDS;
  }

  return null;
}

function stripUnsupportedToolFields(
  tools: Tool[],
  unsupportedFields: ReadonlySet<string>
): {
  tools: Tool[];
  removedByTool: Array<{ name: string; removed: string[] }>;
  totalRemoved: number;
} {
  const removedByTool: Array<{ name: string; removed: string[] }> = [];
  let totalRemoved = 0;

  const sanitizedTools = tools.map((tool) => {
    const sanitizedTool = { ...tool };
    const removed: string[] = [];

    for (const field of unsupportedFields) {
      if (field in sanitizedTool) {
        delete sanitizedTool[field];
        removed.push(field);
      }
    }

    if (removed.length > 0) {
      removedByTool.push({
        name: tool.name,
        removed,
      });
      totalRemoved += removed.length;
    }

    return sanitizedTool;
  });

  return {
    tools: sanitizedTools,
    removedByTool,
    totalRemoved,
  };
}

export class ToolSanitizationProxy {
  private server: http.Server | null = null;
  private port: number | null = null;
  private readonly config: Required<ToolSanitizationProxyConfig>;
  private readonly logFilePath: string;
  private readonly debugMode: boolean;
  private readonly logger = createLogger('cliproxy:tool-sanitization-proxy');

  constructor(config: ToolSanitizationProxyConfig) {
    this.config = {
      upstreamBaseUrl: config.upstreamBaseUrl,
      verbose: config.verbose ?? false,
      warnOnSanitize: config.warnOnSanitize ?? true,
      timeoutMs: config.timeoutMs ?? 120000,
      allowSelfSigned: config.allowSelfSigned ?? false,
    };
    this.debugMode = process.env.CCS_DEBUG === '1';
    this.logFilePath = this.initLogFile();
  }

  /**
   * Initialize log file path and ensure directory exists.
   */
  private initLogFile(): string {
    const logsDir = path.join(getCcsDir(), 'logs');

    try {
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
    } catch (err) {
      // Fallback to temp directory if logs dir creation fails
      if (this.debugMode) {
        console.error(
          `[tool-sanitization-proxy] Failed to create logs dir: ${(err as Error).message}`
        );
      }
      return path.join(os.tmpdir(), 'tool-sanitization-proxy.log');
    }

    return path.join(logsDir, 'tool-sanitization-proxy.log');
  }

  /**
   * Write log entry to file (always) and console (if CCS_DEBUG=1).
   */
  private writeLog(level: 'info' | 'warn' | 'error', message: string): void {
    const timestamp = new Date().toISOString();
    const prefix = level === 'info' ? '[i]' : level === 'warn' ? '[!]' : '[X]';
    const logLine = `${timestamp} ${prefix} ${message}\n`;

    // Always write to file
    try {
      fs.appendFileSync(this.logFilePath, logLine);
    } catch {
      // Silently ignore file write errors
    }

    // Console output only in debug mode
    if (this.debugMode) {
      console.error(`${prefix} ${message}`);
    }

    this.logger[level](level, message, {
      debugMode: this.debugMode,
      logFilePath: this.logFilePath,
    });
  }

  private log(message: string): void {
    if (this.config.verbose) {
      this.writeLog('info', `[tool-sanitization-proxy] ${message}`);
    }
  }

  private warn(message: string): void {
    if (this.config.warnOnSanitize) {
      this.writeLog('warn', `Tool name sanitized: ${message}`);
    }
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
        this.writeLog('info', `Tool sanitization proxy active (port ${this.port})`);
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

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const maxSize = 10 * 1024 * 1024; // 10MB
      let total = 0;

      req.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > maxSize) {
          req.destroy();
          reject(new Error('Request body too large (max 10MB)'));
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const method = req.method || 'GET';
    const requestPath = req.url || '/';
    const upstreamBase = new URL(this.config.upstreamBaseUrl);
    const fullUpstreamUrl = new URL(requestPath, upstreamBase);
    const providerFromPath = extractProviderFromPathname(fullUpstreamUrl.pathname);

    this.log(`${method} ${requestPath} → ${fullUpstreamUrl.href}`);

    // Only buffer+rewrite JSON POST requests
    const contentType = String(req.headers['content-type'] || '');
    const isJson = contentType.includes('application/json');
    const shouldRewrite = isJson && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase());

    try {
      if (!shouldRewrite) {
        await this.forwardRaw(req, res, fullUpstreamUrl);
        return;
      }

      const rawBody = await this.readBody(req);
      let parsed: unknown;
      try {
        parsed = rawBody.length ? JSON.parse(rawBody) : {};
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON in request body' }));
        return;
      }

      // Create mapper for this request
      const mapper = new ToolNameMapper();

      // Normalize dotted Claude model IDs for provider-compatible routing.
      let modifiedBody = parsed;
      if (isRecord(modifiedBody) && typeof modifiedBody.model === 'string') {
        const deniedReason = getDeniedModelIdReasonForProvider(
          modifiedBody.model,
          providerFromPath
        );
        if (deniedReason) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: deniedReason }));
          return;
        }
        const normalizedModel = normalizeModelIdForRouting(modifiedBody.model, providerFromPath);
        if (normalizedModel !== modifiedBody.model) {
          this.writeLog(
            'warn',
            `[tool-sanitization-proxy] Model normalized for provider routing (${providerFromPath ?? 'root'}): "${modifiedBody.model}" → "${normalizedModel}"`
          );
          modifiedBody = { ...modifiedBody, model: normalizedModel };
        }
      }

      // Sanitize tools if present
      if (isRecord(modifiedBody) && Array.isArray(modifiedBody.tools)) {
        // Step 1: Sanitize input_schema properties (remove non-standard JSON Schema properties)
        const schemaResult = sanitizeToolSchemas(
          modifiedBody.tools as Array<{ name: string; input_schema?: Record<string, unknown> }>
        );

        if (schemaResult.totalRemoved > 0) {
          for (const entry of schemaResult.removedByTool) {
            this.writeLog(
              'warn',
              `[tool-sanitization-proxy] Schema sanitized for "${entry.name}": removed ${entry.removed.length} Gemini-unsupported properties`
            );
          }
          this.log(
            `Sanitized ${schemaResult.totalRemoved} schema properties across ${schemaResult.removedByTool.length} tool(s)`
          );
        }

        let rewrittenTools = schemaResult.tools as Tool[];
        const unsupportedToolFields =
          isRecord(modifiedBody) && typeof modifiedBody.model === 'string'
            ? getUnsupportedToolFields(providerFromPath, modifiedBody.model)
            : getUnsupportedToolFields(providerFromPath, undefined);

        if (unsupportedToolFields) {
          const fieldResult = stripUnsupportedToolFields(rewrittenTools, unsupportedToolFields);

          if (fieldResult.totalRemoved > 0) {
            for (const entry of fieldResult.removedByTool) {
              this.writeLog(
                'warn',
                `[tool-sanitization-proxy] Tool fields stripped for "${entry.name}" (${providerFromPath ?? 'model-routed'}): ${entry.removed.join(', ')}`
              );
            }
            this.log(
              `Stripped ${fieldResult.totalRemoved} unsupported top-level tool field(s) across ${fieldResult.removedByTool.length} tool(s)`
            );
          }

          rewrittenTools = fieldResult.tools;
        }

        // Step 2: Sanitize tool names (truncate to 64 chars for Gemini)
        const sanitizedTools = mapper.registerTools(rewrittenTools);
        modifiedBody = { ...modifiedBody, tools: sanitizedTools };

        // Log sanitization warnings
        if (mapper.hasChanges()) {
          const changes = mapper.getChanges();
          for (const change of changes) {
            this.warn(`"${change.original}" → "${change.sanitized}"`);
          }
          this.log(`Sanitized ${changes.length} tool name(s)`);
        }

        // Warn about hash collisions (multiple originals → same sanitized)
        if (mapper.hasCollisions()) {
          const collisions = mapper.getCollisions();
          for (const collision of collisions) {
            this.writeLog(
              'warn',
              `[tool-sanitization-proxy] Hash collision detected: ${collision.originals.join(', ')} → "${collision.sanitized}"`
            );
          }
        }
      }

      // Check if streaming is requested
      const isStreaming = isRecord(modifiedBody) && modifiedBody.stream === true;

      if (isStreaming) {
        await this.forwardJsonStreaming(req, res, fullUpstreamUrl, modifiedBody, mapper);
      } else {
        await this.forwardJsonBuffered(req, res, fullUpstreamUrl, modifiedBody, mapper);
      }
    } catch (error) {
      const err = error as Error;
      this.log(`Error: ${err.message}`);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
      }
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  private buildForwardHeaders(
    originalHeaders: http.IncomingHttpHeaders,
    bodyString?: string
  ): http.OutgoingHttpHeaders {
    const headers: http.OutgoingHttpHeaders = {};

    // RFC 7230 hop-by-hop headers that should not be forwarded
    const hopByHop = new Set([
      'host',
      'content-length',
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

    if (bodyString !== undefined) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      headers['Content-Length'] = Buffer.byteLength(bodyString);
    }

    return headers;
  }

  private getRequestFn(url: URL): typeof http.request | typeof https.request {
    return url.protocol === 'https:' ? https.request : http.request;
  }

  private startResponseTimeout(upstreamReq: http.ClientRequest): () => void {
    const deadline = setTimeout(() => {
      upstreamReq.destroy(new Error('Upstream request timeout'));
    }, this.config.timeoutMs);
    upstreamReq.setTimeout(this.config.timeoutMs, () => {
      upstreamReq.destroy(new Error('Upstream request timeout'));
    });
    return () => clearTimeout(deadline);
  }

  private buildRequestOptions(
    upstreamUrl: URL,
    method: string | undefined,
    headers: http.OutgoingHttpHeaders
  ): https.RequestOptions {
    const options: https.RequestOptions = {
      protocol: upstreamUrl.protocol,
      hostname: upstreamUrl.hostname,
      port: upstreamUrl.port,
      path: upstreamUrl.pathname + upstreamUrl.search,
      method,
      timeout: this.config.timeoutMs,
      headers,
    };

    if (upstreamUrl.protocol === 'https:' && this.config.allowSelfSigned) {
      options.rejectUnauthorized = false;
    }

    return options;
  }

  private forwardRaw(
    originalReq: http.IncomingMessage,
    clientRes: http.ServerResponse,
    upstreamUrl: URL
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const requestFn = this.getRequestFn(upstreamUrl);
      let clearResponseTimeout: () => void = () => undefined;
      const upstreamReq = requestFn(
        this.buildRequestOptions(
          upstreamUrl,
          originalReq.method,
          this.buildForwardHeaders(originalReq.headers)
        ),
        (upstreamRes) => {
          clearResponseTimeout();
          const statusCode = upstreamRes.statusCode || 200;
          let responseStarted = false;
          const writeResponseHead = () => {
            if (responseStarted) return;
            responseStarted = true;
            writeForwardResponseHead(clientRes, statusCode, upstreamRes.headers);
          };
          const clearUpstreamResponseTimeout = attachUpstreamResponseTimeout({
            upstreamReq,
            upstreamRes,
            clientRes,
            timeoutMs: this.config.timeoutMs,
            onTimeout: () => resolve(),
          });
          upstreamRes.on('data', (chunk: Buffer) => {
            writeResponseHead();
            const canContinue = clientRes.write(chunk);
            if (!canContinue) {
              upstreamRes.pause();
              clientRes.once('drain', () => upstreamRes.resume());
            }
          });
          upstreamRes.on('end', () => {
            clearUpstreamResponseTimeout();
            writeResponseHead();
            clientRes.end();
            resolve();
          });
          upstreamRes.on('error', (error) => {
            clearUpstreamResponseTimeout();
            reject(error);
          });
        }
      );

      clearResponseTimeout = this.startResponseTimeout(upstreamReq);
      upstreamReq.on('timeout', () => upstreamReq.destroy(new Error('Upstream request timeout')));
      upstreamReq.on('error', (err) => {
        clearResponseTimeout();
        reject(err);
      });
      originalReq.pipe(upstreamReq);
    });
  }

  /**
   * Forward JSON request and buffer response for tool name restoration.
   */
  private forwardJsonBuffered(
    originalReq: http.IncomingMessage,
    clientRes: http.ServerResponse,
    upstreamUrl: URL,
    body: unknown,
    mapper: ToolNameMapper
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const bodyString = JSON.stringify(body);
      const requestFn = this.getRequestFn(upstreamUrl);
      let clearResponseTimeout: () => void = () => undefined;
      const upstreamReq = requestFn(
        this.buildRequestOptions(
          upstreamUrl,
          originalReq.method,
          this.buildForwardHeaders(originalReq.headers, bodyString)
        ),
        (upstreamRes) => {
          clearResponseTimeout();
          const clearUpstreamResponseTimeout = attachUpstreamResponseTimeout({
            upstreamReq,
            upstreamRes,
            clientRes,
            timeoutMs: this.config.timeoutMs,
            onTimeout: () => resolve(),
          });
          const chunks: Buffer[] = [];

          upstreamRes.on('data', (chunk: Buffer) => chunks.push(chunk));
          upstreamRes.on('end', () => {
            clearUpstreamResponseTimeout();
            try {
              const responseBody = Buffer.concat(chunks).toString('utf8');
              const contentType = upstreamRes.headers['content-type'] || '';

              // Only process JSON responses with tool_use blocks
              if (contentType.includes('application/json') && mapper.hasChanges()) {
                try {
                  const parsed = JSON.parse(responseBody);
                  if (isRecord(parsed) && Array.isArray(parsed.content)) {
                    parsed.content = mapper.restoreToolUse(parsed.content as ContentBlock[]);
                    const modifiedResponse = JSON.stringify(parsed);

                    // Update content-length header
                    const headers = { ...upstreamRes.headers };
                    headers['content-length'] = String(Buffer.byteLength(modifiedResponse));

                    clientRes.writeHead(upstreamRes.statusCode || 200, headers);
                    clientRes.end(modifiedResponse);
                    resolve();
                    return;
                  }
                } catch {
                  // JSON parse failed, pass through unchanged
                }
              }

              // Pass through unchanged
              clientRes.writeHead(upstreamRes.statusCode || 200, upstreamRes.headers);
              clientRes.end(responseBody);
              resolve();
            } catch (err) {
              reject(err);
            }
          });
          upstreamRes.on('error', (error) => {
            clearUpstreamResponseTimeout();
            reject(error);
          });
        }
      );

      clearResponseTimeout = this.startResponseTimeout(upstreamReq);
      upstreamReq.on('timeout', () => upstreamReq.destroy(new Error('Upstream request timeout')));
      upstreamReq.on('error', (err) => {
        clearResponseTimeout();
        reject(err);
      });
      upstreamReq.write(bodyString);
      upstreamReq.end();
    });
  }

  /**
   * Forward JSON request and stream response with tool name restoration.
   * Handles SSE (Server-Sent Events) format.
   */
  private forwardJsonStreaming(
    originalReq: http.IncomingMessage,
    clientRes: http.ServerResponse,
    upstreamUrl: URL,
    body: unknown,
    mapper: ToolNameMapper
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const bodyString = JSON.stringify(body);
      const requestFn = this.getRequestFn(upstreamUrl);
      let clearResponseTimeout: () => void = () => undefined;
      const upstreamReq = requestFn(
        this.buildRequestOptions(
          upstreamUrl,
          originalReq.method,
          this.buildForwardHeaders(originalReq.headers, bodyString)
        ),
        (upstreamRes) => {
          clearResponseTimeout();
          const clearUpstreamResponseTimeout = attachUpstreamResponseTimeout({
            upstreamReq,
            upstreamRes,
            clientRes,
            timeoutMs: this.config.timeoutMs,
            onTimeout: () => resolve(),
          });
          writeForwardResponseHead(clientRes, upstreamRes.statusCode || 200, upstreamRes.headers);

          // Track upstream SSE lifecycle events (guards against empty proxy responses)
          const lifecycle = {
            hasContent: false,
            hasData: false,
            hasMessageStart: false,
            hasMessageDelta: false,
            hasMessageStop: false,
            /** Scan text for SSE lifecycle events and update tracking flags */
            update(text: string) {
              if (text.includes('"content_block_start"')) this.hasContent = true;
              if (text.includes('"message_start"')) this.hasMessageStart = true;
              if (text.includes('"message_delta"')) this.hasMessageDelta = true;
              if (text.includes('"message_stop"')) this.hasMessageStop = true;
            },
          };
          const isSuccessResponse =
            (upstreamRes.statusCode || 200) >= 200 && (upstreamRes.statusCode || 200) < 300;

          // If no changes were made, intercept to detect empty responses.
          // In the real failure case (issue #350), upstream sends message_start but
          // NOT message_delta/message_stop, so the synthetic response completes the
          // stream. If upstream DID send message_stop, Claude Code treats the second
          // synthetic block as additional content in the same conversation turn.
          if (!mapper.hasChanges()) {
            upstreamRes.on('data', (chunk: Buffer) => {
              lifecycle.hasData = true;
              lifecycle.update(chunk.toString('utf8'));
              // Respect backpressure: pause upstream if client can't keep up
              const canContinue = clientRes.write(chunk);
              if (!canContinue) {
                upstreamRes.pause();
                clientRes.once('drain', () => upstreamRes.resume());
              }
            });
            upstreamRes.on('end', () => {
              clearUpstreamResponseTimeout();
              try {
                if (!lifecycle.hasContent && isSuccessResponse && lifecycle.hasData) {
                  this.writeLog(
                    'warn',
                    '[tool-sanitization-proxy] Empty response detected from upstream (no content blocks). Injecting synthetic response to prevent client crash.'
                  );
                  clientRes.write(
                    this.buildSyntheticErrorResponse(
                      lifecycle.hasMessageStart,
                      lifecycle.hasMessageDelta,
                      lifecycle.hasMessageStop
                    )
                  );
                }
                clientRes.end();
              } catch {
                // Client may have disconnected — safe to ignore
              }
              resolve();
            });
            upstreamRes.on('error', (error) => {
              clearUpstreamResponseTimeout();
              reject(error);
            });
            return;
          }

          // Process SSE events for tool name restoration
          let buffer = '';

          upstreamRes.on('data', (chunk: Buffer) => {
            lifecycle.hasData = true;
            buffer += chunk.toString('utf8');

            // Process complete SSE events
            const events = buffer.split('\n\n');
            buffer = events.pop() || ''; // Keep incomplete event in buffer

            for (const event of events) {
              if (!event.trim()) continue;

              lifecycle.update(event);

              const processedEvent = this.processSSEEvent(event, mapper);
              clientRes.write(processedEvent + '\n\n');
            }
          });

          upstreamRes.on('end', () => {
            clearUpstreamResponseTimeout();
            try {
              // Process any remaining buffer
              if (buffer.trim()) {
                lifecycle.update(buffer);
                const processedEvent = this.processSSEEvent(buffer, mapper);
                clientRes.write(processedEvent + '\n\n');
              }

              // Safety net: if upstream sent data but no content blocks, inject synthetic response
              if (!lifecycle.hasContent && isSuccessResponse && lifecycle.hasData) {
                this.writeLog(
                  'warn',
                  '[tool-sanitization-proxy] Empty response detected from upstream (no content blocks). Injecting synthetic response to prevent client crash.'
                );
                clientRes.write(
                  this.buildSyntheticErrorResponse(
                    lifecycle.hasMessageStart,
                    lifecycle.hasMessageDelta,
                    lifecycle.hasMessageStop
                  )
                );
              }

              clientRes.end();
            } catch {
              // Client may have disconnected — safe to ignore
            }
            resolve();
          });

          upstreamRes.on('error', (error) => {
            clearUpstreamResponseTimeout();
            reject(error);
          });
        }
      );

      clearResponseTimeout = this.startResponseTimeout(upstreamReq);
      upstreamReq.on('timeout', () => upstreamReq.destroy(new Error('Upstream request timeout')));
      upstreamReq.on('error', (err) => {
        clearResponseTimeout();
        reject(err);
      });
      upstreamReq.write(bodyString);
      upstreamReq.end();
    });
  }

  /**
   * Process a single SSE event, restoring tool names if present.
   */
  private processSSEEvent(event: string, mapper: ToolNameMapper): string {
    // Parse SSE format: data: {...}
    const lines = event.split('\n');
    const processedLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const jsonStr = line.slice(6); // Remove 'data: ' prefix

        // Skip [DONE] marker
        if (jsonStr.trim() === '[DONE]') {
          processedLines.push(line);
          continue;
        }

        try {
          const data = JSON.parse(jsonStr);

          // Handle content_block_start with tool_use
          if (
            isRecord(data) &&
            data.type === 'content_block_start' &&
            isRecord(data.content_block) &&
            data.content_block.type === 'tool_use' &&
            typeof data.content_block.name === 'string'
          ) {
            const originalName = mapper.restoreName(data.content_block.name);
            data.content_block.name = originalName;
            processedLines.push('data: ' + JSON.stringify(data));
            continue;
          }

          // Handle message with content array (final message)
          if (isRecord(data) && Array.isArray(data.content)) {
            data.content = mapper.restoreToolUse(data.content as ContentBlock[]);
            processedLines.push('data: ' + JSON.stringify(data));
            continue;
          }

          // Pass through unchanged
          processedLines.push(line);
        } catch {
          // Not valid JSON, pass through unchanged
          processedLines.push(line);
        }
      } else {
        // Non-data lines (event:, id:, etc.) pass through
        processedLines.push(line);
      }
    }

    return processedLines.join('\n');
  }

  /**
   * Build a synthetic minimal SSE response when upstream returns empty content.
   * Prevents Claude Code from crashing with "No assistant message found".
   * Omits lifecycle events that upstream already sent to avoid protocol violations.
   */
  private buildSyntheticErrorResponse(
    upstreamSentMessageStart = false,
    upstreamSentMessageDelta = false,
    upstreamSentMessageStop = false
  ): string {
    const events: string[] = [];

    // Only include message_start if upstream didn't already send one
    if (!upstreamSentMessageStart) {
      const msgId = `msg_synthetic_${Date.now()}`;
      events.push(
        `event: message_start\ndata: {"type":"message_start","message":{"id":"${msgId}","type":"message","role":"assistant","content":[],"model":"unknown","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":0,"output_tokens":0}}}`
      );
    }

    events.push(
      `event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`,
      `event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"[Proxy Error] The upstream API returned an empty response. This typically occurs when the proxy drops unsigned thinking blocks during sub-agent execution. Please retry the request."}}`,
      `event: content_block_stop\ndata: {"type":"content_block_stop","index":0}`
    );

    if (!upstreamSentMessageDelta) {
      events.push(
        `event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"input_tokens":0,"output_tokens":0}}`
      );
    }

    if (!upstreamSentMessageStop) {
      events.push(`event: message_stop\ndata: {"type":"message_stop"}`);
    }

    return events.join('\n\n') + '\n\n';
  }
}
