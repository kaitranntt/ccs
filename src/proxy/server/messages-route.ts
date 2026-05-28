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
import { resolveOpenAIChatCompletionsUrl } from '../upstream-url';
import { createLogger } from '../../services/logging';
import { pipeWebResponseToNode, readJsonBody, writeJson } from './http-helpers';

const REQUEST_TIMEOUT_MS = 600_000;
const DIRECT_OPENAI_REASONING_CHAT_MODEL = /^(?:gpt-5|o[134])(?:[-.]|$)/;
const logger = createLogger('proxy:openai-compat:messages');

class ProxyInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProxyInputError';
  }
}

function buildUpstreamHeaders(profile: OpenAICompatProfileConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${profile.apiKey}`,
    'User-Agent': 'CCS-OpenAI-Compat-Proxy/1.0',
  };
}

function isDirectOpenAIReasoningChatModel(
  profile: OpenAICompatProfileConfig,
  model: string | undefined
): boolean {
  return (
    profile.provider === 'openai' &&
    typeof model === 'string' &&
    DIRECT_OPENAI_REASONING_CHAT_MODEL.test(model.trim().toLowerCase())
  );
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

  if (!isDirectOpenAIReasoningChatModel(profile, shaped.model)) {
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
  rawBody: unknown
): { body: string; route: ReturnType<typeof resolveProxyRequestRoute> } {
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
  insecureDispatcher?: Dispatcher
): RequestInit {
  const init: RequestInit = {
    method: 'POST',
    headers: buildUpstreamHeaders(profile),
    body,
    signal,
  };

  if (insecureDispatcher) {
    (init as Record<string, unknown>).dispatcher = insecureDispatcher;
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
    const rawBody = await readJsonBody(req);
    logger.stage('transform', 'request.transform.start', 'Transforming inbound proxy body');
    const upstream = buildUpstreamRequest(profile, rawBody);
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
        ? new Agent({ connect: { rejectUnauthorized: false } })
        : undefined;
    const dispatcher = useSharedInsecureDispatcher
      ? insecureDispatcher
      : useProfileInsecureTls
        ? ephemeralInsecureDispatcher
        : undefined;

    try {
      logger.stage('dispatch', 'upstream.dispatch', 'Dispatching upstream fetch', {
        profileName: profile.profileName,
        routedProfileName: upstream.route.profile.profileName,
        insecureTls: dispatcher !== undefined,
      });
      const upstreamResponse = await fetch(
        resolveOpenAIChatCompletionsUrl(upstream.route.profile.baseUrl),
        buildFetchInit(upstream.route.profile, upstream.body, controller.signal, dispatcher)
      );
      logger.stage('upstream', 'upstream.response', 'Received upstream response', {
        profileName: profile.profileName,
        routedProfileName: upstream.route.profile.profileName,
        status: upstreamResponse.status,
      });
      const response = await transformer.transform(upstreamResponse);
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
