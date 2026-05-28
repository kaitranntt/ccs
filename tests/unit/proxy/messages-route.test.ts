import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PassThrough } from 'stream';
import { Agent } from 'undici';
import { resolveOpenAICompatProfileConfig } from '../../../src/proxy/profile-router';
import {
  attachDisconnectAbortHandlers,
  handleProxyMessagesRequest,
} from '../../../src/proxy/server/messages-route';
import { loadSettings } from '../../../src/utils/config-manager';

class FakeSocket extends EventEmitter {
  destroyed = false;
}

class FakeRequest extends PassThrough {
  headers: Record<string, string>;
  method = 'POST';
  url = '/v1/messages';
  socket = new FakeSocket();

  constructor(headers: Record<string, string> = {}) {
    super();
    this.headers = headers;
  }
}

class FakeResponse extends PassThrough {
  headers = new Map<string, string>();
  statusCode = 200;
  socket = new FakeSocket();

  setHeader(name: string, value: string): this {
    this.headers.set(name.toLowerCase(), value);
    return this;
  }

  writeHead(statusCode: number, headers: Record<string, string>): this {
    this.statusCode = statusCode;
    for (const [name, value] of Object.entries(headers)) {
      this.setHeader(name, value);
    }
    return this;
  }
}

let originalCcsHome: string | undefined;
let originalFetch: typeof globalThis.fetch;
let originalAgentClose: typeof Agent.prototype.close;
let tempDir: string;

function writeSettings(profileName: string, env: Record<string, string>): string {
  const settingsPath = path.join(tempDir, '.ccs', `${profileName}.settings.json`);
  fs.writeFileSync(settingsPath, JSON.stringify({ env }, null, 2), 'utf8');
  return settingsPath;
}

function buildProfile(profileName: string) {
  const settingsPath = path.join(tempDir, '.ccs', `${profileName}.settings.json`);
  const profile = resolveOpenAICompatProfileConfig(
    profileName,
    settingsPath,
    loadSettings(settingsPath).env || {}
  );
  expect(profile).toBeTruthy();
  return profile!;
}

beforeEach(() => {
  originalCcsHome = process.env.CCS_HOME;
  originalFetch = globalThis.fetch;
  originalAgentClose = Agent.prototype.close;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-messages-route-'));
  fs.mkdirSync(path.join(tempDir, '.ccs'), { recursive: true });
  process.env.CCS_HOME = tempDir;

  const profiles = {
    hf: writeSettings('hf', {
      ANTHROPIC_BASE_URL: 'https://router.huggingface.co/v1',
      ANTHROPIC_AUTH_TOKEN: 'hf_token',
      ANTHROPIC_MODEL: 'hf-default',
      CCS_DROID_PROVIDER: 'generic-chat-completion-api',
    }),
    deepseek: writeSettings('deepseek', {
      ANTHROPIC_BASE_URL: 'https://api.deepseek.com/v1',
      ANTHROPIC_AUTH_TOKEN: 'deepseek_token',
      ANTHROPIC_MODEL: 'deepseek-chat',
      CCS_DROID_PROVIDER: 'generic-chat-completion-api',
      CCS_OPENAI_PROXY_INSECURE: 'true',
    }),
    search: writeSettings('search', {
      ANTHROPIC_BASE_URL: 'https://search.example.com/v1',
      ANTHROPIC_AUTH_TOKEN: 'search_token',
      ANTHROPIC_MODEL: 'sonar-pro',
      CCS_DROID_PROVIDER: 'generic-chat-completion-api',
    }),
    mm: writeSettings('mm', {
      ANTHROPIC_BASE_URL: 'https://api.minimax.io/v1',
      ANTHROPIC_AUTH_TOKEN: 'minimax_token',
      ANTHROPIC_MODEL: 'MiniMax-M2.7',
      CCS_DROID_PROVIDER: 'openai',
    }),
  };

  fs.writeFileSync(
    path.join(tempDir, '.ccs', 'config.json'),
    JSON.stringify({ profiles, proxy: { routing: {} } }, null, 2),
    'utf8'
  );
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  Agent.prototype.close = originalAgentClose;
  if (originalCcsHome !== undefined) {
    process.env.CCS_HOME = originalCcsHome;
  } else {
    delete process.env.CCS_HOME;
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('attachDisconnectAbortHandlers', () => {
  it('cleans up registered listeners after the request completes', () => {
    const req = new FakeRequest();
    const res = new FakeResponse();
    const controller = new AbortController();

    const cleanup = attachDisconnectAbortHandlers(req as never, res as never, controller, () => {});

    expect(req.listenerCount('aborted')).toBe(1);
    expect(req.listenerCount('close')).toBe(0);
    expect(req.socket.listenerCount('close')).toBe(1);
    expect(res.listenerCount('close')).toBe(0);
    expect(res.socket.listenerCount('close')).toBe(1);

    cleanup();

    expect(req.listenerCount('aborted')).toBe(0);
    expect(req.socket.listenerCount('close')).toBe(0);
    expect(res.socket.listenerCount('close')).toBe(0);
  });

  it('aborts at most once when disconnect signals race each other', () => {
    const req = new FakeRequest();
    const res = new FakeResponse();
    const controller = new AbortController();
    let disconnectCount = 0;

    const cleanup = attachDisconnectAbortHandlers(req as never, res as never, controller, () => {
      disconnectCount += 1;
    });

    req.emit('aborted');
    req.socket.emit('close');
    res.socket.emit('close');

    expect(controller.signal.aborted).toBe(true);
    expect(disconnectCount).toBe(1);

    cleanup();
  });
});

describe('handleProxyMessagesRequest', () => {
  it('uses a per-request insecure dispatcher for routed profiles and closes it on failure', async () => {
    const activeProfile = buildProfile('hf');
    const sharedDispatcher = { name: 'shared-insecure-dispatcher' } as never;
    let closeCalls = 0;
    let capturedDispatcher: unknown;

    Agent.prototype.close = function close(): Promise<void> {
      closeCalls += 1;
      return Promise.resolve();
    };

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedDispatcher = (init as RequestInit & { dispatcher?: unknown })?.dispatcher;
      throw new Error('upstream exploded');
    }) as typeof globalThis.fetch;

    const req = new FakeRequest({
      'x-api-key': 'local-token',
    });
    const res = new FakeResponse();
    const pending = handleProxyMessagesRequest(
      req as never,
      res as never,
      activeProfile,
      'local-token',
      sharedDispatcher
    );
    req.end(
      JSON.stringify({
        model: 'deepseek:deepseek-chat',
        stream: true,
        messages: [{ role: 'user', content: 'route this' }],
      })
    );
    await pending;

    expect(capturedDispatcher).toBeInstanceOf(Agent);
    expect(capturedDispatcher).not.toBe(sharedDispatcher);
    expect(closeCalls).toBe(1);
    expect(res.statusCode).toBe(502);
  });

  it('reuses the shared insecure dispatcher when the request stays on the active profile', async () => {
    const activeProfile = buildProfile('hf');
    const sharedDispatcher = { name: 'shared-insecure-dispatcher' } as never;
    let closeCalls = 0;
    let capturedDispatcher: unknown;

    Agent.prototype.close = function close(): Promise<void> {
      closeCalls += 1;
      return Promise.resolve();
    };

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedDispatcher = (init as RequestInit & { dispatcher?: unknown })?.dispatcher;
      throw new Error('upstream exploded');
    }) as typeof globalThis.fetch;

    const req = new FakeRequest({
      'x-api-key': 'local-token',
    });
    const res = new FakeResponse();
    const pending = handleProxyMessagesRequest(
      req as never,
      res as never,
      activeProfile,
      'local-token',
      sharedDispatcher
    );
    req.end(
      JSON.stringify({
        model: 'hf-default',
        stream: true,
        messages: [{ role: 'user', content: 'stay local' }],
      })
    );
    await pending;

    expect(capturedDispatcher).toBe(sharedDispatcher);
    expect(closeCalls).toBe(0);
    expect(res.statusCode).toBe(502);
  });

  it('moves system messages into the first user message for MiniMax OpenAI-compatible upstreams', async () => {
    const activeProfile = buildProfile('mm');
    let capturedBody: unknown;

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          id: 'chatcmpl_1',
          object: 'chat.completion',
          created: 1,
          model: 'MiniMax-M2.7',
          choices: [{ index: 0, message: { role: 'assistant', content: 'ok' } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as typeof globalThis.fetch;

    const req = new FakeRequest({
      'x-api-key': 'local-token',
    });
    const res = new FakeResponse();
    const pending = handleProxyMessagesRequest(
      req as never,
      res as never,
      activeProfile,
      'local-token'
    );
    req.end(
      JSON.stringify({
        model: 'MiniMax-M2.7',
        stream: false,
        messages: [
          { role: 'system', content: 'Use Turkish.' },
          { role: 'user', content: 'bu hangi model' },
        ],
      })
    );
    await pending;

    expect(capturedBody).toMatchObject({
      model: 'MiniMax-M2.7',
      messages: [{ role: 'user', content: 'Use Turkish.\n\nbu hangi model' }],
    });
    expect((capturedBody as { messages: Array<{ role: string }> }).messages).not.toContainEqual(
      expect.objectContaining({ role: 'system' })
    );
  });

  it('strips blank system messages for MiniMax OpenAI-compatible upstreams', async () => {
    const activeProfile = buildProfile('mm');
    let capturedBody: unknown;

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          id: 'chatcmpl_1',
          object: 'chat.completion',
          created: 1,
          model: 'MiniMax-M2.7',
          choices: [{ index: 0, message: { role: 'assistant', content: 'ok' } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as typeof globalThis.fetch;

    const req = new FakeRequest({
      'x-api-key': 'local-token',
    });
    const res = new FakeResponse();
    const pending = handleProxyMessagesRequest(
      req as never,
      res as never,
      activeProfile,
      'local-token'
    );
    req.end(
      JSON.stringify({
        model: 'MiniMax-M2.7',
        stream: false,
        messages: [
          { role: 'system', content: [{ type: 'text', text: '' }] },
          { role: 'user', content: 'bu hangi model' },
        ],
      })
    );
    await pending;

    expect(capturedBody).toMatchObject({
      model: 'MiniMax-M2.7',
      messages: [{ role: 'user', content: 'bu hangi model' }],
    });
    expect((capturedBody as { messages: Array<{ role: string }> }).messages).not.toContainEqual(
      expect.objectContaining({ role: 'system' })
    );
  });
});
