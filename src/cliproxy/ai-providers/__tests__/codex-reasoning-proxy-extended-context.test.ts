import * as http from 'http';
import { afterEach, describe, expect, it } from 'bun:test';
import {
  buildCodexModelEffortMap,
  CodexReasoningProxy,
  getEffortForModel,
} from '../../ai-providers/codex-reasoning-proxy';
import {
  parseEnvThinkingOverride,
  resolveRuntimeThinkingOverride,
  shouldDisableCodexReasoning,
} from '../../executor/thinking-override-resolver';

type JsonRecord = Record<string, unknown>;

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function listenOnRandomPort(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address !== 'object' || !address) {
        reject(new Error('Failed to resolve server address'));
        return;
      }
      resolve(address.port);
    });
  });
}

function postJson(
  url: string,
  body: JsonRecord
): Promise<{ statusCode: number; body: JsonRecord }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = JSON.stringify(body);

    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let responseBody = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        res.on('end', () => {
          let parsedResponse: JsonRecord = {};
          try {
            parsedResponse = responseBody ? (JSON.parse(responseBody) as JsonRecord) : {};
          } catch {
            parsedResponse = {};
          }
          resolve({ statusCode: res.statusCode ?? 0, body: parsedResponse });
        });
      }
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

describe('CodexReasoningProxy extended-context compatibility', () => {
  const cleanupServers: http.Server[] = [];

  afterEach(async () => {
    while (cleanupServers.length > 0) {
      const server = cleanupServers.pop();
      if (server) {
        await closeServer(server);
      }
    }
  });

  it('normalizes [1m] suffixes in effort map lookups', () => {
    const map = buildCodexModelEffortMap({
      defaultModel: 'gpt-5.3-codex-xhigh[1m]',
      sonnetModel: 'gpt-5.3-codex-high[1m]',
      haikuModel: 'gpt-5-mini-medium[1m]',
    });

    expect(getEffortForModel('gpt-5.3-codex-high', map, 'medium')).toBe('high');
    expect(getEffortForModel('gpt-5-mini-medium', map, 'high')).toBe('medium');
  });

  it('strips [1m] and codex effort suffixes before forwarding upstream', async () => {
    let capturedBody: JsonRecord | null = null;
    let capturedPath = '';

    const upstream = http.createServer((req, res) => {
      let rawBody = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        rawBody += chunk;
      });
      req.on('end', () => {
        capturedPath = req.url || '';
        capturedBody = rawBody ? (JSON.parse(rawBody) as JsonRecord) : {};
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    cleanupServers.push(upstream);

    const upstreamPort = await listenOnRandomPort(upstream);
    const proxy = new CodexReasoningProxy({
      upstreamBaseUrl: `http://127.0.0.1:${upstreamPort}`,
      modelMap: {
        defaultModel: 'gpt-5.3-codex-xhigh[1m]',
        opusModel: 'gpt-5.3-codex-xhigh[1m]',
        sonnetModel: 'gpt-5.3-codex-high[1m]',
        haikuModel: 'gpt-5-mini-medium[1m]',
      },
      defaultEffort: 'medium',
    });

    const proxyPort = await proxy.start();
    const response = await postJson(
      `http://127.0.0.1:${proxyPort}/api/provider/codex/v1/messages`,
      {
        model: 'gpt-5.3-codex-high[1m]',
        messages: [],
      }
    );

    proxy.stop();

    expect(response.statusCode).toBe(200);
    expect(capturedPath).toBe('/api/provider/codex/v1/messages');
    expect(capturedBody?.model).toBe('gpt-5.3-codex');
    expect((capturedBody?.reasoning as JsonRecord | undefined)?.effort).toBe('high');
  });

  it('translates codex fast model suffixes into service_tier', async () => {
    const capturedBodies: JsonRecord[] = [];

    const upstream = http.createServer((req, res) => {
      let rawBody = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        rawBody += chunk;
      });
      req.on('end', () => {
        capturedBodies.push(rawBody ? (JSON.parse(rawBody) as JsonRecord) : {});
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    cleanupServers.push(upstream);

    const upstreamPort = await listenOnRandomPort(upstream);
    const proxy = new CodexReasoningProxy({
      upstreamBaseUrl: `http://127.0.0.1:${upstreamPort}`,
      modelMap: {
        defaultModel: 'gpt-5.4',
      },
      defaultEffort: 'medium',
    });

    const proxyPort = await proxy.start();
    const highFastResponse = await postJson(
      `http://127.0.0.1:${proxyPort}/api/provider/codex/v1/messages`,
      {
        model: 'gpt-5.4-high-fast',
        messages: [],
      }
    );
    const fastHighResponse = await postJson(
      `http://127.0.0.1:${proxyPort}/api/provider/codex/v1/messages`,
      {
        model: 'gpt-5.4-fast-high',
        messages: [],
      }
    );

    proxy.stop();

    expect(highFastResponse.statusCode).toBe(200);
    expect(fastHighResponse.statusCode).toBe(200);
    expect(capturedBodies[0]?.model).toBe('gpt-5.4');
    expect((capturedBodies[0]?.reasoning as JsonRecord | undefined)?.effort).toBe('high');
    expect(capturedBodies[0]?.service_tier).toBe('priority');
    expect(capturedBodies[1]?.model).toBe('gpt-5.4');
    expect((capturedBodies[1]?.reasoning as JsonRecord | undefined)?.effort).toBe('high');
    expect(capturedBodies[1]?.service_tier).toBe('priority');
  });

  it('skips reasoning injection when disableEffort is enabled', async () => {
    let capturedBody: JsonRecord | null = null;

    const upstream = http.createServer((req, res) => {
      let rawBody = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        rawBody += chunk;
      });
      req.on('end', () => {
        capturedBody = rawBody ? (JSON.parse(rawBody) as JsonRecord) : {};
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    cleanupServers.push(upstream);

    const upstreamPort = await listenOnRandomPort(upstream);
    const proxy = new CodexReasoningProxy({
      upstreamBaseUrl: `http://127.0.0.1:${upstreamPort}`,
      modelMap: {
        sonnetModel: 'gpt-5.3-codex-high',
      },
      disableEffort: true,
    });

    const proxyPort = await proxy.start();
    const response = await postJson(
      `http://127.0.0.1:${proxyPort}/api/provider/codex/v1/messages`,
      {
        model: 'gpt-5.3-codex-high',
        messages: [],
      }
    );

    proxy.stop();

    expect(response.statusCode).toBe(200);
    expect(capturedBody?.model).toBe('gpt-5.3-codex');
    expect((capturedBody?.reasoning as JsonRecord | undefined)?.effort).toBeUndefined();
  });

  it('keeps fast service tier when disableEffort is enabled', async () => {
    let capturedBody: JsonRecord | null = null;

    const upstream = http.createServer((req, res) => {
      let rawBody = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        rawBody += chunk;
      });
      req.on('end', () => {
        capturedBody = rawBody ? (JSON.parse(rawBody) as JsonRecord) : {};
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    cleanupServers.push(upstream);

    const upstreamPort = await listenOnRandomPort(upstream);
    const proxy = new CodexReasoningProxy({
      upstreamBaseUrl: `http://127.0.0.1:${upstreamPort}`,
      modelMap: {
        defaultModel: 'gpt-5.4',
      },
      disableEffort: true,
    });

    const proxyPort = await proxy.start();
    const response = await postJson(
      `http://127.0.0.1:${proxyPort}/api/provider/codex/v1/messages`,
      {
        model: 'gpt-5.4-high-fast',
        messages: [],
      }
    );

    proxy.stop();

    expect(response.statusCode).toBe(200);
    expect(capturedBody?.model).toBe('gpt-5.4');
    expect((capturedBody?.reasoning as JsonRecord | undefined)?.effort).toBeUndefined();
    expect(capturedBody?.service_tier).toBe('priority');
  });

  it('does not strip unknown model ids that merely end with "-high"', async () => {
    let capturedBody: JsonRecord | null = null;

    const upstream = http.createServer((req, res) => {
      let rawBody = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        rawBody += chunk;
      });
      req.on('end', () => {
        capturedBody = rawBody ? (JSON.parse(rawBody) as JsonRecord) : {};
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    cleanupServers.push(upstream);

    const upstreamPort = await listenOnRandomPort(upstream);
    const proxy = new CodexReasoningProxy({
      upstreamBaseUrl: `http://127.0.0.1:${upstreamPort}`,
      modelMap: {
        defaultModel: 'gpt-5.1-codex-mini',
      },
      defaultEffort: 'medium',
    });

    const proxyPort = await proxy.start();
    const response = await postJson(
      `http://127.0.0.1:${proxyPort}/api/provider/codex/v1/messages`,
      {
        model: 'enterprise-internal-high',
        messages: [],
      }
    );

    proxy.stop();

    expect(response.statusCode).toBe(200);
    expect(capturedBody?.model).toBe('enterprise-internal-high');
  });

  it('retries unsupported live-session models once and remembers the fallback', async () => {
    const capturedModels: string[] = [];
    const capturedEfforts: Array<string | undefined> = [];

    const upstream = http.createServer((req, res) => {
      let rawBody = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        rawBody += chunk;
      });
      req.on('end', () => {
        const requestBody = rawBody ? (JSON.parse(rawBody) as JsonRecord) : {};
        const reasoning = requestBody.reasoning as JsonRecord | undefined;
        const model = String(requestBody.model ?? '');
        const effort = typeof reasoning?.effort === 'string' ? reasoning.effort : undefined;

        capturedModels.push(model);
        capturedEfforts.push(effort);

        if (model === 'gpt-5.4') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: {
                message: 'The requested model is not supported.',
                code: 'model_not_supported',
                param: 'model',
                type: 'invalid_request_error',
              },
            })
          );
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            model,
            effort: effort ?? null,
          })
        );
      });
    });
    cleanupServers.push(upstream);

    const upstreamPort = await listenOnRandomPort(upstream);
    const proxy = new CodexReasoningProxy({
      upstreamBaseUrl: `http://127.0.0.1:${upstreamPort}`,
      modelMap: {
        defaultModel: 'gpt-5.4',
        haikuModel: 'gpt-5-codex-mini',
      },
      defaultEffort: 'medium',
    });

    const proxyPort = await proxy.start();
    const firstResponse = await postJson(
      `http://127.0.0.1:${proxyPort}/api/provider/codex/v1/messages`,
      {
        model: 'gpt-5.4-xhigh',
        messages: [],
      }
    );
    const secondResponse = await postJson(
      `http://127.0.0.1:${proxyPort}/api/provider/codex/v1/messages`,
      {
        model: 'gpt-5.4-xhigh',
        messages: [],
      }
    );

    proxy.stop();

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(firstResponse.body.model).toBe('gpt-5.4-mini');
    expect(firstResponse.body.effort).toBe('high');
    expect(secondResponse.body.model).toBe('gpt-5.4-mini');
    expect(secondResponse.body.effort).toBe('high');
    expect(capturedModels).toEqual(['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-mini']);
    expect(capturedEfforts).toEqual(['xhigh', 'high', 'high']);
  });

  it('keeps reasoning enabled when CCS_THINKING=high overrides config off', async () => {
    let capturedBody: JsonRecord | null = null;

    expect(parseEnvThinkingOverride('high')).toBe('high');
    const { thinkingOverride } = resolveRuntimeThinkingOverride(undefined, 'high');
    const disableEffort = shouldDisableCodexReasoning(
      {
        mode: 'off',
        tier_defaults: {
          opus: 'high',
          sonnet: 'medium',
          haiku: 'low',
        },
        show_warnings: true,
      },
      thinkingOverride
    );

    const upstream = http.createServer((req, res) => {
      let rawBody = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        rawBody += chunk;
      });
      req.on('end', () => {
        capturedBody = rawBody ? (JSON.parse(rawBody) as JsonRecord) : {};
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    cleanupServers.push(upstream);

    const upstreamPort = await listenOnRandomPort(upstream);
    const proxy = new CodexReasoningProxy({
      upstreamBaseUrl: `http://127.0.0.1:${upstreamPort}`,
      disableEffort,
      defaultEffort: 'medium',
      modelMap: {
        defaultModel: 'gpt-5.3-codex',
      },
    });

    const proxyPort = await proxy.start();
    const response = await postJson(
      `http://127.0.0.1:${proxyPort}/api/provider/codex/v1/messages`,
      {
        model: 'gpt-5.3-codex-high',
        messages: [],
      }
    );

    proxy.stop();

    expect(response.statusCode).toBe(200);
    expect(disableEffort).toBe(false);
    expect(capturedBody?.model).toBe('gpt-5.3-codex');
    expect((capturedBody?.reasoning as JsonRecord | undefined)?.effort).toBe('high');
  });

  it('disables reasoning when CCS_THINKING=off is provided', async () => {
    let capturedBody: JsonRecord | null = null;

    expect(parseEnvThinkingOverride('off')).toBe('off');
    const { thinkingOverride } = resolveRuntimeThinkingOverride(undefined, 'off');
    const disableEffort = shouldDisableCodexReasoning(
      {
        mode: 'auto',
        tier_defaults: {
          opus: 'high',
          sonnet: 'medium',
          haiku: 'low',
        },
        show_warnings: true,
      },
      thinkingOverride
    );

    const upstream = http.createServer((req, res) => {
      let rawBody = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        rawBody += chunk;
      });
      req.on('end', () => {
        capturedBody = rawBody ? (JSON.parse(rawBody) as JsonRecord) : {};
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    cleanupServers.push(upstream);

    const upstreamPort = await listenOnRandomPort(upstream);
    const proxy = new CodexReasoningProxy({
      upstreamBaseUrl: `http://127.0.0.1:${upstreamPort}`,
      disableEffort,
      defaultEffort: 'medium',
      modelMap: {
        defaultModel: 'gpt-5.3-codex',
      },
    });

    const proxyPort = await proxy.start();
    const response = await postJson(
      `http://127.0.0.1:${proxyPort}/api/provider/codex/v1/messages`,
      {
        model: 'gpt-5.3-codex-high',
        messages: [],
      }
    );

    proxy.stop();

    expect(response.statusCode).toBe(200);
    expect(disableEffort).toBe(true);
    expect(capturedBody?.model).toBe('gpt-5.3-codex');
    expect((capturedBody?.reasoning as JsonRecord | undefined)?.effort).toBeUndefined();
  });
});
