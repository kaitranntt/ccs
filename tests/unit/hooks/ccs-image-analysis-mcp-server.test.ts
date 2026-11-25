import { afterEach, describe, expect, it } from 'bun:test';
import { spawn } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const serverPath = join(process.cwd(), 'lib', 'mcp', 'ccs-image-analysis-server.cjs');

function encodeMessage(message: unknown): string {
  return `${JSON.stringify(message)}\n`;
}

function encodeLegacyMessage(message: unknown): string {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
}

function collectResponses(
  child: ReturnType<typeof spawn>,
  expectedCount: number
): Promise<Array<Record<string, unknown>>> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const responses: Array<Record<string, unknown>> = [];
    const timer = setTimeout(() => reject(new Error('Timed out waiting for MCP responses')), 5000);

    function tryParse(): void {
      while (true) {
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex === -1) {
          return;
        }

        const body = buffer.slice(0, newlineIndex).toString('utf8').replace(/\r$/, '').trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!body) {
          continue;
        }

        responses.push(JSON.parse(body) as Record<string, unknown>);
        if (responses.length >= expectedCount) {
          clearTimeout(timer);
          resolve(responses);
          return;
        }
      }
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      try {
        tryParse();
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function createTestPng(filePath: string): void {
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
    0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90,
    0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8,
    0xcf, 0xc0, 0x00, 0x00, 0x01, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb4, 0x00, 0x00, 0x00,
    0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  writeFileSync(filePath, png);
}

function createTestPdf(filePath: string): void {
  writeFileSync(filePath, '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n', 'utf8');
}

describe('ccs-image-analysis MCP server', () => {
  let tempDir = '';
  let imagePath = '';
  let mockServer: http.Server | null = null;

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      mockServer?.close(() => resolve());
      if (!mockServer) resolve();
    });
    mockServer = null;

    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = '';
      imagePath = '';
    }
  });

  it('lists the ImageAnalysis tool and posts directly to the provider-scoped CLIProxy route', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ccs-image-analysis-mcp-server-'));
    imagePath = join(tempDir, 'screen.png');
    createTestPng(imagePath);

    let receivedRequest: { path?: string; apiKey?: string; body?: unknown } | null = null;
    const mockPort = await new Promise<number>((resolve, reject) => {
      mockServer = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk.toString();
        });
        req.on('end', () => {
          receivedRequest = {
            path: req.url || '/',
            apiKey: req.headers['x-api-key'] as string,
            body: body ? JSON.parse(body) : null,
          };

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              content: [{ type: 'text', text: 'The screenshot shows a red pixel debug fixture.' }],
            })
          );
        });
      });

      mockServer.once('error', reject);
      mockServer.listen(0, '127.0.0.1', () => {
        const address = mockServer?.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Failed to resolve mock server port'));
          return;
        }
        resolve(address.port);
      });
    });

    const child = spawn('node', [serverPath], {
      cwd: tempDir,
      env: {
        ...process.env,
        CCS_IMAGE_ANALYSIS_ENABLED: '1',
        CCS_IMAGE_ANALYSIS_SKIP: '0',
        CCS_CURRENT_PROVIDER: 'agy',
        CCS_IMAGE_ANALYSIS_MODEL: 'gemini-3-1-flash-preview',
        CCS_IMAGE_ANALYSIS_RUNTIME_BASE_URL: `http://127.0.0.1:${mockPort}`,
        CCS_IMAGE_ANALYSIS_RUNTIME_PATH: '/api/provider/agy',
        CCS_IMAGE_ANALYSIS_RUNTIME_API_KEY: 'test-api-key',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    try {
      const responsesPromise = collectResponses(child, 3);
      child.stdin.write(
        encodeMessage({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'bun-test', version: '1.0.0' },
          },
        })
      );
      child.stdin.write(encodeMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' }));
      child.stdin.write(
        encodeMessage({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'ImageAnalysis',
            arguments: { filePath: imagePath, focus: 'Describe the visible issue' },
          },
        })
      );

      const responses = await responsesPromise;
      const toolsList = responses.find((message) => message.id === 2);
      const toolCall = responses.find((message) => message.id === 3);

      expect(toolsList?.result).toEqual({
        tools: [
          {
            name: 'ImageAnalysis',
            description:
              'Analyze a local image or PDF file with CCS provider-backed vision. Prefer this tool over Read for image and PDF paths. Use Read for text, code, and other plain files.',
            inputSchema: {
              type: 'object',
              properties: {
                filePath: {
                  type: 'string',
                  description:
                    'Workspace-relative path, or an absolute path inside the current workspace, to a local image or PDF file to analyze.',
                },
                focus: {
                  type: 'string',
                  description:
                    'Optional question or area of focus, for example "explain the error dialog" or "transcribe the visible text".',
                },
                template: {
                  type: 'string',
                  enum: ['default', 'screenshot', 'document'],
                  description:
                    'Optional prompt template override. Use screenshot for UI captures, document for PDFs/docs, or default for general images.',
                },
              },
              required: ['filePath'],
              additionalProperties: false,
            },
          },
        ],
      });
      const capturedRequest = receivedRequest as { path?: string; apiKey?: string; body?: unknown } | null;
      expect(capturedRequest?.path).toBe('/api/provider/agy/v1/messages');
      expect(capturedRequest?.apiKey).toBe('test-api-key');
      expect(
        (((capturedRequest?.body as { messages: Array<{ content: Array<{ text?: string }> }> })
          ?.messages[0]?.content[0] || {}) as { text?: string }).text
      ).toContain('Specific focus');
      expect(toolCall?.result).toBeDefined();
      expect(
        ((toolCall?.result as { content: Array<{ text: string }> }).content[0] || {}).text
      ).toContain('red pixel debug fixture');
      expect(
        ((toolCall?.result as { content: Array<{ text: string }> }).content[0] || {}).text
      ).toContain('Model: gemini-3-1-flash-preview');
    } finally {
      child.kill();
    }
  });

  it('returns a structured tool error when the file does not exist', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ccs-image-analysis-mcp-server-missing-'));
    const missingPath = join(tempDir, 'missing-image.png');
    const child = spawn('node', [serverPath], {
      cwd: tempDir,
      env: {
        ...process.env,
        CCS_IMAGE_ANALYSIS_ENABLED: '1',
        CCS_IMAGE_ANALYSIS_SKIP: '0',
        CCS_CURRENT_PROVIDER: 'agy',
        CCS_IMAGE_ANALYSIS_MODEL: 'gemini-3-1-flash-preview',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    try {
      const responsesPromise = collectResponses(child, 2);
      child.stdin.write(
        encodeMessage({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'bun-test', version: '1.0.0' },
          },
        })
      );
      child.stdin.write(
        encodeMessage({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'ImageAnalysis',
            arguments: { filePath: missingPath },
          },
        })
      );

      const responses = await responsesPromise;
      const toolCall = responses.find((message) => message.id === 2);

      expect(toolCall?.result).toEqual({
        content: [
          {
            type: 'text',
            text: `ImageAnalysis could not find file: ${missingPath}`,
          },
        ],
        isError: true,
      });
    } finally {
      child.kill();
    }
  });

  it('rejects paths outside the current workspace', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ccs-image-analysis-mcp-server-scope-'));
    const workspaceDir = join(tempDir, 'workspace');
    mkdirSync(workspaceDir, { recursive: true });
    const outsidePath = join(tempDir, 'outside.png');
    createTestPng(outsidePath);

    const child = spawn('node', [serverPath], {
      cwd: workspaceDir,
      env: {
        ...process.env,
        CCS_IMAGE_ANALYSIS_ENABLED: '1',
        CCS_IMAGE_ANALYSIS_SKIP: '0',
        CCS_CURRENT_PROVIDER: 'agy',
        CCS_IMAGE_ANALYSIS_MODEL: 'gemini-3-1-flash-preview',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    try {
      const responsesPromise = collectResponses(child, 2);
      child.stdin.write(
        encodeMessage({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'bun-test', version: '1.0.0' },
          },
        })
      );
      child.stdin.write(
        encodeMessage({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'ImageAnalysis',
            arguments: { filePath: '../outside.png' },
          },
        })
      );

      const responses = await responsesPromise;
      const toolCall = responses.find((message) => message.id === 2);
      expect(toolCall?.error).toEqual({
        code: -32602,
        message: 'ImageAnalysis only allows files inside the current workspace.',
      });
    } finally {
      child.kill();
    }
  });

  it('sends PDF files as document blocks to the provider-scoped route', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ccs-image-analysis-mcp-server-pdf-'));
    const pdfPath = join(tempDir, 'manual.pdf');
    createTestPdf(pdfPath);

    let receivedRequest: { path?: string; apiKey?: string; body?: unknown } | null = null;
    const mockPort = await new Promise<number>((resolve, reject) => {
      mockServer = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk.toString();
        });
        req.on('end', () => {
          receivedRequest = {
            path: req.url || '/',
            apiKey: req.headers['x-api-key'] as string,
            body: body ? JSON.parse(body) : null,
          };

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              content: [{ type: 'text', text: 'The PDF contains a one-page fixture.' }],
            })
          );
        });
      });

      mockServer.once('error', reject);
      mockServer.listen(0, '127.0.0.1', () => {
        const address = mockServer?.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Failed to resolve mock server port'));
          return;
        }
        resolve(address.port);
      });
    });

    const child = spawn('node', [serverPath], {
      cwd: tempDir,
      env: {
        ...process.env,
        CCS_IMAGE_ANALYSIS_ENABLED: '1',
        CCS_IMAGE_ANALYSIS_SKIP: '0',
        CCS_CURRENT_PROVIDER: 'agy',
        CCS_IMAGE_ANALYSIS_MODEL: 'gemini-3-1-flash-preview',
        CCS_IMAGE_ANALYSIS_RUNTIME_BASE_URL: `http://127.0.0.1:${mockPort}`,
        CCS_IMAGE_ANALYSIS_RUNTIME_PATH: '/api/provider/agy',
        CCS_IMAGE_ANALYSIS_RUNTIME_API_KEY: 'test-api-key',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    try {
      const responsesPromise = collectResponses(child, 2);
      child.stdin.write(
        encodeMessage({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'bun-test', version: '1.0.0' },
          },
        })
      );
      child.stdin.write(
        encodeMessage({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'ImageAnalysis',
            arguments: { filePath: pdfPath },
          },
        })
      );

      const responses = await responsesPromise;
      const capturedRequest = receivedRequest as { path?: string; apiKey?: string; body?: unknown } | null;
      const requestBody = capturedRequest?.body as {
        messages: Array<{ content: Array<{ type: string; source?: { media_type?: string } }> }>;
      };

      expect(capturedRequest?.path).toBe('/api/provider/agy/v1/messages');
      expect(capturedRequest?.apiKey).toBe('test-api-key');
      expect(requestBody.messages[0]?.content[1]?.type).toBe('document');
      expect(requestBody.messages[0]?.content[1]?.source?.media_type).toBe('application/pdf');
      expect(((responses[1]?.result as { content: Array<{ text: string }> }).content[0] || {}).text).toContain(
        'one-page fixture'
      );
    } finally {
      child.kill();
    }
  });

  it('accepts legacy Content-Length framed requests for compatibility', async () => {
    const child = spawn('node', [serverPath], {
      env: {
        ...process.env,
        CCS_IMAGE_ANALYSIS_ENABLED: '1',
        CCS_IMAGE_ANALYSIS_SKIP: '1',
        CCS_CURRENT_PROVIDER: 'agy',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    try {
      const responsesPromise = collectResponses(child, 2);
      child.stdin.write(
        encodeLegacyMessage({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'bun-test', version: '1.0.0' },
          },
        })
      );
      child.stdin.write(encodeLegacyMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' }));

      const responses = await responsesPromise;
      const toolsList = responses.find((message) => message.id === 2);
      expect(toolsList?.result).toEqual({ tools: [] });
    } finally {
      child.kill();
    }
  });
});
