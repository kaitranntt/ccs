import * as http from 'http';
import { Agent } from 'undici';
import type { Dispatcher } from 'undici';
import type { OpenAICompatProfileConfig } from '../profile-router';
import { resolveProxyRequestRoute } from '../request-router';
import {
  ProxyRequestTransformer,
  type ProxyOpenAIRequest,
} from '../transformers/request-transformer';
import { ProxySseStreamTransformer } from '../transformers/sse-stream-transformer';
import { isAnthropicPassthroughProfile, resolveOpenAIChatCompletionsUrl } from '../upstream-url';
import { createLogger } from '../../services/logging';
import {
  createGlobalFetchProxyDispatcher,
  type UpstreamAgentTimeoutOptions,
} from '../../utils/fetch-proxy-setup';
import { pipeWebResponseToNode, readRawBody, writeJson } from './http-helpers';

const REQUEST_TIMEOUT_MS = 600_000;
// Keep undici's per-phase timeouts above the explicit request timeout so the
// AbortController is the single authority on when an upstream request dies.
const UPSTREAM_TIMEOUT_GRACE_MS = 30_000;
const DIRECT_OPENAI_REASONING_CHAT_MODEL = /^(?:gpt-5|o[134])(?:[-.]|$)/;
const logger = createLogger('proxy:openai-compat:messages');

class ProxyInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProxyInputError';
  }
}

/**
 * Build the upstream request headers. Preserves the original User-Agent from
 * the incoming request when available, since some providers (e.g. Kimi)
 * reject requests from unknown User-Agents. Falls back to a stable
 * `CCS-OpenAI-Compat-Proxy/<version>` User-Agent when the client did not
 * provide one.
 */
function buildUpstreamHeaders(
  profile: OpenAICompatProfileConfig,
  incomingHeaders: http.IncomingHttpHeaders,
  options: { preserveUserAgent?: boolean } = {}
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${profile.apiKey}`,
    'User-Agent': 'CCS-OpenAI-Compat-Proxy/1.0',
  };

  if (options.preserveUserAgent) {
    // Preserve the original User-Agent (or x-stainless-user-agent fallback) so
    // providers that require a recognized coding-agent identifier accept the
    // passthrough request.
    const rawUserAgent = pickHeaderValue(incomingHeaders, ['user-agent', 'x-stainless-user-agent']);
    headers['User-Agent'] = rawUserAgent?.trim() || headers['User-Agent'];
  }

  return headers;
}

function pickHeaderValue(headers: http.IncomingHttpHeaders, names: string[]): string | undefined {
  for (const name of names) {
    const value = headers[name];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
      return value[0];
    }
  }
  return undefined;
}

function isKnownOpenAIReasoningChatModel(model: string | undefined): boolean {
  if (typeof model !== 'string') {
    return false;
  }

  const normalized = model.trim().toLowerCase();
  const modelName = normalized.split('/').pop() || normalized;
  return DIRECT_OPENAI_REASONING_CHAT_MODEL.test(modelName);
}

function shouldShapeOpenAIReasoningChatPayload(
  profile: OpenAICompatProfileConfig,
  model: string | undefined
): boolean {
  return profile.forceOpenAIReasoningModel === true || isKnownOpenAIReasoningChatModel(model);
}

function isMiniMaxOpenAICompatProfile(profile: OpenAICompatProfileConfig): boolean {
  try {
    return new URL(profile.baseUrl).hostname.toLowerCase().includes('minimax');
  } catch {
    return false;
  }
}

function prependTextToContent(
  content: ProxyOpenAIRequest['messages'][number]['content'],
  text: string
): ProxyOpenAIRequest['messages'][number]['content'] {
  if (Array.isArray(content)) {
    return [{ type: 'text', text }, ...content];
  }
  if (typeof content === 'string') {
    return `${text}\n\n${content}`;
  }
  return text;
}

function extractTextContent(content: ProxyOpenAIRequest['messages'][number]['content']): string {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('\n\n');
}

function shapeMiniMaxChatPayload(payload: ProxyOpenAIRequest): ProxyOpenAIRequest {
  const systemMessages: string[] = [];
  let removedSystemMessage = false;
  const messages = payload.messages.filter((message) => {
    if (message.role !== 'system') {
      return true;
    }
    removedSystemMessage = true;
    const systemText = extractTextContent(message.content).trim();
    if (systemText.length > 0) {
      systemMessages.push(systemText);
    }
    return false;
  });

  if (!removedSystemMessage) {
    return payload;
  }

  if (systemMessages.length === 0) {
    return { ...payload, messages };
  }

  const systemPrefix = systemMessages.join('\n\n');
  const firstUserIndex = messages.findIndex((message) => message.role === 'user');

  if (firstUserIndex >= 0) {
    messages[firstUserIndex] = {
      ...messages[firstUserIndex],
      content: prependTextToContent(messages[firstUserIndex].content, systemPrefix),
    };
  } else {
    messages.unshift({ role: 'user', content: systemPrefix });
  }

  return { ...payload, messages };
}

function shapeUpstreamChatPayload(
  payload: ProxyOpenAIRequest,
  profile: OpenAICompatProfileConfig
): ProxyOpenAIRequest {
  let shaped = payload;

  if (isMiniMaxOpenAICompatProfile(profile)) {
    shaped = shapeMiniMaxChatPayload(shaped);
  }

  if (!shouldShapeOpenAIReasoningChatPayload(profile, shaped.model)) {
    return shaped;
  }

  shaped = { ...shaped };

  if (shaped.max_tokens !== undefined) {
    shaped.max_completion_tokens = shaped.max_tokens;
    delete shaped.max_tokens;
  }

  delete shaped.metadata;

  if ((shaped.tools?.length ?? 0) > 0) {
    delete shaped.reasoning_effort;
  }

  return shaped;
}

function buildUpstreamRequest(
  profile: OpenAICompatProfileConfig,
  rawBody: unknown,
  options: {
    passthrough?: boolean;
    rawBodyText?: string;
    route?: ReturnType<typeof resolveProxyRequestRoute>;
  } = {}
): { body: string; route: ReturnType<typeof resolveProxyRequestRoute> } {
  // In passthrough mode we forward the incoming Anthropic body verbatim to
  // the upstream provider, skipping both the Anthropic→OpenAI translation
  // and the per-provider payload shaping. The body is still serialized as
  // a string so we can stream it on the wire.
  if (options.passthrough) {
    if (rawBody === undefined || rawBody === null) {
      throw new ProxyInputError('Missing request body');
    }
    const body = options.rawBodyText ?? JSON.stringify(rawBody);
    if (!body.trim()) {
      throw new ProxyInputError('Missing request body');
    }
    const route = options.route ?? resolveProxyRequestRoute(profile, buildRoutingRequest(rawBody));
    return { body, route };
  }

  let transformed: ProxyOpenAIRequest;
  try {
    const transformer = new ProxyRequestTransformer();
    transformed = transformer.transform(rawBody);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid Anthropic request';
    throw new ProxyInputError(message);
  }
  const route = resolveProxyRequestRoute(profile, transformed);
  const body = shapeUpstreamChatPayload(
    {
      ...transformed,
      model: route.model || route.profile.model,
      stream: transformed.stream === true,
    },
    route.profile
  );
  return { body: JSON.stringify(body), route };
}

function parseJsonBodyText(rawBodyText: string): unknown {
  const raw = rawBodyText.trim();
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new ProxyInputError('Invalid JSON in request body');
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function routingTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((part) => {
      const parsed = asRecord(part);
      if (!parsed) {
        return '';
      }
      if (parsed.type === 'text' && typeof parsed.text === 'string') {
        return parsed.text;
      }
      if (parsed.type === 'image') {
        return '[image]';
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function routingMessages(messages: unknown): ProxyOpenAIRequest['messages'] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages.flatMap((message): ProxyOpenAIRequest['messages'] => {
    const parsed = asRecord(message);
    const role = parsed?.role;
    if (role !== 'system' && role !== 'user' && role !== 'assistant' && role !== 'tool') {
      return [];
    }

    return [
      {
        role,
        content: routingTextContent(parsed?.content),
      },
    ];
  });
}

function routingTools(tools: unknown): ProxyOpenAIRequest['tools'] | undefined {
  if (!Array.isArray(tools)) {
    return undefined;
  }

  const normalized = tools.flatMap((tool): NonNullable<ProxyOpenAIRequest['tools']> => {
    const parsed = asRecord(tool);
    const fn = asRecord(parsed?.function);
    if (parsed?.type !== 'function' || typeof fn?.name !== 'string') {
      return [];
    }
    return [
      {
        type: 'function',
        function: {
          name: fn.name,
          description: typeof fn.description === 'string' ? fn.description : undefined,
          parameters: asRecord(fn.parameters) ?? {},
        },
      },
    ];
  });

  return normalized.length > 0 ? normalized : undefined;
}

function buildRoutingRequest(rawBody: unknown): ProxyOpenAIRequest {
  const parsed = asRecord(rawBody);
  const model = typeof parsed?.model === 'string' ? parsed.model : undefined;
  const thinking = asRecord(parsed?.thinking);
  const thinkingEnabled = thinking?.type === 'enabled' || thinking?.type === 'adaptive';

  return {
    model,
    stream: parsed?.stream === true,
    messages: routingMessages(parsed?.messages),
    tools: routingTools(parsed?.tools),
    reasoning: thinkingEnabled
      ? {
          enabled: true,
          effort: 'high',
        }
      : undefined,
  };
}

export function extractIncomingProxyToken(headers: http.IncomingHttpHeaders): string | null {
  const xApiKey = headers['x-api-key'];
  if (typeof xApiKey === 'string' && xApiKey.trim().length > 0) {
    return xApiKey.trim();
  }

  const anthropicApiKey = headers['anthropic-api-key'];
  if (typeof anthropicApiKey === 'string' && anthropicApiKey.trim().length > 0) {
    return anthropicApiKey.trim();
  }

  const authHeader = headers.authorization;
  if (typeof authHeader === 'string' && authHeader.trim().length > 0) {
    const trimmed = authHeader.trim();
    const bearerPrefix = 'Bearer ';
    return trimmed.startsWith(bearerPrefix) ? trimmed.slice(bearerPrefix.length).trim() : trimmed;
  }

  return null;
}

export function validateIncomingProxyAuth(
  headers: http.IncomingHttpHeaders,
  expectedToken: string
): boolean {
  return extractIncomingProxyToken(headers) === expectedToken;
}

function buildFetchInit(
  profile: OpenAICompatProfileConfig,
  body: string,
  signal: AbortSignal,
  incomingHeaders: http.IncomingHttpHeaders,
  preserveUserAgent: boolean,
  dispatcher?: Dispatcher
): RequestInit {
  const init: RequestInit = {
    method: 'POST',
    headers: buildUpstreamHeaders(profile, incomingHeaders, { preserveUserAgent }),
    body,
    signal,
  };

  if (dispatcher) {
    (init as Record<string, unknown>).dispatcher = dispatcher;
  }

  return init;
}

function getRequestTimeoutMs(): number {
  const rawValue = process.env.CCS_OPENAI_PROXY_REQUEST_TIMEOUT_MS;
  if (!rawValue) {
    return REQUEST_TIMEOUT_MS;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : REQUEST_TIMEOUT_MS;
}

/**
 * undici defaults `headersTimeout`/`bodyTimeout` to 300s, which silently
 * undercuts {@link REQUEST_TIMEOUT_MS} (600s) and the
 * `CCS_OPENAI_PROXY_REQUEST_TIMEOUT_MS` override: slow upstreams (self-hosted
 * LLMs with long queue + prefill phases) get their socket closed at 300s with
 * a generic connection error instead of the proxy's timeout response. Every
 * dispatcher used for upstream fetches must carry these options.
 */
export function buildUpstreamAgentTimeouts(): UpstreamAgentTimeoutOptions {
  const ceiling = getRequestTimeoutMs() + UPSTREAM_TIMEOUT_GRACE_MS;
  return { headersTimeout: ceiling, bodyTimeout: ceiling };
}

let defaultUpstreamDispatcher: Dispatcher | null = null;

function getDefaultUpstreamDispatcher(): Dispatcher {
  if (!defaultUpstreamDispatcher) {
    const timeouts = buildUpstreamAgentTimeouts();
    // Honor HTTP(S)_PROXY routing when configured; otherwise a plain Agent.
    defaultUpstreamDispatcher = createGlobalFetchProxyDispatcher(timeouts) ?? new Agent(timeouts);
  }
  return defaultUpstreamDispatcher;
}

function formatTimeoutDuration(timeoutMs: number): string {
  return timeoutMs % 1000 === 0 ? `${timeoutMs / 1000} seconds` : `${timeoutMs}ms`;
}

function registerOnceListener(
  emitter: NodeJS.EventEmitter | null | undefined,
  event: string,
  handler: () => void
): () => void {
  if (!emitter) {
    return () => {};
  }

  emitter.once(event, handler);
  return () => {
    emitter.removeListener(event, handler);
  };
}

export function attachDisconnectAbortHandlers(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  controller: AbortController,
  onDisconnect: (source: string) => void
): () => void {
  const abortOnDisconnect = (source: string) => {
    if (!controller.signal.aborted && !res.writableEnded) {
      onDisconnect(source);
      controller.abort();
    }
  };

  const cleanupFns = [
    registerOnceListener(req, 'aborted', () => abortOnDisconnect('req.aborted')),
    registerOnceListener(req.socket, 'close', () => abortOnDisconnect('req.socket.close')),
    registerOnceListener(res.socket, 'close', () => abortOnDisconnect('res.socket.close')),
  ];

  const disconnectPoll = setInterval(() => {
    if (req.socket?.destroyed === true) {
      abortOnDisconnect('poll.socket.destroyed');
    }
  }, 50);

  return () => {
    clearInterval(disconnectPoll);
    for (const cleanup of cleanupFns) {
      cleanup();
    }
  };
}

export async function handleProxyMessagesRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  profile: OpenAICompatProfileConfig,
  expectedAuthToken: string,
  insecureDispatcher?: Dispatcher
): Promise<void> {
  const transformer = new ProxySseStreamTransformer();
  const startedAt = Date.now();

  logger.stage('intake', 'request.received', 'Proxy /v1/messages request received', {
    method: req.method || 'POST',
    remoteAddress: req.socket.remoteAddress || null,
  });

  if (!validateIncomingProxyAuth(req.headers, expectedAuthToken)) {
    logger.stage(
      'auth',
      'auth.invalid',
      'Rejected proxy message request with invalid auth token',
      {
        remoteAddress: req.socket.remoteAddress || null,
      },
      { level: 'warn' }
    );
    await pipeWebResponseToNode(
      transformer.error(401, 'authentication_error', 'Missing or invalid local proxy token'),
      res
    );
    return;
  }

  logger.stage('auth', 'auth.ok', 'Proxy auth validated');

  let timeoutMs = REQUEST_TIMEOUT_MS;
  try {
    const rawBodyText = await readRawBody(req);
    const rawBody = parseJsonBodyText(rawBodyText);
    const initialRoute = resolveProxyRequestRoute(profile, buildRoutingRequest(rawBody));
    const passthrough = isAnthropicPassthroughProfile(initialRoute.profile.baseUrl, {
      forcePassthrough: initialRoute.profile.passthrough === true,
    });
    logger.stage('transform', 'request.transform.start', 'Transforming inbound proxy body', {
      passthrough,
    });
    const upstream = buildUpstreamRequest(profile, rawBody, {
      passthrough,
      rawBodyText,
      route: passthrough ? initialRoute : undefined,
    });
    logger.stage('route', 'request.routed', 'Resolved proxy upstream route', {
      profileName: upstream.route.profile.profileName,
      provider: upstream.route.profile.provider,
      baseUrl: upstream.route.profile.baseUrl,
      model: upstream.route.model || upstream.route.profile.model || null,
      routeSource: upstream.route.source,
      scenario: upstream.route.scenario || null,
      estimatedTokens: upstream.route.estimatedTokens,
    });
    const controller = new AbortController();
    timeoutMs = getRequestTimeoutMs();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const cleanupDisconnectHandlers = attachDisconnectAbortHandlers(
      req,
      res,
      controller,
      (source) => {
        logger.stage(
          'cleanup',
          'request.disconnect',
          'Aborting upstream request after local client disconnect',
          {
            profileName: profile.profileName,
            source,
          }
        );
      }
    );

    const useSharedInsecureDispatcher =
      insecureDispatcher !== undefined &&
      upstream.route.profile.profileName === profile.profileName;
    const useProfileInsecureTls = upstream.route.profile.insecure === true;
    const ephemeralInsecureDispatcher =
      useProfileInsecureTls && !useSharedInsecureDispatcher
        ? new Agent({ connect: { rejectUnauthorized: false }, ...buildUpstreamAgentTimeouts() })
        : undefined;
    const insecureTls = useSharedInsecureDispatcher || useProfileInsecureTls;
    const dispatcher = useSharedInsecureDispatcher
      ? insecureDispatcher
      : useProfileInsecureTls
        ? ephemeralInsecureDispatcher
        : getDefaultUpstreamDispatcher();

    try {
      logger.stage('dispatch', 'upstream.dispatch', 'Dispatching upstream fetch', {
        profileName: profile.profileName,
        routedProfileName: upstream.route.profile.profileName,
        insecureTls,
        passthrough,
      });
      const upstreamUrl = resolveOpenAIChatCompletionsUrl(upstream.route.profile.baseUrl, {
        passthrough,
      });
      const upstreamResponse = await fetch(
        upstreamUrl,
        buildFetchInit(
          upstream.route.profile,
          upstream.body,
          controller.signal,
          req.headers,
          passthrough,
          dispatcher
        )
      );
      logger.stage('upstream', 'upstream.response', 'Received upstream response', {
        profileName: profile.profileName,
        routedProfileName: upstream.route.profile.profileName,
        status: upstreamResponse.status,
      });
      // In passthrough mode the upstream already returns Anthropic-format
      // bytes, so we just pipe the response through unchanged. The SSE
      // transformer is only used for OpenAI-mode responses that need to
      // be re-encoded as Anthropic SSE.
      const response = passthrough
        ? upstreamResponse
        : await transformer.transform(upstreamResponse);
      await pipeWebResponseToNode(response, res);
      logger.stage('respond', 'request.respond', 'Proxy response written', undefined, {
        latencyMs: Date.now() - startedAt,
      });
    } finally {
      clearTimeout(timeout);
      cleanupDisconnectHandlers();
      if (ephemeralInsecureDispatcher) {
        try {
          await ephemeralInsecureDispatcher.close();
        } catch (closeError) {
          logger.stage(
            'cleanup',
            'request.dispatcher_close_failed',
            'Failed to close per-request insecure dispatcher',
            {
              profileName: profile.profileName,
              routedProfileName: upstream.route.profile.profileName,
              error: closeError instanceof Error ? closeError.message : String(closeError),
            },
            { level: 'warn' }
          );
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown proxy error';
    const errInfo = {
      name: error instanceof Error ? error.name : 'Error',
      message,
    };
    logger.stage(
      'cleanup',
      'request.failed',
      'Proxy message request failed',
      {
        profileName: profile.profileName,
        abort: error instanceof Error && error.name === 'AbortError',
      },
      {
        level: 'error',
        latencyMs: Date.now() - startedAt,
        error: errInfo,
      }
    );
    const status =
      error instanceof Error && error.name === 'AbortError'
        ? 502
        : error instanceof ProxyInputError
          ? 400
          : message.includes('Request body too large')
            ? 413
            : message.includes('Invalid JSON')
              ? 400
              : 502;
    const type = status >= 500 ? 'api_error' : 'invalid_request_error';
    await pipeWebResponseToNode(
      transformer.error(
        status,
        type,
        error instanceof Error && error.name === 'AbortError'
          ? `The upstream provider did not respond within ${formatTimeoutDuration(timeoutMs)}`
          : message
      ),
      res
    );
  }
}

export function handleProxyModelsRequest(
  res: http.ServerResponse,
  profile: OpenAICompatProfileConfig
): void {
  const data = [profile.model, profile.opusModel, profile.sonnetModel, profile.haikuModel]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map((id) => ({
      id,
      object: 'model',
      created: 0,
      owned_by: profile.provider,
    }));

  writeJson(res, 200, { object: 'list', data });
}
