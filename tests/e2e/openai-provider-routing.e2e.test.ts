import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { spawn, spawnSync } from 'child_process';
import getPort from 'get-port';

const DIST_ENTRY = path.join(process.cwd(), 'dist', 'ccs.js');

let originalCcsHome: string | undefined;
let tempDir: string;
let upstreamServer: http.Server;
let upstreamBody: unknown;

beforeEach(() => {
  originalCcsHome = process.env.CCS_HOME;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-routing-e2e-'));
  upstreamBody = undefined;
});

afterEach(() => {
  try {
    upstreamServer?.close();
  } catch {
    // Best-effort cleanup.
  }
  spawnSync(process.execPath, [DIST_ENTRY, 'proxy', 'stop'], {
    env: { ...process.env, CCS_HOME: tempDir },
  });
  if (originalCcsHome !== undefined) {
    process.env.CCS_HOME = originalCcsHome;
  } else {
    delete process.env.CCS_HOME;
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function startMockUpstream(port: number): Promise<void> {
  return new Promise((resolve) => {
    upstreamServer = http.createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString();
      }
      upstreamBody = JSON.parse(body);

      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(
        'data: {"id":"chatcmpl_1","model":"hf-model","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"}}]}\n\n'
      );
      res.write(
        'data: {"id":"chatcmpl_1","model":"hf-model","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"search","arguments":"{\\"q\\":\\"docs\\"}"}}]}}]}\n\n'
      );
      res.write(
        'data: {"id":"chatcmpl_1","model":"hf-model","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":9,"completion_tokens":4}}\n\n'
      );
      res.end('data: [DONE]\n\n');
    });
    upstreamServer.listen(port, '127.0.0.1', () => resolve());
  });
}

function runCli(
  args: string[],
  env: Record<string, string>
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [DIST_ENTRY, ...args], {
      env: {
        ...process.env,
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

beforeAll(() => {
  const result = spawnSync(process.execPath, ['run', 'build'], {
    encoding: 'utf8',
    env: process.env,
  });
  expect(result.status).toBe(0);
});

describe('openai provider routing e2e', () => {
  it('routes a settings profile through the local proxy into an OpenAI-compatible upstream', async () => {
    const upstreamPort = await getPort();
    await startMockUpstream(upstreamPort);

    const ccsDir = path.join(tempDir, '.ccs');
    const binDir = path.join(tempDir, 'bin');
    const outputPath = path.join(tempDir, 'claude-output.json');
    const fakeClaudeRuntimePath = path.join(binDir, 'fake-claude.cjs');
    const fakeClaudePath = path.join(
      binDir,
      process.platform === 'win32' ? 'claude.cmd' : 'claude'
    );
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.mkdirSync(binDir, { recursive: true });

    const settingsPath = path.join(ccsDir, 'hf.settings.json');
    fs.writeFileSync(
      path.join(ccsDir, 'config.json'),
      JSON.stringify({ profiles: { hf: settingsPath } }, null, 2),
      'utf8'
    );
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: `http://127.0.0.1:${upstreamPort}`,
          ANTHROPIC_AUTH_TOKEN: 'hf_token',
          ANTHROPIC_MODEL: 'hf-model',
          CCS_DROID_PROVIDER: 'generic-chat-completion-api',
        },
      }),
      'utf8'
    );
    fs.writeFileSync(
      fakeClaudeRuntimePath,
      `
const fs = require('fs');
(async () => {
  const response = await fetch(\`\${process.env.ANTHROPIC_BASE_URL}/v1/messages\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': process.env.ANTHROPIC_AUTH_TOKEN,
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL,
      stream: true,
      tools: [{ name: 'search', description: 'Search docs', input_schema: { type: 'object' } }],
      messages: [{ role: 'user', content: 'Find docs' }],
    }),
  });
  const text = await response.text();
  fs.writeFileSync(process.env.CCS_E2E_OUTPUT, JSON.stringify({
    status: response.status,
    baseUrl: process.env.ANTHROPIC_BASE_URL,
    authToken: process.env.ANTHROPIC_AUTH_TOKEN,
    text
  }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
`,
      'utf8'
    );
    fs.writeFileSync(
      fakeClaudePath,
      process.platform === 'win32'
        ? '@echo off\r\nnode "%~dp0fake-claude.cjs" %*\r\n'
        : '#!/bin/sh\nexec node "$(dirname "$0")/fake-claude.cjs" "$@"\n',
      { mode: 0o755 }
    );

    const result = await runCli(['hf'], {
      ...process.env,
      CCS_HOME: tempDir,
      CCS_E2E_OUTPUT: outputPath,
      PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
    });

    expect(result.code).toBe(0);
    const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as {
      status: number;
      baseUrl: string;
      authToken: string;
      text: string;
    };

    expect(payload.status).toBe(200);
    expect(payload.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(payload.authToken).toMatch(/^[a-f0-9]{48}$/);
    expect(payload.text).toContain('event: message_start');
    expect(payload.text).toContain('tool_use');
    expect(payload.text).toContain('message_stop');

    const parsedUpstream = upstreamBody as {
      messages?: Array<{ role: string; content: string }>;
      tools?: Array<{ type: string }>;
    };
    expect(parsedUpstream.messages?.[0]).toEqual({ role: 'user', content: 'Find docs' });
    expect(parsedUpstream.tools?.[0]?.type).toBe('function');
  }, 35000);
});
