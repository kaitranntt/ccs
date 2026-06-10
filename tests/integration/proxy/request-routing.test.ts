import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { startOpenAICompatProxyServer } from '../../../src/proxy/server/proxy-server';
import type { OpenAICompatProfileConfig } from '../../../src/proxy/profile-router';

let originalCcsHome: string | undefined;
let tempDir: string;
let proxyServer: http.Server;
let upstreamServers: http.Server[] = [];
let proxyPort: number;

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

async function startMockUpstream(
  hitLabel: string,
  hits: string[],
  bodies: Array<{ label: string; body: unknown }>
): Promise<number> {
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) {
      body += chunk.toString();
    }
    hits.push(hitLabel);
    bodies.push({ label: hitLabel, body: JSON.parse(body) });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        id: `chatcmpl_${hitLabel}`,
        model: hitLabel,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: `Reply from ${hitLabel}` },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 2, completion_tokens: 3 },
      })
    );
  });
  upstreamServers.push(server);
  server.listen(0, '127.0.0.1');
  return waitForServerListening(server);
}

function writeSettings(profileName: string, env: Record<string, string>): string {
  const settingsPath = path.join(tempDir, '.ccs', `${profileName}.settings.json`);
  fs.writeFileSync(settingsPath, JSON.stringify({ env }, null, 2), 'utf8');
  return settingsPath;
}

async function requestProxy(payload: unknown): Promise<Response> {
  return fetch(`http://127.0.0.1:${proxyPort}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': 'test-proxy-token',
    },
    body: JSON.stringify(payload),
  });
}

beforeEach(async () => {
  originalCcsHome = process.env.CCS_HOME;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-proxy-routing-'));
  fs.mkdirSync(path.join(tempDir, '.ccs'), { recursive: true });
  process.env.CCS_HOME = tempDir;
  proxyPort = 0;
});

afterEach(async () => {
  await Promise.all(
    upstreamServers.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        })
    )
  );
  upstreamServers = [];
  if (proxyServer) {
    await new Promise<void>((resolve) => proxyServer.close(() => resolve()));
  }
  if (originalCcsHome !== undefined) {
    process.env.CCS_HOME = originalCcsHome;
  } else {
    delete process.env.CCS_HOME;
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('openai proxy request routing', () => {
  it('routes explicit profile:model selectors to the matching upstream profile', async () => {
    const hits: string[] = [];
    const bodies: Array<{ label: string; body: unknown }> = [];
    const primaryPort = await startMockUpstream('primary', hits, bodies);
    const secondaryPort = await startMockUpstream('secondary', hits, bodies);

    const primarySettings = writeSettings('hf', {
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${primaryPort}`,
      ANTHROPIC_AUTH_TOKEN: 'hf_token',
      ANTHROPIC_MODEL: 'hf-default',
      CCS_DROID_PROVIDER: 'generic-chat-completion-api',
    });
    const secondarySettings = writeSettings('deepseek', {
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${secondaryPort}`,
      ANTHROPIC_AUTH_TOKEN: 'deepseek_token',
      ANTHROPIC_MODEL: 'deepseek-chat',
      CCS_DROID_PROVIDER: 'generic-chat-completion-api',
    });

    fs.writeFileSync(
      path.join(tempDir, '.ccs', 'config.json'),
      JSON.stringify({ profiles: { hf: primarySettings, deepseek: secondarySettings } }, null, 2),
      'utf8'
    );

    const profile: OpenAICompatProfileConfig = {
      profileName: 'hf',
      settingsPath: primarySettings,
      baseUrl: `http://127.0.0.1:${primaryPort}`,
      apiKey: 'hf_token',
      provider: 'generic-chat-completion-api',
      model: 'hf-default',
    };
    proxyServer = startOpenAICompatProxyServer({
      profile,
      port: 0,
      authToken: 'test-proxy-token',
    });
    proxyPort = await waitForServerListening(proxyServer);

    const response = await requestProxy({
      model: 'deepseek:deepseek-reasoner',
      messages: [{ role: 'user', content: 'hello' }],
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      content: [{ type: 'text', text: 'Reply from secondary' }],
    });
    expect(hits).toEqual(['secondary']);
    expect(bodies[0]?.body).toMatchObject({ model: 'deepseek-reasoner' });
  });

  it('routes thinking requests through the configured think scenario', async () => {
    const hits: string[] = [];
    const bodies: Array<{ label: string; body: unknown }> = [];
    const primaryPort = await startMockUpstream('primary', hits, bodies);
    const thinkPort = await startMockUpstream('thinker', hits, bodies);

    const primarySettings = writeSettings('hf', {
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${primaryPort}`,
      ANTHROPIC_AUTH_TOKEN: 'hf_token',
      ANTHROPIC_MODEL: 'hf-default',
      CCS_DROID_PROVIDER: 'generic-chat-completion-api',
    });
    const thinkSettings = writeSettings('thinker', {
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${thinkPort}`,
      ANTHROPIC_AUTH_TOKEN: 'think_token',
      ANTHROPIC_MODEL: 'deepseek-reasoner',
      CCS_DROID_PROVIDER: 'generic-chat-completion-api',
    });

    fs.writeFileSync(
      path.join(tempDir, '.ccs', 'config.json'),
      JSON.stringify(
        {
          profiles: { hf: primarySettings, thinker: thinkSettings },
          proxy: {
            routing: {
              think: 'thinker:deepseek-reasoner',
            },
          },
        },
        null,
        2
      ),
      'utf8'
    );

    const profile: OpenAICompatProfileConfig = {
      profileName: 'hf',
      settingsPath: primarySettings,
      baseUrl: `http://127.0.0.1:${primaryPort}`,
      apiKey: 'hf_token',
      provider: 'generic-chat-completion-api',
      model: 'hf-default',
    };
    proxyServer = startOpenAICompatProxyServer({
      profile,
      port: 0,
      authToken: 'test-proxy-token',
    });
    proxyPort = await waitForServerListening(proxyServer);

    const response = await requestProxy({
      model: 'hf-default',
      thinking: { type: 'enabled', budget_tokens: 9000 },
      messages: [{ role: 'user', content: 'think hard' }],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      content: [{ type: 'text', text: 'Reply from thinker' }],
    });
    expect(hits).toEqual(['thinker']);
    expect(bodies[0]?.body).toMatchObject({ model: 'deepseek-reasoner' });
  });

  it('routes adaptive thinking requests through the configured think scenario', async () => {
    const hits: string[] = [];
    const bodies: Array<{ label: string; body: unknown }> = [];
    const primaryPort = await startMockUpstream('primary', hits, bodies);
    const thinkPort = await startMockUpstream('thinker', hits, bodies);

    const primarySettings = writeSettings('hf', {
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${primaryPort}`,
      ANTHROPIC_AUTH_TOKEN: 'hf_token',
      ANTHROPIC_MODEL: 'hf-default',
      CCS_DROID_PROVIDER: 'generic-chat-completion-api',
    });
    const thinkSettings = writeSettings('thinker', {
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${thinkPort}`,
      ANTHROPIC_AUTH_TOKEN: 'think_token',
      ANTHROPIC_MODEL: 'deepseek-reasoner',
      CCS_DROID_PROVIDER: 'generic-chat-completion-api',
    });

    fs.writeFileSync(
      path.join(tempDir, '.ccs', 'config.json'),
      JSON.stringify(
        {
          profiles: { hf: primarySettings, thinker: thinkSettings },
          proxy: {
            routing: {
              think: 'thinker:deepseek-reasoner',
            },
          },
        },
        null,
        2
      ),
      'utf8'
    );

    const profile: OpenAICompatProfileConfig = {
      profileName: 'hf',
      settingsPath: primarySettings,
      baseUrl: `http://127.0.0.1:${primaryPort}`,
      apiKey: 'hf_token',
      provider: 'generic-chat-completion-api',
      model: 'hf-default',
    };
    proxyServer = startOpenAICompatProxyServer({
      profile,
      port: 0,
      authToken: 'test-proxy-token',
    });
    proxyPort = await waitForServerListening(proxyServer);

    const response = await requestProxy({
      model: 'hf-default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'max' },
      messages: [{ role: 'user', content: 'think adaptively' }],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      content: [{ type: 'text', text: 'Reply from thinker' }],
    });
    expect(hits).toEqual(['thinker']);
    expect(bodies[0]?.body).toMatchObject({
      model: 'deepseek-reasoner',
      reasoning_effort: 'high',
    });
    expect((bodies[0]?.body as { reasoning?: unknown } | undefined)?.reasoning).toBeUndefined();
  });

  it('forwards adaptive thinking to openai-profile upstreams via reasoning_effort only', async () => {
    const hits: string[] = [];
    const bodies: Array<{ label: string; body: unknown }> = [];
    const upstreamPort = await startMockUpstream('openai', hits, bodies);

    const settingsPath = writeSettings('openai', {
      ANTHROPIC_BASE_URL: 'https://api.openai.com/v1',
      ANTHROPIC_AUTH_TOKEN: 'openai_token',
      ANTHROPIC_MODEL: 'gpt-4.1',
    });

    fs.writeFileSync(
      path.join(tempDir, '.ccs', 'config.json'),
      JSON.stringify({ profiles: { openai: settingsPath } }, null, 2),
      'utf8'
    );

    const profile: OpenAICompatProfileConfig = {
      profileName: 'openai',
      settingsPath,
      baseUrl: `http://127.0.0.1:${upstreamPort}`,
      apiKey: 'openai_token',
      provider: 'openai',
      model: 'gpt-4.1',
    };
    proxyServer = startOpenAICompatProxyServer({
      profile,
      port: 0,
      authToken: 'test-proxy-token',
    });
    proxyPort = await waitForServerListening(proxyServer);

    const response = await requestProxy({
      model: 'gpt-4.1',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'max' },
      messages: [{ role: 'user', content: 'think adaptively' }],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      content: [{ type: 'text', text: 'Reply from openai' }],
    });
    expect(hits).toEqual(['openai']);
    expect(bodies[0]?.body).toMatchObject({
      model: 'gpt-4.1',
      reasoning_effort: 'high',
    });
    expect((bodies[0]?.body as { reasoning?: unknown } | undefined)?.reasoning).toBeUndefined();
  });

  it('shapes direct OpenAI reasoning-model chat payloads after route resolution', async () => {
    const hits: string[] = [];
    const bodies: Array<{ label: string; body: unknown }> = [];
    const upstreamPort = await startMockUpstream('openai', hits, bodies);

    const settingsPath = writeSettings('openai', {
      ANTHROPIC_BASE_URL: 'https://api.openai.com/v1',
      ANTHROPIC_AUTH_TOKEN: 'openai_token',
      ANTHROPIC_MODEL: 'gpt-5.4',
    });

    fs.writeFileSync(
      path.join(tempDir, '.ccs', 'config.json'),
      JSON.stringify({ profiles: { openai: settingsPath } }, null, 2),
      'utf8'
    );

    const profile: OpenAICompatProfileConfig = {
      profileName: 'openai',
      settingsPath,
      baseUrl: `http://127.0.0.1:${upstreamPort}`,
      apiKey: 'openai_token',
      provider: 'openai',
      model: 'gpt-5.4',
    };
    proxyServer = startOpenAICompatProxyServer({
      profile,
      port: 0,
      authToken: 'test-proxy-token',
    });
    proxyPort = await waitForServerListening(proxyServer);

    const response = await requestProxy({
      model: 'gpt-5.4',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'max' },
      max_tokens: 1024,
      metadata: { trace: 'abc' },
      tools: [{ name: 'search', description: 'Search docs', input_schema: { type: 'object' } }],
      messages: [{ role: 'user', content: 'think with tools' }],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      content: [{ type: 'text', text: 'Reply from openai' }],
    });
    expect(hits).toEqual(['openai']);

    const body = bodies[0]?.body as {
      max_tokens?: number;
      max_completion_tokens?: number;
      metadata?: unknown;
      reasoning_effort?: string;
      tools?: unknown[];
    };
    expect(body).toMatchObject({
      model: 'gpt-5.4',
      max_completion_tokens: 1024,
      tool_choice: 'auto',
    });
    expect(body.max_tokens).toBeUndefined();
    expect(body.metadata).toBeUndefined();
    expect(body.reasoning_effort).toBeUndefined();
    expect(body.tools?.length).toBe(1);
  });

  it('keeps generic opaque model payloads unchanged unless reasoning shaping is opted in', async () => {
    const hits: string[] = [];
    const bodies: Array<{ label: string; body: unknown }> = [];
    const upstreamPort = await startMockUpstream('gateway', hits, bodies);

    const settingsPath = writeSettings('gateway', {
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${upstreamPort}`,
      ANTHROPIC_AUTH_TOKEN: 'gateway_token',
      ANTHROPIC_MODEL: 'b3f9a2c7e8d14f60',
      CCS_DROID_PROVIDER: 'generic-chat-completion-api',
    });

    fs.writeFileSync(
      path.join(tempDir, '.ccs', 'config.json'),
      JSON.stringify({ profiles: { gateway: settingsPath } }, null, 2),
      'utf8'
    );

    const profile: OpenAICompatProfileConfig = {
      profileName: 'gateway',
      settingsPath,
      baseUrl: `http://127.0.0.1:${upstreamPort}`,
      apiKey: 'gateway_token',
      provider: 'generic-chat-completion-api',
      model: 'b3f9a2c7e8d14f60',
    };
    proxyServer = startOpenAICompatProxyServer({
      profile,
      port: 0,
      authToken: 'test-proxy-token',
    });
    proxyPort = await waitForServerListening(proxyServer);

    const response = await requestProxy({
      model: 'b3f9a2c7e8d14f60',
      max_tokens: 1024,
      metadata: { trace: 'abc' },
      messages: [{ role: 'user', content: 'stay compatible' }],
    });

    expect(response.status).toBe(200);
    expect(hits).toEqual(['gateway']);

    const body = bodies[0]?.body as {
      max_tokens?: number;
      max_completion_tokens?: number;
      metadata?: unknown;
    };
    expect(body.max_tokens).toBe(1024);
    expect(body.max_completion_tokens).toBeUndefined();
    expect(body.metadata).toEqual({ trace: 'abc' });
  });

  it('shapes generic opaque model payloads when reasoning shaping is opted in', async () => {
    const hits: string[] = [];
    const bodies: Array<{ label: string; body: unknown }> = [];
    const upstreamPort = await startMockUpstream('gateway', hits, bodies);

    const settingsPath = writeSettings('gateway', {
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${upstreamPort}`,
      ANTHROPIC_AUTH_TOKEN: 'gateway_token',
      ANTHROPIC_MODEL: 'b3f9a2c7e8d14f60',
      CCS_DROID_PROVIDER: 'generic-chat-completion-api',
      CCS_OPENAI_REASONING_MODEL: '1',
    });

    fs.writeFileSync(
      path.join(tempDir, '.ccs', 'config.json'),
      JSON.stringify({ profiles: { gateway: settingsPath } }, null, 2),
      'utf8'
    );

    const profile: OpenAICompatProfileConfig = {
      profileName: 'gateway',
      settingsPath,
      baseUrl: `http://127.0.0.1:${upstreamPort}`,
      apiKey: 'gateway_token',
      provider: 'generic-chat-completion-api',
      forceOpenAIReasoningModel: true,
      model: 'b3f9a2c7e8d14f60',
    };
    proxyServer = startOpenAICompatProxyServer({
      profile,
      port: 0,
      authToken: 'test-proxy-token',
    });
    proxyPort = await waitForServerListening(proxyServer);

    const response = await requestProxy({
      model: 'b3f9a2c7e8d14f60',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'max' },
      max_tokens: 1024,
      metadata: { trace: 'abc' },
      tools: [{ name: 'search', description: 'Search docs', input_schema: { type: 'object' } }],
      messages: [{ role: 'user', content: 'think with tools' }],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      content: [{ type: 'text', text: 'Reply from gateway' }],
    });
    expect(hits).toEqual(['gateway']);

    const body = bodies[0]?.body as {
      max_tokens?: number;
      max_completion_tokens?: number;
      metadata?: unknown;
      reasoning_effort?: string;
      tools?: unknown[];
    };
    expect(body).toMatchObject({
      model: 'b3f9a2c7e8d14f60',
      max_completion_tokens: 1024,
      tool_choice: 'auto',
    });
    expect(body.max_tokens).toBeUndefined();
    expect(body.metadata).toBeUndefined();
    expect(body.reasoning_effort).toBeUndefined();
    expect(body.tools?.length).toBe(1);
  });
});
