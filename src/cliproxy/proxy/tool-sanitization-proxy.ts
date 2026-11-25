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
import { URL } from 'url';
import { ToolNameMapper, type Tool, type ContentBlock } from '../ai-providers/tool-name-mapper';
import { sanitizeToolSchemas } from '../ai-providers/schema-sanitizer';
import {
  extractProviderFromPathname,
  getDeniedModelIdReasonForProvider,
  normalizeModelIdForRouting,
  parseCodexModelTuningAlias,
  stripCodexEffortSuffix,
} from '../ai-providers/model-id-normalizer';
import { getModelMaxLevel } from '../model-catalog';
import {
  injectCodexRequestTuningIntoBody,
  normalizeCodexEffortForModel,
} from '../ai-providers/codex-reasoning-proxy';
import { stripModelConfigurationSuffixes } from '../../shared/extended-context-utils';

import { createLogger } from '../../services/logging';
import {
  readRequestBody,
  RequestBodyTooLargeError,
  respondRequestTooLarge,
} from '../../utils/request-body';
import {
  attachUpstreamResponseTimeout,
  resolveUpstreamTimeoutMs,
  writeForwardResponseHead,
} from './upstream-response-timeout';
import { hasEncodedBody, setUpstreamAcceptEncoding } from './content-encoding';

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
  /**
   * Reduce tool input_schema to Gemini's supported subset (default true).
   * Disable when every request reaches Anthropic, which accepts full JSON Schema:
   * stripping there drops real constraints (const, allOf, exclusiveMinimum, ...).
   */
  sanitizeSchemas?: boolean;
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
const THINKING_SUFFIX_REGEX = /\([^()]*\)$/;
const LEGACY_CODEX_MODEL_ID_REGEX = /^gpt-5(?:\.\d+)?-codex(?:-(?:mini|max))?$/i;

/** Claude Code's advisor tool carries its own model id in the tool definition. */
const ADVISOR_TOOL_TYPE_PREFIX = 'advisor_';

/**
 * Strip transient CCS configuration suffixes from advisor tool model ids.
 *
 * Claude Code's advisor tool (`type: "advisor_*"`) sends the advisor model in
 * the tool definition's own `model` field, and that copy inherits the effort
 * suffix that CCS puts on `ANTHROPIC_MODEL` (for example
 * `claude-opus-5-5(high)`). Anthropic rejects that suffix inside a tool with
 * `400 invalid_request_error: tools.N.model`, after which Claude Code turns
 * the advisor off for the conversation.
 *
 * CLIProxyAPI only cleans the top-level `model`, so the per-tool copy has to
 * be cleaned here. `stripModelConfigurationSuffixes` removes the `[1m]`
 * extended-context marker and the trailing `(level)` effort marker, both of
 * which are CCS-only decorations that never belong in a model id sent to the
 * Anthropic API. The two markers can be appended in either order, so strip
 * repeatedly until the id stops changing.
 */
function stripAdvisorToolModelSuffixes(tools: Tool[]): {
  tools: Tool[];
  changedByTool: Array<{ name: string; from: string; to: string }>;
} {
  const changedByTool: Array<{ name: string; from: string; to: string }> = [];

  const sanitizedTools = tools.map((tool) => {
    const toolType = typeof tool.type === 'string' ? tool.type : null;
    const toolModel = typeof tool.model === 'string' ? tool.model : null;
    if (!toolType?.startsWith(ADVISOR_TOOL_TYPE_PREFIX) || toolModel === null) {
      return tool;
    }

    let strippedModel = toolModel;
    for (;;) {
      const next = stripModelConfigurationSuffixes(strippedModel);
      if (next === strippedModel) break;
      strippedModel = next;
    }
    if (strippedModel === toolModel || strippedModel.length === 0) {
      return tool;
    }

    changedByTool.push({ name: tool.name, from: toolModel, to: strippedModel });
    return { ...tool, model: strippedModel };
  });

  return { tools: sanitizedTools, changedByTool };
}

function canonicalizeCodexModelId(model: string | undefined): string | null {
  const normalizedModel = model?.trim().toLowerCase();
  if (!normalizedModel) {
    return null;
  }

  const withoutExtendedContext = normalizedModel.replace(EXTENDED_CONTEXT_SUFFIX_REGEX, '').trim();
  const withoutThinkingSuffix = withoutExtendedContext.replace(THINKING_SUFFIX_REGEX, '').trim();
  return stripCodexEffortSuffix(withoutThinkingSuffix);
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

function isCodexRequest(providerFromPath: string | null, model: unknown): boolean {
  return (
    providerFromPath === 'codex' ||
    (providerFromPath === null && typeof model === 'string' && isKnownCodexModelId(model))
  );
}

function applyCodexModelTuningAlias(body: Record<string, unknown>): Record<string, unknown> {
  if (typeof body.model !== 'string') {
    return body;
  }

  const parsed = parseCodexModelTuningAlias(body.model);
  if (!parsed || !isKnownCodexModelId(parsed.baseModel)) {
    return body;
  }

  return injectCodexRequestTuningIntoBody(
    { ...body, model: parsed.baseModel },
    {
      effort: parsed.effort ? normalizeCodexEffortForModel(parsed.baseModel, parsed.effort) : null,
      serviceTier: parsed.serviceTier,
    }
  ) as Record<string, unknown>;
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

    // Only buffer+rewrite JSON POST requests
    const contentType = String(req.headers['content-type'] || '');
    const isJson = contentType.includes('application/json');
    const shouldRewrite = isJson && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase());

    try {
      if (!shouldRewrite) {
        await this.forwardRaw(req, res, fullUpstreamUrl);
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
          this.logger.warn(
            'tool-sanitization.proxy.model-normalized',
            `Model normalized for provider routing (${providerFromPath ?? 'root'}): "${modifiedBody.model}" → "${normalizedModel}"`,
            {
              provider: providerFromPath ?? 'root',
              from: modifiedBody.model,
              to: normalizedModel,
            }
          );
          modifiedBody = { ...modifiedBody, model: normalizedModel };
        }
      }

      if (isRecord(modifiedBody) && isCodexRequest(providerFromPath, modifiedBody.model)) {
        modifiedBody = applyCodexModelTuningAlias(modifiedBody);
      }

      // Sanitize tools if present
      if (isRecord(modifiedBody) && Array.isArray(modifiedBody.tools)) {
        // Step 1: Sanitize input_schema properties (remove non-standard JSON Schema properties)
        const requestTools = modifiedBody.tools as Array<{
          name: string;
          input_schema?: Record<string, unknown>;
        }>;
        const schemaResult = this.config.sanitizeSchemas
          ? sanitizeToolSchemas(requestTools)
          : { tools: requestTools, totalRemoved: 0, removedByTool: [] };

        if (schemaResult.totalRemoved > 0) {
          for (const entry of schemaResult.removedByTool) {
            this.logger.warn(
              'tool-sanitization.proxy.schema-sanitized',
              `Schema sanitized for "${entry.name}": removed ${entry.removed.length} Gemini-unsupported properties`,
              { tool: entry.name, removedFields: entry.removed }
            );
          }
          if (this.config.verbose) {
            this.logger.info(
              'tool-sanitization.proxy.schema-summary',
              `Sanitized ${schemaResult.totalRemoved} schema properties across ${schemaResult.removedByTool.length} tool(s)`,
              {
                totalRemoved: schemaResult.totalRemoved,
                toolCount: schemaResult.removedByTool.length,
              }
            );
          }
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
              this.logger.warn(
                'tool-sanitization.proxy.fields-stripped',
                `Tool fields stripped for "${entry.name}" (${providerFromPath ?? 'model-routed'}): ${entry.removed.join(', ')}`,
                {
                  tool: entry.name,
                  provider: providerFromPath ?? 'model-routed',
                  removedFields: entry.removed,
                }
              );
            }
            if (this.config.verbose) {
              this.logger.info(
                'tool-sanitization.proxy.fields-summary',
                `Stripped ${fieldResult.totalRemoved} unsupported top-level tool field(s) across ${fieldResult.removedByTool.length} tool(s)`,
                {
                  totalRemoved: fieldResult.totalRemoved,
                  toolCount: fieldResult.removedByTool.length,
                }
              );
            }
          }

          rewrittenTools = fieldResult.tools;
        }

        // Step 2: Drop CCS config suffixes from per-tool model ids (Claude Code advisor)
        const toolModelResult = stripAdvisorToolModelSuffixes(rewrittenTools);
        if (toolModelResult.changedByTool.length > 0) {
          for (const entry of toolModelResult.changedByTool) {
            this.logger.warn(
              'tool-sanitization.proxy.tool-model-normalized',
              `Tool model suffix stripped for "${entry.name}": "${entry.from}" -> "${entry.to}"`,
              { tool: entry.name, from: entry.from, to: entry.to }
            );
          }
          rewrittenTools = toolModelResult.tools;
        }

        // Step 3: Sanitize tool names (truncate to 64 chars for Gemini)
        const sanitizedTools = mapper.registerTools(rewrittenTools);
        modifiedBody = { ...modifiedBody, tools: sanitizedTools };

        // Log sanitization warnings
        if (mapper.hasChanges()) {
          const changes = mapper.getChanges();
          if (this.config.warnOnSanitize) {
            for (const change of changes) {
              this.logger.warn(
                'tool-sanitization.proxy.name-sanitized',
                `Tool name sanitized: "${change.original}" → "${change.sanitized}"`,
                { from: change.original, to: change.sanitized }
              );
            }
          }
          if (this.config.verbose) {
            this.logger.info(
              'tool-sanitization.proxy.name-summary',
              `Sanitized ${changes.length} tool name(s)`,
              { count: changes.length }
            );
          }
        }

        // Warn about hash collisions (multiple originals → same sanitized)
        if (mapper.hasCollisions()) {
          const collisions = mapper.getCollisions();
          for (const collision of collisions) {
            this.logger.warn(
              'tool-sanitization.proxy.hash-collision',
              `Hash collision detected: ${collision.originals.join(', ')} → "${collision.sanitized}"`,
              { originals: collision.originals, sanitized: collision.sanitized }
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
    setUpstreamAcceptEncoding(headers);

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

  private attachClientCloseAbort(
    originalReq: http.IncomingMessage,
    clientRes: http.ServerResponse,
    onAbort: () => void
  ): () => void {
    let detached = false;

    const handleDisconnect = () => {
      if (detached || clientRes.writableEnded) {
        return;
      }
      detached = true;
      onAbort();
    };

    const onReqClose = () => {
      // Node/Bun may emit 'close' on IncomingMessage when the request body finishes reading;
      // only treat it as a client abort if the request was not completely received.
      if (!originalReq.complete) {
        handleDisconnect();
      }
    };

    originalReq.once('aborted', handleDisconnect);
    originalReq.once('close', onReqClose);
    clientRes.once('close', handleDisconnect);

    return () => {
      detached = true;
      originalReq.removeListener('aborted', handleDisconnect);
      originalReq.removeListener('close', onReqClose);
      clientRes.removeListener('close', handleDisconnect);
    };
  }

  private forwardRaw(
    originalReq: http.IncomingMessage,
    clientRes: http.ServerResponse,
    upstreamUrl: URL
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const requestFn = this.getRequestFn(upstreamUrl);
      let settled = false;
      let clearResponseTimeout: () => void = () => undefined;
      let clearUpstreamResponseTimeout: () => void = () => undefined;
      let activeUpstreamRes: http.IncomingMessage | null = null;
      let cleanupClientClose: () => void = () => undefined;

      const settleResolve = () => {
        if (settled) return;
        settled = true;
        clearResponseTimeout();
        clearUpstreamResponseTimeout();
        cleanupClientClose();
        resolve();
      };

      const settleReject = (err: unknown) => {
        if (settled) return;
        settled = true;
        clearResponseTimeout();
        clearUpstreamResponseTimeout();
        cleanupClientClose();
        reject(err);
      };

      const upstreamReq = requestFn(
        this.buildRequestOptions(
          upstreamUrl,
          originalReq.method,
          this.buildForwardHeaders(originalReq.headers)
        ),
        (upstreamRes) => {
          clearResponseTimeout();
          activeUpstreamRes = upstreamRes;
          const statusCode = upstreamRes.statusCode || 200;
          let responseStarted = false;
          const writeResponseHead = () => {
            if (responseStarted) return;
            responseStarted = true;
            writeForwardResponseHead(clientRes, statusCode, upstreamRes.headers);
          };
          clearUpstreamResponseTimeout = attachUpstreamResponseTimeout({
            upstreamReq,
            upstreamRes,
            clientRes,
            timeoutMs: this.config.timeoutMs,
            onTimeout: () => settleResolve(),
          });
          upstreamRes.on('data', (chunk: Buffer) => {
            if (settled) return;
            writeResponseHead();
            const canContinue = clientRes.write(chunk);
            if (!canContinue) {
              upstreamRes.pause();
              clientRes.once('drain', () => upstreamRes.resume());
            }
          });
          upstreamRes.on('end', () => {
            writeResponseHead();
            clientRes.end();
            settleResolve();
          });
          upstreamRes.on('error', (error) => {
            settleReject(error);
          });
        }
      );

      cleanupClientClose = this.attachClientCloseAbort(originalReq, clientRes, () => {
        if (activeUpstreamRes && !activeUpstreamRes.destroyed) {
          activeUpstreamRes.destroy();
        }
        if (!upstreamReq.destroyed) {
          upstreamReq.destroy();
        }
        settleResolve();
      });

      clearResponseTimeout = this.startResponseTimeout(upstreamReq);
      upstreamReq.on('timeout', () => upstreamReq.destroy(new Error('Upstream request timeout')));
      upstreamReq.on('error', (err) => {
        settleReject(err);
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
      let settled = false;
      let clearResponseTimeout: () => void = () => undefined;
      let clearUpstreamResponseTimeout: () => void = () => undefined;
      let activeUpstreamRes: http.IncomingMessage | null = null;
      let cleanupClientClose: () => void = () => undefined;

      const settleResolve = () => {
        if (settled) return;
        settled = true;
        clearResponseTimeout();
        clearUpstreamResponseTimeout();
        cleanupClientClose();
        resolve();
      };

      const settleReject = (err: unknown) => {
        if (settled) return;
        settled = true;
        clearResponseTimeout();
        clearUpstreamResponseTimeout();
        cleanupClientClose();
        reject(err);
      };

      const upstreamReq = requestFn(
        this.buildRequestOptions(
          upstreamUrl,
          originalReq.method,
          this.buildForwardHeaders(originalReq.headers, bodyString)
        ),
        (upstreamRes) => {
          clearResponseTimeout();
          activeUpstreamRes = upstreamRes;
          clearUpstreamResponseTimeout = attachUpstreamResponseTimeout({
            upstreamReq,
            upstreamRes,
            clientRes,
            timeoutMs: this.config.timeoutMs,
            onTimeout: () => settleResolve(),
          });
          const chunks: Buffer[] = [];

          upstreamRes.on('data', (chunk: Buffer) => chunks.push(chunk));
          upstreamRes.on('end', () => {
            if (settled) return;
            try {
              const rawBody = Buffer.concat(chunks);
              if (hasEncodedBody(upstreamRes.headers)) {
                this.warnEncodedPassthrough(upstreamRes.headers);
                const headers = { ...upstreamRes.headers };
                delete headers['transfer-encoding'];
                headers['content-length'] = String(rawBody.length);
                clientRes.writeHead(upstreamRes.statusCode || 200, headers);
                clientRes.end(rawBody);
                settleResolve();
                return;
              }

              const responseBody = rawBody.toString('utf8');
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
                    delete headers['transfer-encoding'];
                    headers['content-length'] = String(Buffer.byteLength(modifiedResponse));

                    clientRes.writeHead(upstreamRes.statusCode || 200, headers);
                    clientRes.end(modifiedResponse);
                    settleResolve();
                    return;
                  }
                } catch {
                  // JSON parse failed, pass through unchanged
                }
              }

              // Pass through unchanged
              const headers = { ...upstreamRes.headers };
              delete headers['transfer-encoding'];
              headers['content-length'] = String(Buffer.byteLength(responseBody));
              clientRes.writeHead(upstreamRes.statusCode || 200, headers);
              clientRes.end(responseBody);
              settleResolve();
            } catch (err) {
              settleReject(err);
            }
          });
          upstreamRes.on('error', (error) => {
            settleReject(error);
          });
        }
      );

      cleanupClientClose = this.attachClientCloseAbort(originalReq, clientRes, () => {
        if (activeUpstreamRes && !activeUpstreamRes.destroyed) {
          activeUpstreamRes.destroy();
        }
        if (!upstreamReq.destroyed) {
          upstreamReq.destroy();
        }
        settleResolve();
      });

      clearResponseTimeout = this.startResponseTimeout(upstreamReq);
      upstreamReq.on('timeout', () => upstreamReq.destroy(new Error('Upstream request timeout')));
      upstreamReq.on('error', (err) => {
        settleReject(err);
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
      let settled = false;
      let clearResponseTimeout: () => void = () => undefined;
      let clearUpstreamResponseTimeout: () => void = () => undefined;
      let activeUpstreamRes: http.IncomingMessage | null = null;
      let cleanupClientClose: () => void = () => undefined;

      const settleResolve = () => {
        if (settled) return;
        settled = true;
        clearResponseTimeout();
        clearUpstreamResponseTimeout();
        cleanupClientClose();
        resolve();
      };

      const settleReject = (err: unknown) => {
        if (settled) return;
        settled = true;
        clearResponseTimeout();
        clearUpstreamResponseTimeout();
        cleanupClientClose();
        reject(err);
      };

      const upstreamReq = requestFn(
        this.buildRequestOptions(
          upstreamUrl,
          originalReq.method,
          this.buildForwardHeaders(originalReq.headers, bodyString)
        ),
        (upstreamRes) => {
          clearResponseTimeout();
          activeUpstreamRes = upstreamRes;
          clearUpstreamResponseTimeout = attachUpstreamResponseTimeout({
            upstreamReq,
            upstreamRes,
            clientRes,
            timeoutMs: this.config.timeoutMs,
            onTimeout: () => settleResolve(),
          });
          writeForwardResponseHead(clientRes, upstreamRes.statusCode || 200, upstreamRes.headers);

          // A compressed body can't be scanned or rewritten: forward it untouched,
          // without tool-name restoration or the empty-response safety net.
          if (hasEncodedBody(upstreamRes.headers)) {
            this.warnEncodedPassthrough(upstreamRes.headers);
            upstreamRes.on('data', (chunk: Buffer) => {
              if (settled) return;
              const canContinue = clientRes.write(chunk);
              if (!canContinue) {
                upstreamRes.pause();
                clientRes.once('drain', () => upstreamRes.resume());
              }
            });
            upstreamRes.on('end', () => {
              clientRes.end();
              settleResolve();
            });
            upstreamRes.on('error', (error) => {
              settleReject(error);
            });
            return;
          }

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
              if (settled) return;
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
              if (settled) return;
              try {
                if (!lifecycle.hasContent && isSuccessResponse && lifecycle.hasData) {
                  this.logger.warn(
                    'tool-sanitization.proxy.empty-response',
                    'Empty response detected from upstream (no content blocks). Injecting synthetic response to prevent client crash.'
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
              settleResolve();
            });
            upstreamRes.on('error', (error) => {
              settleReject(error);
            });
            return;
          }

          // Process SSE events for tool name restoration
          let buffer = '';

          upstreamRes.on('data', (chunk: Buffer) => {
            if (settled) return;
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
            if (settled) return;
            try {
              // Process any remaining buffer
              if (buffer.trim()) {
                lifecycle.update(buffer);
                const processedEvent = this.processSSEEvent(buffer, mapper);
                clientRes.write(processedEvent + '\n\n');
              }

              // Safety net: if upstream sent data but no content blocks, inject synthetic response
              if (!lifecycle.hasContent && isSuccessResponse && lifecycle.hasData) {
                this.logger.warn(
                  'tool-sanitization.proxy.empty-response',
                  'Empty response detected from upstream (no content blocks). Injecting synthetic response to prevent client crash.'
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
            settleResolve();
          });

          upstreamRes.on('error', (error) => {
            settleReject(error);
          });
        }
      );

      cleanupClientClose = this.attachClientCloseAbort(originalReq, clientRes, () => {
        if (activeUpstreamRes && !activeUpstreamRes.destroyed) {
          activeUpstreamRes.destroy();
        }
        if (!upstreamReq.destroyed) {
          upstreamReq.destroy();
        }
        settleResolve();
      });

      clearResponseTimeout = this.startResponseTimeout(upstreamReq);
      upstreamReq.on('timeout', () => upstreamReq.destroy(new Error('Upstream request timeout')));
      upstreamReq.on('error', (err) => {
        settleReject(err);
      });
      upstreamReq.write(bodyString);
      upstreamReq.end();
    });
  }

  private warnEncodedPassthrough(headers: http.IncomingHttpHeaders): void {
    this.logger.warn(
      'tool-sanitization.proxy.encoded-passthrough',
      'Upstream compressed the response despite Accept-Encoding: identity. Passing it through without tool-name restoration or the empty-response safety net.',
      { contentEncoding: headers['content-encoding'] }
    );
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
