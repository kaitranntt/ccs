/**
 * Cursor Daemon Entry
 *
 * Dedicated child-process entrypoint for local OpenAI-compatible Cursor proxy.
 */

import * as http from 'http';
import { Readable } from 'stream';
import { CursorExecutor } from './cursor-executor';
import {
  createAnthropicErrorResponse,
  createAnthropicProxyResponse,
} from './cursor-anthropic-response';
import { translateAnthropicRequest } from './cursor-anthropic-translator';
import { checkAuthStatus } from './cursor-auth';
import { getModelsForDaemon, resolveCursorRequestModel } from './cursor-models';
import type { CursorTool } from './cursor-protobuf-schema';

interface DaemonRuntimeOptions {
  port: number;
  ghostMode: boolean;
}

interface OpenAIMessage {
  role: string;
  content?: string | Array<{ type: string; text?: string }> | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
}

interface NormalizedOpenAIMessage {
  role: string;
  content: string | Array<{ type: string; text?: string }>;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
}

interface OpenAIChatRequest {
  model?: string;
  stream?: boolean;
  reasoning_effort?: string;
  tools?: CursorTool[];
  messages?: OpenAIMessage[];
}

const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB

function getAnthropicRequestToken(headers: http.IncomingHttpHeaders): string {
  const xApiKey = headers['x-api-key'];
  if (typeof xApiKey === 'string' && xApiKey.trim().length > 0) {
    return xApiKey.trim();
  }

  const authorization = headers.authorization;
  if (typeof authorization === 'string') {
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (match && match[1].trim().length > 0) {
      return match[1].trim();
    }
  }

  return '';
}

function writeJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const resolveOnce = (payload: unknown) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };

    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_SIZE) {
        // Stop processing body, but avoid force-closing socket so caller can return 413 cleanly.
        req.pause();
        rejectOnce(new Error('Request body too large (max 10MB)'));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolveOnce({});
        return;
      }
      try {
        resolveOnce(JSON.parse(raw));
      } catch {
        rejectOnce(new Error('Invalid JSON in request body'));
      }
    });

    req.on('error', (error) => {
      rejectOnce(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

function hasValidDaemonToken(req: http.IncomingMessage): boolean {
  const expectedToken = process.env.CCS_CURSOR_DAEMON_TOKEN;
  if (!expectedToken) {
    return false;
  }

  const provided = req.headers['x-ccs-cursor-token'];
  if (typeof provided === 'string') {
    return provided === expectedToken;
  }

  if (Array.isArray(provided)) {
    return provided.includes(expectedToken);
  }

  return false;
}
function normalizeMessages(raw: unknown): NormalizedOpenAIMessage[] {
  if (!Array.isArray(raw)) {
    throw new Error('messages must be an array');
  }

  return raw.map((message, index) => {
    if (typeof message !== 'object' || message === null) {
      throw new Error(`messages[${index}] must be an object`);
    }

    const m = message as Record<string, unknown>;
    if (typeof m.role !== 'string' || !m.role) {
      throw new Error(`messages[${index}].role must be a non-empty string`);
    }

    const content = m.content;
    if (
      content !== undefined &&
      content !== null &&
      typeof content !== 'string' &&
      !Array.isArray(content)
    ) {
      throw new Error(`messages[${index}].content must be string, array, or null`);
    }

    return {
      role: m.role,
      content: (content ?? '') as NormalizedOpenAIMessage['content'],
      name: typeof m.name === 'string' ? m.name : undefined,
      tool_call_id: typeof m.tool_call_id === 'string' ? m.tool_call_id : undefined,
      tool_calls: Array.isArray(m.tool_calls)
        ? (m.tool_calls as NormalizedOpenAIMessage['tool_calls'])
        : undefined,
    };
  });
}

async function pipeWebResponseToNode(response: Response, res: http.ServerResponse): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (!response.body) {
    res.end();
    return;
  }

  const nodeStream = Readable.fromWeb(response.body as unknown as ReadableStream<Uint8Array>);

  await new Promise<void>((resolve, reject) => {
    nodeStream.on('error', reject);
    nodeStream.on('end', resolve);
    nodeStream.pipe(res);
  });
}

function parseArgs(argv: string[]): DaemonRuntimeOptions {
  let port = 20129;
  let ghostMode = true;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port' && argv[i + 1]) {
      const parsed = parseInt(argv[i + 1], 10);
      if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
        port = parsed;
      }
      i++;
      continue;
    }

    if (arg === '--ghost-mode' && argv[i + 1]) {
      const value = argv[i + 1];
      ghostMode = value !== 'false' && value !== '0';
      i++;
      continue;
    }
  }

  return { port, ghostMode };
}

export function startCursorDaemonServer(options: DaemonRuntimeOptions): http.Server {
  const executor = new CursorExecutor();

  const server = http.createServer(async (req, res) => {
    const method = req.method || 'GET';
    const requestUrl = req.url || '/';
    const isOpenAiRoute = method === 'POST' && requestUrl === '/v1/chat/completions';
    const isAnthropicRoute = method === 'POST' && requestUrl === '/v1/messages';

    try {
      if (method === 'GET' && requestUrl === '/health') {
        if (!hasValidDaemonToken(req)) {
          writeJson(res, 401, { error: 'Unauthorized' });
          return;
        }
        writeJson(res, 200, { ok: true, service: 'cursor-daemon' });
        return;
      }

      if (method === 'GET' && requestUrl === '/v1/models') {
        const authStatus = checkAuthStatus();
        const models = await getModelsForDaemon({
          credentials:
            authStatus.authenticated && !authStatus.expired && authStatus.credentials
              ? {
                  accessToken: authStatus.credentials.accessToken,
                  machineId: authStatus.credentials.machineId,
                  ghostMode: options.ghostMode,
                }
              : null,
        });

        const data = models.map((model) => ({
          id: model.id,
          object: 'model',
          created: 0,
          owned_by: model.provider,
        }));
        writeJson(res, 200, { object: 'list', data });
        return;
      }

      if (!isOpenAiRoute && !isAnthropicRoute) {
        writeJson(res, 404, { error: 'Not found' });
        return;
      }

      if (!hasValidDaemonToken(req)) {
        writeJson(res, 401, { error: 'Unauthorized' });
        return;
      }

      const rawBody = await readJsonBody(req);
      const anthropicBody = isAnthropicRoute ? translateAnthropicRequest(rawBody) : undefined;
      const parsedBody = anthropicBody ?? ((rawBody as OpenAIChatRequest) || {});
      const messages = anthropicBody
        ? anthropicBody.messages
        : normalizeMessages(parsedBody.messages);
      const requestedModel =
        typeof parsedBody.model === 'string' && parsedBody.model.trim().length > 0
          ? parsedBody.model.trim()
          : undefined;
      const stream = parsedBody.stream === true;

      const authStatus = checkAuthStatus();
      if (!authStatus.authenticated || !authStatus.credentials) {
        const message = 'Cursor credentials not found. Run `ccs legacy cursor auth` first.';
        if (isAnthropicRoute) {
          await pipeWebResponseToNode(
            createAnthropicErrorResponse(401, 'authentication_error', message),
            res
          );
        } else {
          writeJson(res, 401, {
            error: {
              type: 'authentication_error',
              message,
            },
          });
        }
        return;
      }

      if (authStatus.expired) {
        const message = 'Cursor credentials expired. Run `ccs legacy cursor auth` again.';
        if (isAnthropicRoute) {
          await pipeWebResponseToNode(
            createAnthropicErrorResponse(401, 'authentication_error', message),
            res
          );
        } else {
          writeJson(res, 401, {
            error: {
              type: 'authentication_error',
              message,
            },
          });
        }
        return;
      }

      if (isAnthropicRoute) {
        const expectedToken = (process.env.ANTHROPIC_AUTH_TOKEN || 'cursor-managed').trim();
        const requestToken = getAnthropicRequestToken(req.headers);
        if (!expectedToken || requestToken !== expectedToken) {
          await pipeWebResponseToNode(
            createAnthropicErrorResponse(
              401,
              'authentication_error',
              'Invalid Anthropic auth token. Set ANTHROPIC_AUTH_TOKEN and send it via x-api-key or Authorization Bearer.'
            ),
            res
          );
          return;
        }
      }

      const daemonCredentials = {
        accessToken: authStatus.credentials.accessToken,
        machineId: authStatus.credentials.machineId,
        ghostMode: options.ghostMode,
      };
      const availableModels = await getModelsForDaemon({
        credentials: daemonCredentials,
      });
      const model = resolveCursorRequestModel(requestedModel, availableModels);
      if (
        requestedModel &&
        requestedModel !== model &&
        (process.env.CCS_DEBUG === '1' || process.env.CCS_DEBUG === 'true')
      ) {
        console.error(
          `[cursor] Requested model "${requestedModel}" is unavailable; falling back to "${model}".`
        );
      }

      const abortController = new AbortController();
      const abortOnDisconnect = () => {
        if (!abortController.signal.aborted && !res.writableEnded) {
          abortController.abort();
        }
      };

      req.on('aborted', abortOnDisconnect);
      req.on('close', abortOnDisconnect);
      res.on('close', abortOnDisconnect);

      const result = await executor.execute({
        model,
        stream,
        signal: abortController.signal,
        credentials: daemonCredentials,
        body: {
          messages,
          tools: Array.isArray(parsedBody.tools) ? parsedBody.tools : undefined,
          reasoning_effort:
            typeof parsedBody.reasoning_effort === 'string'
              ? parsedBody.reasoning_effort
              : undefined,
        },
      });

      const outgoingResponse = isAnthropicRoute
        ? await createAnthropicProxyResponse(result.response)
        : result.response;

      await pipeWebResponseToNode(outgoingResponse, res);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const isPayloadTooLarge = message.includes('Request body too large');
      const status = isPayloadTooLarge ? 413 : 400;
      if (isAnthropicRoute) {
        await pipeWebResponseToNode(
          createAnthropicErrorResponse(status, 'invalid_request_error', message),
          res
        );
      } else {
        writeJson(res, status, {
          error: {
            type: 'invalid_request_error',
            message,
          },
        });
      }
    }
  });

  server.listen(options.port, '127.0.0.1');
  return server;
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  const server = startCursorDaemonServer(options);

  const shutdown = () => {
    server.close();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
