import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isDaemonRunning, startDaemon, stopDaemon } from '../../src/cursor/cursor-daemon';
import { saveCredentials } from '../../src/cursor/cursor-auth';

let originalCcsHome: string | undefined;
let tempDir: string;

beforeEach(() => {
  originalCcsHome = process.env.CCS_HOME;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-daemon-integration-'));
  process.env.CCS_HOME = tempDir;
});

afterEach(async () => {
  await stopDaemon();

  if (originalCcsHome !== undefined) {
    process.env.CCS_HOME = originalCcsHome;
  } else {
    delete process.env.CCS_HOME;
  }

  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

describe('cursor daemon lifecycle smoke', () => {
  it('requires Anthropic caller auth token when credentials are present', async () => {
    const port = 10000 + Math.floor(Math.random() * 50000);

    saveCredentials({
      accessToken: 'a'.repeat(60),
      machineId: '1234567890abcdef1234567890abcdef',
      authMethod: 'manual',
      importedAt: new Date().toISOString(),
    });

    const result = await startDaemon({ port, ghost_mode: true });
    expect(result.success).toBe(true);
    const daemonToken = result.daemonToken as string;

    const response = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-ccs-cursor-token': daemonToken,
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4.5',
        max_tokens: 64,
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    expect(response.status).toBe(401);
    const body = (await response.json()) as {
      type?: string;
      error?: { type?: string; message?: string };
    };
    expect(body.type).toBe('error');
    expect(body.error?.type).toBe('authentication_error');
    expect(body.error?.message).toContain('Invalid Anthropic auth token');
  });
  it('starts, serves expected routes, and stops cleanly', async () => {
    const port = 10000 + Math.floor(Math.random() * 50000);
    const result = await startDaemon({ port, ghost_mode: true });
    expect(result.success).toBe(true);
    expect(result.pid).toBeDefined();
    const daemonToken = result.daemonToken as string;

    expect(await isDaemonRunning(port, daemonToken)).toBe(true);

    const modelsResponse = await fetch(`http://127.0.0.1:${port}/v1/models`);
    expect(modelsResponse.status).toBe(200);
    const modelsJson = (await modelsResponse.json()) as { object?: string; data?: unknown[] };
    expect(modelsJson.object).toBe('list');
    expect(Array.isArray(modelsJson.data)).toBe(true);

    const chatResponse = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ccs-cursor-token': daemonToken },
      body: JSON.stringify({
        model: 'gpt-4.1',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });
    expect(chatResponse.status).toBe(401);

    const anthropicResponse = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-ccs-cursor-token': daemonToken,
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4.5',
        max_tokens: 256,
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });
    expect(anthropicResponse.status).toBe(401);
    const anthropicBody = (await anthropicResponse.json()) as {
      type?: string;
      error?: { type?: string; message?: string };
    };
    expect(anthropicBody.type).toBe('error');
    expect(anthropicBody.error?.type).toBe('authentication_error');
    expect(anthropicBody.error?.message).toContain('Run `ccs legacy cursor auth` first');

    const stopResult = await stopDaemon();
    expect(stopResult.success).toBe(true);
    expect(await isDaemonRunning(port, daemonToken)).toBe(false);
  }, 35000);

  it('returns 404 for unknown routes', async () => {
    const port = 10000 + Math.floor(Math.random() * 50000);
    const result = await startDaemon({ port, ghost_mode: true });
    expect(result.success).toBe(true);
    const daemonToken = result.daemonToken as string;

    const response = await fetch(`http://127.0.0.1:${port}/unknown`, {
      headers: { 'x-ccs-cursor-token': daemonToken },
    });
    expect(response.status).toBe(404);
  });

  it('returns 401 when credentials are expired', async () => {
    const port = 10000 + Math.floor(Math.random() * 50000);
    const expiredAt = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();

    saveCredentials({
      accessToken: 'a'.repeat(60),
      machineId: '1234567890abcdef1234567890abcdef',
      authMethod: 'manual',
      importedAt: expiredAt,
    });

    const result = await startDaemon({ port, ghost_mode: true });
    expect(result.success).toBe(true);
    const daemonToken = result.daemonToken as string;

    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ccs-cursor-token': daemonToken },
      body: JSON.stringify({
        model: 'gpt-4.1',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    });

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error?: { message?: string } };
    expect(body.error?.message).toContain('expired');
  });

  it('validates invalid JSON, invalid message schema, and oversized body', async () => {
    const port = 10000 + Math.floor(Math.random() * 50000);
    const result = await startDaemon({ port, ghost_mode: true });
    expect(result.success).toBe(true);
    const daemonToken = result.daemonToken as string;
    const tokenHeader = { 'x-ccs-cursor-token': daemonToken };

    const invalidJson = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...tokenHeader },
      body: '{invalid-json',
    });
    expect(invalidJson.status).toBe(400);

    const invalidSchema = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...tokenHeader },
      body: JSON.stringify({
        model: 'gpt-4.1',
        messages: { role: 'user', content: 'hello' },
      }),
    });
    expect(invalidSchema.status).toBe(400);

    const invalidAnthropic = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        ...tokenHeader,
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4.5',
        max_tokens: 256,
        messages: [{ role: 'user', content: [{ type: 'image' }] }],
      }),
    });
    expect(invalidAnthropic.status).toBe(400);
    const invalidAnthropicBody = (await invalidAnthropic.json()) as {
      type?: string;
      error?: { type?: string; message?: string };
    };
    expect(invalidAnthropicBody.type).toBe('error');
    expect(invalidAnthropicBody.error?.type).toBe('invalid_request_error');
    expect(invalidAnthropicBody.error?.message).toContain('is not supported');

    const oversized = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...tokenHeader },
      body: JSON.stringify({
        model: 'gpt-4.1',
        messages: [
          {
            role: 'user',
            content: 'x'.repeat(10 * 1024 * 1024 + 1024),
          },
        ],
      }),
    });
    expect(oversized.status).toBe(413);
  });
});
