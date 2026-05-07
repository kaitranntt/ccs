import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import {
  normalizeCodexModelId,
  parseCodexUnsupportedModelError,
  resolveRuntimeCodexFallbackModel,
} from './codex-plan-compatibility';
import { getModelMaxLevel } from '../model-catalog';

export type CodexReasoningEffort = 'medium' | 'high' | 'xhigh';
export type CodexServiceTier = 'fast';
type CodexServiceTierRequestValue = 'priority';

export interface CodexReasoningModelMap {
  opusModel?: string;
  sonnetModel?: string;
  haikuModel?: string;
  defaultModel?: string;
}

export interface CodexReasoningProxyConfig {
  upstreamBaseUrl: string;
  verbose?: boolean;
  timeoutMs?: number;
  modelMap: CodexReasoningModelMap;
  defaultEffort?: CodexReasoningEffort;
  traceFilePath?: string;
  /** Skip TLS certificate validation for self-signed remote HTTPS proxies */
  allowSelfSigned?: boolean;
  /**
   * Path prefix to strip from incoming requests before forwarding to upstream.
   * Used for remote proxy mode where upstream expects /v1/messages, not /api/provider/codex/v1/messages.
   * Example: '/api/provider/codex' will transform '/api/provider/codex/v1/messages' to '/v1/messages'
   */
  stripPathPrefix?: string;
  /** When true, skip reasoning effort injection entirely (thinking mode: off) */
  disableEffort?: boolean;
}

interface ForwardJsonContext {
  requestPath: string;
  requestedModel: string | null;
  attemptedUpstreamModel: string | null;
  effort: CodexReasoningEffort | null;
  serviceTier: CodexServiceTier | null;
  retryCount: number;
}

const EXTENDED_CONTEXT_SUFFIX_REGEX = /\[1m\]$/i;
const CODEX_TUNING_SUFFIX_TOKEN_REGEX = /-(xhigh|high|medium|fast)$/i;
const CODEX_SERVICE_TIER_REQUEST_VALUE: Record<CodexServiceTier, CodexServiceTierRequestValue> = {
  fast: 'priority',
};

function stripExtendedContextSuffix(model: string): string {
  return model.replace(EXTENDED_CONTEXT_SUFFIX_REGEX, '').trim();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseModelTuningSuffix(model: string): {
  upstreamModel: string;
  effort: CodexReasoningEffort | null;
  serviceTier: CodexServiceTier | null;
} | null {
  const normalizedModel = stripExtendedContextSuffix(model);
  let upstreamModel = normalizedModel;
  let effort: CodexReasoningEffort | null = null;
  let serviceTier: CodexServiceTier | null = null;

  for (let consumed = 0; consumed < 2; consumed += 1) {
    const match = upstreamModel.match(CODEX_TUNING_SUFFIX_TOKEN_REGEX);
    if (!match?.[1]) break;

    const token = match[1].toLowerCase();
    if (token === 'fast') {
      if (serviceTier) break;
      serviceTier = 'fast';
    } else {
      if (effort) break;
      effort = token as CodexReasoningEffort;
    }

    upstreamModel = upstreamModel.slice(0, -match[0].length).trim();
  }

  if (!effort && !serviceTier) return null;
  if (!upstreamModel) return null;
  return { upstreamModel, effort, serviceTier };
}

function isKnownCodexModelId(
  model: string,
  modelEffort: Map<string, CodexReasoningEffort>
): boolean {
  if (modelEffort.has(model)) return true;
  if (EFFORT_BY_RANK.some((effort) => modelEffort.has(`${model}-${effort}`))) {
    return true;
  }
  return getModelMaxLevel('codex', model) !== undefined;
}

const EFFORT_RANK: Record<CodexReasoningEffort, number> = {
  medium: 1,
  high: 2,
  xhigh: 3,
};

/** All valid codex effort levels in rank order */
const EFFORT_BY_RANK: CodexReasoningEffort[] = ['medium', 'high', 'xhigh'];

function minEffort(a: CodexReasoningEffort, b: CodexReasoningEffort): CodexReasoningEffort {
  return EFFORT_RANK[a] <= EFFORT_RANK[b] ? a : b;
}

/**
 * Cap effort at model's max level from catalog.
 * Returns the capped effort (or original if no cap applies).
 */
function capEffortAtModelMax(model: string, effort: CodexReasoningEffort): CodexReasoningEffort {
  const maxLevel = getModelMaxLevel('codex', model);
  if (!maxLevel) return effort;

  // Map maxLevel to CodexReasoningEffort (only medium/high/xhigh are valid)
  const maxEffort = EFFORT_BY_RANK.find((e) => e === maxLevel);
  if (!maxEffort) return effort;

  // Cap if effort exceeds max
  if (EFFORT_RANK[effort] > EFFORT_RANK[maxEffort]) {
    return maxEffort;
  }
  return effort;
}

export function buildCodexModelEffortMap(
  models: CodexReasoningModelMap,
  defaultEffort: CodexReasoningEffort = 'medium'
): Map<string, CodexReasoningEffort> {
  const map = new Map<string, CodexReasoningEffort>();

  const upsertMin = (model: string | undefined, effort: CodexReasoningEffort) => {
    if (!isNonEmptyString(model)) return;
    const normalizedModel = stripExtendedContextSuffix(model);
    if (!normalizedModel) return;
    const existing = map.get(normalizedModel);
    map.set(normalizedModel, existing ? minEffort(existing, effort) : effort);
  };

  upsertMin(models.defaultModel, 'xhigh');
  upsertMin(models.opusModel, 'xhigh');
  upsertMin(models.sonnetModel, 'high');
  upsertMin(models.haikuModel, 'medium');

  if (map.size === 0 && isNonEmptyString(models.defaultModel)) {
    map.set(models.defaultModel, defaultEffort);
  }

  return map;
}

export function getEffortForModel(
  model: string | null,
  modelEffort: Map<string, CodexReasoningEffort>,
  defaultEffort: CodexReasoningEffort
): CodexReasoningEffort {
  if (!model) return defaultEffort;
  const normalizedModel = stripExtendedContextSuffix(model);
  const effort = modelEffort.get(normalizedModel) ?? defaultEffort;
  // Apply model-specific cap from catalog
  return capEffortAtModelMax(normalizedModel, effort);
}

export function injectReasoningEffortIntoBody(
  body: unknown,
  effort: CodexReasoningEffort
): unknown {
  return injectCodexRequestTuningIntoBody(body, { effort, serviceTier: null });
}

export function injectCodexRequestTuningIntoBody(
  body: unknown,
  tuning: {
    effort: CodexReasoningEffort | null;
    serviceTier: CodexServiceTier | null;
  }
): unknown {
  if (!isRecord(body)) return body;

  // OpenAI Responses API knob: reasoning: { effort: "..." }
  // Always override effort (user expectation).
  const existingReasoning = isRecord(body.reasoning) ? body.reasoning : {};
  const tunedBody = { ...body };

  if (tuning.effort) {
    tunedBody.reasoning = {
      ...existingReasoning,
      effort: tuning.effort,
    };
  }

  if (tuning.serviceTier) {
    tunedBody.service_tier = CODEX_SERVICE_TIER_REQUEST_VALUE[tuning.serviceTier];
  }

  return tunedBody;
}

export class CodexReasoningProxy {
  private server: http.Server | null = null;
  private port: number | null = null;
  private readonly config: Required<
    Pick<
      CodexReasoningProxyConfig,
      | 'upstreamBaseUrl'
      | 'verbose'
      | 'timeoutMs'
      | 'defaultEffort'
      | 'traceFilePath'
      | 'disableEffort'
      | 'allowSelfSigned'
    >
  > &
    Pick<CodexReasoningProxyConfig, 'modelMap' | 'stripPathPrefix'>;
  private readonly modelEffort: Map<string, CodexReasoningEffort>;
  private readonly sessionFallbackByModel = new Map<string, string>();
  private readonly recent: Array<{
    at: string;
    model: string | null;
    upstreamModel: string | null;
    effort: CodexReasoningEffort | null;
    serviceTier: CodexServiceTier | null;
    path: string;
  }> = [];
  private readonly counts: Record<CodexReasoningEffort, number> = { medium: 0, high: 0, xhigh: 0 };

  constructor(config: CodexReasoningProxyConfig) {
    this.config = {
      upstreamBaseUrl: config.upstreamBaseUrl,
      verbose: config.verbose ?? false,
      timeoutMs: config.timeoutMs ?? 120000,
      modelMap: config.modelMap,
      defaultEffort: config.defaultEffort ?? 'medium',
      traceFilePath: config.traceFilePath ?? '',
      stripPathPrefix: config.stripPathPrefix,
      disableEffort: config.disableEffort ?? false,
      allowSelfSigned: config.allowSelfSigned ?? false,
    };
    this.modelEffort = buildCodexModelEffortMap(this.config.modelMap, this.config.defaultEffort);
  }

  private getRememberedFallback(model: string | null): string | null {
    if (!model) return null;
    return this.sessionFallbackByModel.get(normalizeCodexModelId(model)) ?? null;
  }

  private rememberFallback(requestedModel: string, fallbackModel: string): void {
    const normalizedRequestedModel = normalizeCodexModelId(requestedModel);
    const normalizedFallbackModel = normalizeCodexModelId(fallbackModel);
    if (!normalizedRequestedModel || !normalizedFallbackModel) return;
    this.sessionFallbackByModel.set(normalizedRequestedModel, normalizedFallbackModel);
  }

  private buildForwardBody(
    body: unknown,
    upstreamModel: string | null,
    tuning: {
      effort: CodexReasoningEffort | null;
      serviceTier: CodexServiceTier | null;
    }
  ): unknown {
    const withUpstreamModel =
      upstreamModel && isRecord(body) ? { ...body, model: upstreamModel } : body;
    const effort = this.config.disableEffort ? null : tuning.effort;
    if (!effort && !tuning.serviceTier) {
      return withUpstreamModel;
    }
    return injectCodexRequestTuningIntoBody(withUpstreamModel, {
      effort,
      serviceTier: tuning.serviceTier,
    });
  }

  private sendBufferedResponse(
    clientRes: http.ServerResponse,
    statusCode: number,
    headers: http.IncomingHttpHeaders,
    responseBody: string
  ): void {
    clientRes.writeHead(statusCode, headers);
    clientRes.end(responseBody);
  }

  /**
   * Treat trailing "-high/-medium/-xhigh" and "-fast" as Codex tuning aliases
   * only for known codex models.
   * Prevents stripping legitimate upstream model IDs that happen to end with those tokens.
   */
  private parseTuningAlias(model: string | null): {
    upstreamModel: string;
    effort: CodexReasoningEffort | null;
    serviceTier: CodexServiceTier | null;
  } | null {
    if (!model) return null;
    const parsed = parseModelTuningSuffix(model);
    if (!parsed) return null;
    if (!isKnownCodexModelId(parsed.upstreamModel, this.modelEffort)) {
      return null;
    }
    return parsed;
  }

  private log(message: string): void {
    if (this.config.verbose) {
      console.error(`[codex-reasoning-proxy] ${message}`);
    }
  }

  private trace(line: string): void {
    if (!this.config.traceFilePath) return;
    try {
      // Intentionally best-effort: tracing must never break requests.
      const fs = require('fs') as typeof import('fs');
      const pathMod = require('path') as typeof import('path');

      // Security: validate trace path against safe directories to prevent path traversal
      const resolvedPath = pathMod.resolve(this.config.traceFilePath);
      const home = process.env.HOME || process.env.USERPROFILE || '';
      const safeDirs = ['/tmp/', '/var/log/', home ? `${home}/.ccs/` : ''];
      const isSafe = safeDirs.some((base) => base && resolvedPath.startsWith(base));
      if (!isSafe) {
        this.log(`[SECURITY] Trace path rejected (outside allowed dirs): ${resolvedPath}`);
        return;
      }

      const dir = pathMod.dirname(resolvedPath);
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(resolvedPath, line + '\n');
    } catch {
      // ignore
    }
  }

  private record(
    model: string | null,
    upstreamModel: string | null,
    effort: CodexReasoningEffort | null,
    serviceTier: CodexServiceTier | null,
    path: string
  ): void {
    if (effort) {
      this.counts[effort] += 1;
    }
    this.recent.push({
      at: new Date().toISOString(),
      model,
      upstreamModel,
      effort,
      serviceTier,
      path,
    });
    if (this.recent.length > 50) this.recent.shift();
  }

  async start(): Promise<number> {
    if (this.server) return this.port ?? 0;

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        void this.handleRequest(req, res);
      });

      this.server.listen(0, '127.0.0.1', () => {
        const address = this.server?.address();
        this.port = typeof address === 'object' && address ? address.port : 0;
        resolve(this.port);
      });

      this.server.on('error', (err) => reject(err));
    });
  }

  stop(): void {
    if (!this.server) return;
    this.server.close();
    this.server = null;
    this.port = null;
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const maxSize = 10 * 1024 * 1024; // 10MB
      let total = 0;

      req.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > maxSize) {
          req.destroy(); // Signal client to stop sending
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
    let requestPath = req.url || '/';

    // Strip path prefix if configured (for remote proxy mode)
    // e.g., '/api/provider/codex/v1/messages' → '/v1/messages'
    // Boundary check: only match complete path segments (not partial like /codex matching /codextra)
    if (
      this.config.stripPathPrefix &&
      requestPath.startsWith(this.config.stripPathPrefix) &&
      (requestPath.length === this.config.stripPathPrefix.length ||
        requestPath[this.config.stripPathPrefix.length] === '/')
    ) {
      let stripped = requestPath.slice(this.config.stripPathPrefix.length);
      // Normalize: collapse any leading slashes to single slash and ensure path starts with '/'
      stripped = stripped.replace(/^\/+/, '/') || '/';
      if (!stripped.startsWith('/')) {
        stripped = '/' + stripped;
      }
      requestPath = stripped;
    }

    const upstreamBase = new URL(this.config.upstreamBaseUrl);
    const fullUpstreamUrl = new URL(requestPath, upstreamBase);

    this.log(`${method} ${requestPath} → ${fullUpstreamUrl.href}`);

    // Debug/status endpoint (no upstream call). Does not expose prompt content.
    if (method.toUpperCase() === 'GET' && requestPath === '/__ccs/reasoning') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          counts: this.counts,
          recent: this.recent,
          modelMap: this.config.modelMap,
          defaultEffort: this.config.defaultEffort,
        })
      );
      return;
    }

    // Only buffer+rewrite JSON bodies; otherwise just proxy as-is.
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

      const originalModel =
        isRecord(parsed) && typeof parsed.model === 'string' ? parsed.model : null;
      const normalizedRequestModel = originalModel
        ? stripExtendedContextSuffix(originalModel)
        : null;

      // Support "model aliases" like `gpt-5.4-high-fast` by translating to:
      // - upstream model: `gpt-5.4`
      // - reasoning.effort: `high`
      // - service_tier: `priority` (Codex request value for fast mode)
      //
      // This allows tier/speed mapping without inventing upstream model IDs.
      const suffixParsed = this.parseTuningAlias(normalizedRequestModel);
      const requestedUpstreamModel = suffixParsed?.upstreamModel ?? normalizedRequestModel;
      const rememberedFallback = this.getRememberedFallback(requestedUpstreamModel);
      const upstreamModel = rememberedFallback ?? requestedUpstreamModel;
      const requestedEffort =
        suffixParsed?.effort ??
        getEffortForModel(normalizedRequestModel, this.modelEffort, this.config.defaultEffort);
      const effort =
        !this.config.disableEffort && upstreamModel
          ? capEffortAtModelMax(upstreamModel, requestedEffort)
          : !this.config.disableEffort
            ? requestedEffort
            : null;
      const serviceTier = suffixParsed?.serviceTier ?? null;
      const rewritten = this.buildForwardBody(parsed, upstreamModel, { effort, serviceTier });

      if (effort || serviceTier) {
        this.record(originalModel, upstreamModel, effort, serviceTier, requestPath);
        this.trace(
          `[${new Date().toISOString()}] model=${originalModel ?? 'null'} upstreamModel=${
            upstreamModel ?? 'null'
          } effort=${effort ?? 'null'} serviceTier=${serviceTier ?? 'null'} path=${requestPath}`
        );
      } else {
        this.log(`[disabled] model=${originalModel ?? 'null'} -> passthrough (no reasoning)`);
      }

      if (rememberedFallback && rememberedFallback !== requestedUpstreamModel) {
        this.log(`Using remembered fallback ${requestedUpstreamModel} -> ${rememberedFallback}`);
      }

      await this.forwardJson(req, res, fullUpstreamUrl, rewritten, {
        requestPath,
        requestedModel: requestedUpstreamModel,
        attemptedUpstreamModel: upstreamModel,
        effort,
        serviceTier,
        retryCount: 0,
      });
    } catch (error) {
      const err = error as Error;
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

  /**
   * Get the appropriate request function based on protocol.
   * Uses https.request for HTTPS URLs, http.request for HTTP.
   */
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
          clientRes.writeHead(upstreamRes.statusCode || 200, upstreamRes.headers);
          upstreamRes.pipe(clientRes);
          upstreamRes.on('end', () => resolve());
          upstreamRes.on('error', reject);
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

  private forwardJson(
    originalReq: http.IncomingMessage,
    clientRes: http.ServerResponse,
    upstreamUrl: URL,
    body: unknown,
    context: ForwardJsonContext
  ): Promise<number> {
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
          const statusCode = upstreamRes.statusCode || 200;
          if (statusCode >= 200 && statusCode < 300) {
            clientRes.writeHead(statusCode, upstreamRes.headers);
            upstreamRes.pipe(clientRes);
            upstreamRes.on('end', () => resolve(statusCode));
            upstreamRes.on('error', reject);
            return;
          }

          const chunks: Buffer[] = [];
          upstreamRes.on('data', (chunk: Buffer) => chunks.push(chunk));
          upstreamRes.on('end', async () => {
            try {
              const responseBody = Buffer.concat(chunks).toString('utf8');
              const unsupportedError =
                context.retryCount === 0
                  ? parseCodexUnsupportedModelError(statusCode, responseBody)
                  : null;
              const fallbackModel =
                unsupportedError && context.requestedModel
                  ? resolveRuntimeCodexFallbackModel({
                      requestedModel: context.requestedModel,
                      modelMap: this.config.modelMap,
                      excludeModels: context.attemptedUpstreamModel
                        ? [context.attemptedUpstreamModel]
                        : undefined,
                    })
                  : null;

              if (unsupportedError && fallbackModel && context.requestedModel) {
                const retryEffort =
                  !this.config.disableEffort && context.effort
                    ? capEffortAtModelMax(fallbackModel, context.effort)
                    : null;
                const retryBody = this.buildForwardBody(body, fallbackModel, {
                  effort: retryEffort,
                  serviceTier: context.serviceTier,
                });

                this.log(
                  `Upstream rejected model "${context.attemptedUpstreamModel}". Retrying ${context.requestPath} with "${fallbackModel}".`
                );

                const retryStatusCode = await this.forwardJson(
                  originalReq,
                  clientRes,
                  upstreamUrl,
                  retryBody,
                  {
                    ...context,
                    attemptedUpstreamModel: fallbackModel,
                    effort: retryEffort,
                    retryCount: context.retryCount + 1,
                  }
                );

                if (retryStatusCode >= 200 && retryStatusCode < 300) {
                  this.rememberFallback(context.requestedModel, fallbackModel);
                }

                resolve(retryStatusCode);
                return;
              }

              this.sendBufferedResponse(clientRes, statusCode, upstreamRes.headers, responseBody);
              resolve(statusCode);
            } catch (error) {
              reject(error);
            }
          });
          upstreamRes.on('error', reject);
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
}
