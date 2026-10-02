/**
 * Oversized request bodies must reach the client as an HTTP 413, never as a
 * reset socket. Before the shared limit, the local proxies capped bodies at
 * 10 MB and destroyed the socket, which Claude Code saw as ECONNRESET.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { CodexReasoningProxy } from '../../../src/cliproxy/ai-providers/codex-reasoning-proxy';
import { ToolSanitizationProxy } from '../../../src/cliproxy/proxy/tool-sanitization-proxy';
import { GlmtProxy } from '../../../src/glmt/glmt-proxy';
import {
  clearRecentLogEntries,
  getRecentLogEntries,
} from '../../../src/services/logging/log-buffer';
import { invalidateLoggingConfigCache } from '../../../src/services/logging/log-config';
import { MAX_BODY_ENV_VAR } from '../../../src/utils/request-body';

const MB = 1024 * 1024;

interface RecordedRequest {
  path: string;
  bodyBytes: number;
}

let upstream: http.Server;
let upstreamPort = 0;
let upstreamRequests: RecordedRequest[] = [];
let tempHome = '';
let originalCcsHome: string | undefined;
let originalMaxBody: string | undefined;

beforeAll(async () => {
  upstream = http.createServer((req, res) => {
    let bodyBytes = 0;
    req.on('data', (chunk: Buffer) => {
      bodyBytes += chunk.length;
    });
    req.on('end', () => {
      upstreamRequests.push({ path: req.url || '', bodyBytes });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'msg_1', type: 'message', content: [] }));
    });
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const address = upstream.address();
  upstreamPort = typeof address === 'object' && address ? address.port : 0;
});

afterAll(() => {
  upstream?.close();
});

beforeEach(() => {
  upstreamRequests = [];
  originalCcsHome = process.env.CCS_HOME;
  originalMaxBody = process.env[MAX_BODY_ENV_VAR];
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-request-body-limit-'));
  process.env.CCS_HOME = tempHome;
  delete process.env[MAX_BODY_ENV_VAR];
  clearRecentLogEntries();
  invalidateLoggingConfigCache();
});

afterEach(() => {
  if (originalCcsHome === undefined) delete process.env.CCS_HOME;
  else process.env.CCS_HOME = originalCcsHome;
  if (originalMaxBody === undefined) delete process.env[MAX_BODY_ENV_VAR];
  else process.env[MAX_BODY_ENV_VAR] = originalMaxBody;
  fs.rmSync(tempHome, { recursive: true, force: true });
  clearRecentLogEntries();
  invalidateLoggingConfigCache();
});

function messagesBody(contentBytes: number, model = 'test-model'): string {
  return JSON.stringify({
    model,
    max_tokens: 16,
    messages: [{ role: 'user', content: 'x'.repeat(contentBytes) }],
  });
}

function post(port: number, body: string, requestPath = '/v1/messages'): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${requestPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

async function expectRequestTooLarge(response: Response): Promise<void> {
  expect(response.status).toBe(413);
  expect(response.headers.get('content-type')).toContain('application/json');
  const payload = (await response.json()) as {
    type?: string;
    error?: { type?: string; message?: string };
  };
  expect(payload.type).toBe('error');
  expect(payload.error?.type).toBe('request_too_large');
  expect(payload.error?.message).toContain('over the 1 MB limit of the local ccs proxy');
  expect(payload.error?.message).toContain('/compact');
}

function expectOneTooLargeWarning(source: string): void {
  const warnings = getRecentLogEntries().filter(
    (entry) => entry.event === 'request.body-too-large'
  );
  expect(warnings).toHaveLength(1);
  expect(warnings[0].level).toBe('warn');
  expect(warnings[0].source).toBe(source);
  expect(warnings[0].context).toMatchObject({ path: '/v1/messages', limitBytes: MB });
  expect(warnings[0].context?.receivedBytes as number).toBeGreaterThan(MB);
  // Size and path only: the body must never reach the log.
  expect(JSON.stringify(warnings[0])).not.toContain('xxxxxxxx');
}

describe('ToolSanitizationProxy body limit', () => {
  it('forwards an 11 MB body that the old 10 MB cap reset', async () => {
    const proxy = new ToolSanitizationProxy({
      upstreamBaseUrl: `http://127.0.0.1:${upstreamPort}`,
    });
    const port = await proxy.start();
    try {
      const body = messagesBody(11 * MB);
      const response = await post(port, body);
      expect(response.status).toBe(200);
      expect(upstreamRequests).toHaveLength(1);
      expect(upstreamRequests[0].bodyBytes).toBe(Buffer.byteLength(body));
    } finally {
      proxy.stop();
    }
  });

  it('answers 413 over the configured limit and keeps the connection usable', async () => {
    process.env[MAX_BODY_ENV_VAR] = '1';
    const proxy = new ToolSanitizationProxy({
      upstreamBaseUrl: `http://127.0.0.1:${upstreamPort}`,
    });
    const port = await proxy.start();
    try {
      await expectRequestTooLarge(await post(port, messagesBody(1.5 * MB)));
      expect(upstreamRequests).toHaveLength(0);
      expectOneTooLargeWarning('cliproxy:tool-sanitization-proxy');

      const followUp = await post(port, messagesBody(1024));
      expect(followUp.status).toBe(200);
      expect(upstreamRequests).toHaveLength(1);
    } finally {
      proxy.stop();
    }
  });
});

describe('CodexReasoningProxy body limit', () => {
  const codexProxy = () =>
    new CodexReasoningProxy({
      upstreamBaseUrl: `http://127.0.0.1:${upstreamPort}`,
      modelMap: { defaultModel: 'gpt-5.5-high' },
    });

  it('forwards an 11 MB body that the old 10 MB cap reset', async () => {
    const proxy = codexProxy();
    const port = await proxy.start();
    try {
      const response = await post(port, messagesBody(11 * MB, 'gpt-5.5'));
      expect(response.status).toBe(200);
      expect(upstreamRequests).toHaveLength(1);
      expect(upstreamRequests[0].bodyBytes).toBeGreaterThan(11 * MB);
    } finally {
      proxy.stop();
    }
  });

  it('answers 413 over the configured limit', async () => {
    process.env[MAX_BODY_ENV_VAR] = '1';
    const proxy = codexProxy();
    const port = await proxy.start();
    try {
      await expectRequestTooLarge(await post(port, messagesBody(1.5 * MB, 'gpt-5.5')));
      expect(upstreamRequests).toHaveLength(0);
      expectOneTooLargeWarning('cliproxy:codex-reasoning-proxy');
    } finally {
      proxy.stop();
    }
  });
});

describe('GlmtProxy body limit', () => {
  it('answers 413 over the configured limit before contacting upstream', async () => {
    process.env[MAX_BODY_ENV_VAR] = '1';
    const proxy = new GlmtProxy({});
    const port = await proxy.start();
    try {
      await expectRequestTooLarge(await post(port, messagesBody(1.5 * MB, 'glm-4.6')));
      expectOneTooLargeWarning('glmt:proxy');
    } finally {
      proxy.stop();
    }
  });
});
