import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';

const HOOK_PATH = path.join(__dirname, '../../lib/hooks/image-analyzer-transformer.cjs');
const TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-image-hook-it-'));
const TEST_PNG_PATH = path.join(TEST_DIR, 'thinking-block-test.png');
const CLIPROXY_API_KEY = 'test-api-key-12345';

interface HookResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface MockRequest {
  method: string;
  path: string;
  body: unknown;
}

interface MockResponse {
  statusCode: number;
  body: unknown;
}

let mockServer: http.Server | null = null;
let mockPort = 0;
let requests: MockRequest[] = [];
let queuedResponses: MockResponse[] = [];

function createTestPng(filepath: string): void {
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
    0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90,
    0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8,
    0xcf, 0xc0, 0x00, 0x00, 0x01, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb4, 0x00, 0x00, 0x00,
    0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  fs.writeFileSync(filepath, png);
}

function enqueueResponses(...responses: MockResponse[]): void {
  queuedResponses = responses;
}

function invokeHook(
  env: Record<string, string> = {},
  options: { filePath?: string; cwd?: string } = {}
): Promise<HookResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [HOOK_PATH], {
      env: {
        ...process.env,
        CCS_IMAGE_ANALYSIS_SKIP: '', // clear any inherited skip flag
        CCS_IMAGE_ANALYSIS_SKIP_HOOK: '', // clear any inherited MCP-ready bypass
        CCS_IMAGE_ANALYSIS_MODEL: '', // let each test control explicit model fallback behavior
        CCS_IMAGE_ANALYSIS_BACKEND_ID: '',
        CCS_IMAGE_ANALYSIS_RUNTIME_PATH: '',
        CCS_IMAGE_ANALYSIS_RUNTIME_BASE_URL: '',
        CCS_CLIPROXY_API_KEY: CLIPROXY_API_KEY,
        CCS_CLIPROXY_PORT: String(mockPort),
        CCS_IMAGE_ANALYSIS_ENABLED: '1',
        CCS_PROFILE_TYPE: 'cliproxy',
        CCS_CURRENT_PROVIDER: 'codex',
        CCS_IMAGE_ANALYSIS_PROVIDER_MODELS:
          'codex:gpt-5.1-codex-mini,agy:gemini-3-1-flash-preview',
        ...env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: options.cwd ?? TEST_DIR,
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Hook timed out'));
    }, 10000);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });

    child.stdin.end(
      JSON.stringify({
        tool_name: 'Read',
        tool_input: { file_path: options.filePath ?? TEST_PNG_PATH },
      })
    );
  });
}

beforeAll(async () => {
  createTestPng(TEST_PNG_PATH);

  mockServer = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      requests.push({
        method: req.method || 'GET',
        path: req.url || '/',
        body: body ? JSON.parse(body) : null,
      });

      const nextResponse = queuedResponses.shift() || {
        statusCode: 200,
        body: { content: [{ type: 'text', text: 'default description' }] },
      };

      res.writeHead(nextResponse.statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(nextResponse.body));
    });
  });

  await new Promise<void>((resolve, reject) => {
    mockServer?.once('error', reject);
    mockServer?.listen(0, '127.0.0.1', () => {
      const address = mockServer?.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to resolve mock server port'));
        return;
      }
      mockPort = address.port;
      resolve();
    });
  });
});

beforeEach(() => {
  requests = [];
  enqueueResponses({
    statusCode: 200,
    body: { content: [{ type: 'text', text: 'default description' }] },
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => mockServer?.close(() => resolve()));
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('image analyzer hook regression coverage', () => {
  it('uses the first text block after thinking blocks', async () => {
    enqueueResponses({
      statusCode: 200,
      body: {
        content: [
          { type: 'thinking', thinking: 'internal reasoning' },
          { type: 'text', text: 'blue square with white border' },
        ],
      },
    });

    const result = await invokeHook();

    expect(result.code).toBe(2);
    expect(requests).toHaveLength(1);
    const output = JSON.parse(result.stdout);
    expect(output.hookSpecificOutput.permissionDecisionReason).toContain(
      'blue square with white border'
    );
  });

  it('does not retry onto a cross-provider default model when a provider-specific model is set', async () => {
    enqueueResponses({
      statusCode: 500,
      body: { error: { message: 'mock failure' } },
    });

    const result = await invokeHook();

    expect(result.code).toBe(2);
    expect(requests).toHaveLength(1);
    expect((requests[0].body as { model: string }).model).toBe('gpt-5.1-codex-mini');
  });

  it('does not analyze files outside the current workspace', async () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-image-hook-outside-'));
    const outsidePath = path.join(outsideDir, 'sensitive-outside-workspace.png');
    createTestPng(outsidePath);

    try {
      const result = await invokeHook({}, { filePath: outsidePath });

      expect(result.code).toBe(0);
      expect(requests).toHaveLength(0);
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it.if(process.platform === 'win32')(
    'analyzes Windows-style relative paths inside the current workspace',
    async () => {
      const nestedDir = path.join(TEST_DIR, 'windows-style-fixture-dir');
      const nestedPath = path.join(nestedDir, 'inside-workspace.png');
      fs.mkdirSync(nestedDir, { recursive: true });
      createTestPng(nestedPath);

      const result = await invokeHook({}, { filePath: path.win32.relative(TEST_DIR, nestedPath) });

      expect(result.code).toBe(2);
      expect(requests).toHaveLength(1);
    }
  );

  it('does not analyze workspace symlinks that resolve outside the current workspace', async () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-image-hook-symlink-'));
    const outsidePath = path.join(outsideDir, 'sensitive-symlink-target.png');
    const linkPath = path.join(TEST_DIR, 'linked-sensitive.png');
    createTestPng(outsidePath);

    try {
      fs.symlinkSync(outsidePath, linkPath);
      const result = await invokeHook({}, { filePath: linkPath });

      expect(result.code).toBe(0);
      expect(requests).toHaveLength(0);
    } finally {
      fs.rmSync(linkPath, { force: true });
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it('skips analysis before contacting CLIProxy when the current provider has no mapped vision model', async () => {
    const result = await invokeHook({
      CCS_CURRENT_PROVIDER: 'unknown-provider',
      CCS_IMAGE_ANALYSIS_PROVIDER_MODELS: 'agy:gemini-3-1-flash-preview',
    });

    expect(result.code).toBe(0);
    expect(requests).toHaveLength(0);
  });
});
