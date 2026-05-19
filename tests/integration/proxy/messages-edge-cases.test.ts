import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import * as zlib from 'zlib';
import { startOpenAICompatProxyServer } from '../../../src/proxy/server/proxy-server';
import type { OpenAICompatProfileConfig } from '../../../src/proxy/profile-router';

let proxyServer: http.Server;
let upstreamServer: http.Server;
let upstreamSockets = new Set<import('net').Socket>();
let upstreamPort: number;
let proxyPort: number;
let tempDir: string;
let originalTimeoutEnv: string | undefined;
let originalCcsHome: string | undefined;

function resolveListeningPort(server: http.Server): number {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve server port');
  }
  return address.port;
}

async function waitForServerListening(server: http.Server): Promise<number> {
  if (server.listening) {
    return resolveListeningPort(server);
  }

  return new Promise<number>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once('error', onError);
    server.once('listening', () => {
      server.off('error', onError);
      resolve(resolveListeningPort(server));
    });
  });
}

async function startUpstream(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> | void
): Promise<void> {
  upstreamServer = http.createServer((req, res) => {
    void Promise.resolve(handler(req, res));
  });
  upstreamServer.on('connection', (socket) => {
    upstreamSockets.add(socket);
    socket.on('close', () => {
      upstreamSockets.delete(socket);
    });
  });
  upstreamServer.listen(0, '127.0.0.1');
  upstreamPort = await waitForServerListening(upstreamServer);
}

async function requestProxy(payload: unknown, signal?: AbortSignal): Promise<Response> {
  return fetch(`http://127.0.0.1:${proxyPort}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': 'test-proxy-token',
    },
    body: JSON.stringify(payload),
    signal,
  });
}

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-proxy-edge-'));
  originalTimeoutEnv = process.env.CCS_OPENAI_PROXY_REQUEST_TIMEOUT_MS;
  originalCcsHome = process.env.CCS_HOME;
  process.env.CCS_HOME = tempDir;
});

afterEach(async () => {
  if (originalTimeoutEnv !== undefined) {
    process.env.CCS_OPENAI_PROXY_REQUEST_TIMEOUT_MS = originalTimeoutEnv;
  } else {
    delete process.env.CCS_OPENAI_PROXY_REQUEST_TIMEOUT_MS;
  }
  if (originalCcsHome !== undefined) {
    process.env.CCS_HOME = originalCcsHome;
  } else {
    delete process.env.CCS_HOME;
  }

  if (proxyServer) {
    await new Promise<void>((resolve) => proxyServer.close(() => resolve()));
  }
  if (upstreamServer) {
    for (const socket of upstreamSockets) {
      socket.destroy();
    }
    upstreamSockets = new Set();
    await new Promise<void>((resolve) => upstreamServer.close(() => resolve()));
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('openai proxy message edge cases', () => {
  async function startProxyWithHandler(
    handler: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> | void
  ) {
    await startUpstream(handler);
    const profile: OpenAICompatProfileConfig = {
      profileName: 'hf',
      settingsPath: '/tmp/hf.settings.json',
      baseUrl: `http://127.0.0.1:${upstreamPort}`,
      apiKey: 'hf_token',
      provider: 'generic-chat-completion-api',
      model: 'hf-model',
    };
    proxyServer = startOpenAICompatProxyServer({
      profile,
      port: 0,
      authToken: 'test-proxy-token',
    });
    proxyPort = await waitForServerListening(proxyServer);
  }

  it('preserves rate-limit errors from the upstream provider', async () => {
    await startProxyWithHandler((_req, res) => {
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Retry-After': '9',
      });
      res.end(JSON.stringify({ error: { message: 'rate limited' } }));
    });

    const response = await requestProxy({
      model: 'hf-model',
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('9');
    await expect(response.json()).resolves.toMatchObject({
      type: 'error',
      error: {
        type: 'rate_limit_error',
        message: 'rate limited',
      },
    });
  });

  it('does not leak upstream content-encoding onto synthesized error responses', async () => {
    const compressed = zlib.gzipSync(
      JSON.stringify({ error: { message: 'invalid upstream request' } })
    );

    await startProxyWithHandler((_req, res) => {
      res.writeHead(400, {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
        'Content-Length': String(compressed.length),
      });
      res.end(compressed);
    });

    const response = await requestProxy({
      model: 'hf-model',
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(response.status).toBe(400);
    expect(response.headers.get('content-encoding')).toBeNull();
    await expect(response.json()).resolves.toMatchObject({
      type: 'error',
      error: {
        type: 'invalid_request_error',
        message: 'invalid upstream request',
      },
    });
  });

  it('returns api_error when the upstream JSON response has no usable choices', async () => {
    await startProxyWithHandler((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'chatcmpl_empty', choices: [] }));
    });

    const response = await requestProxy({
      model: 'hf-model',
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      type: 'error',
      error: {
        type: 'api_error',
        message: 'Failed to translate OpenAI-compatible JSON response',
      },
    });
  });

  it('streams thinking deltas and chunked tool-call arguments back as Anthropic SSE', async () => {
    await startProxyWithHandler((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(
        'data: {"id":"chatcmpl_1","model":"hf-model","choices":[{"index":0,"delta":{"role":"assistant"}}]}\n\n'
      );
      res.write(
        'data: {"id":"chatcmpl_1","model":"hf-model","choices":[{"index":0,"delta":{"reasoning_content":"Need to search first."}}]}\n\n'
      );
      res.write(
        'data: {"id":"chatcmpl_1","model":"hf-model","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"search","arguments":"{\\"q\\":\\""}}]}}]}\n\n'
      );
      res.write(
        'data: {"id":"chatcmpl_1","model":"hf-model","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"docs\\"}"}}]}}]}\n\n'
      );
      res.write(
        'data: {"id":"chatcmpl_1","model":"hf-model","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":8,"completion_tokens":6}}\n\n'
      );
      res.end('data: [DONE]\n\n');
    });

    const response = await requestProxy({
      model: 'hf-model',
      stream: true,
      messages: [{ role: 'user', content: 'search docs' }],
    });

    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain('"type":"thinking_delta"');
    expect(body).toContain('"type":"tool_use"');
    expect(body).toContain('"partial_json":"{\\"q\\":\\""');
    expect(body).toContain('"partial_json":"docs\\"}"');
    expect(body).toContain('event: message_stop');
  });

  it('returns a timeout error when the upstream does not respond in time', async () => {
    process.env.CCS_OPENAI_PROXY_REQUEST_TIMEOUT_MS = '50';
    await startProxyWithHandler(async (req, _res) => {
      await new Promise<void>((resolve) => req.on('close', () => resolve()));
    });

    const response = await requestProxy({
      model: 'hf-model',
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      type: 'error',
      error: {
        type: 'api_error',
        message: 'The upstream provider did not respond within 50ms',
      },
    });
  });

  it('emits an SSE error if the upstream stalls after response headers are sent', async () => {
    process.env.CCS_OPENAI_PROXY_REQUEST_TIMEOUT_MS = '50';
    await startProxyWithHandler((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(
        'data: {"id":"chatcmpl_1","model":"hf-model","choices":[{"index":0,"delta":{"role":"assistant","content":"partial"}}]}\n\n'
      );
    });

    const response = await requestProxy({
      model: 'hf-model',
      stream: true,
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('event: message_start');
    expect(body).toContain('event: error');
    expect(body).toContain('"message":"Failed to translate OpenAI-compatible SSE response"');
  });

  it.skipIf(typeof Bun !== 'undefined')(
    'aborts the upstream request when the client disconnects mid-flight (Node.js only)',
    async () => {
      await startProxyWithHandler(() => {});

      await new Promise<void>((resolve) => {
        const request = http.request(
          {
            hostname: '127.0.0.1',
            port: proxyPort,
            path: '/v1/messages',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': 'test-proxy-token',
            },
          },
          () => resolve()
        );

        request.write(
          JSON.stringify({
            model: 'hf-model',
            messages: [{ role: 'user', content: 'hello' }],
          })
        );
        request.end();

        setTimeout(() => {
          request.socket?.destroy();
          resolve();
        }, 50);
      });

      const logPath = path.join(tempDir, '.ccs', 'logs', 'current.jsonl');
      await Promise.race([
        new Promise<void>((resolve, reject) => {
          const startedAt = Date.now();
          const timer = setInterval(() => {
            if (fs.existsSync(logPath)) {
              const content = fs.readFileSync(logPath, 'utf8');
              if (content.includes('"event":"request.disconnect"')) {
                clearInterval(timer);
                resolve();
                return;
              }
            }

            if (Date.now() - startedAt > 1500) {
              clearInterval(timer);
              reject(new Error('proxy did not log disconnect cleanup'));
            }
          }, 50);
        }),
      ]);
    }
  );
});
