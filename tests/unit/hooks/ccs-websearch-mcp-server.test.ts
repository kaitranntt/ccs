import { describe, expect, it } from 'bun:test';
import { spawn } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const serverPath = join(process.cwd(), 'lib', 'mcp', 'ccs-websearch-server.cjs');

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
        const startsWithLegacyHeaders = buffer
          .slice(0, Math.min(buffer.length, 32))
          .toString('utf8')
          .toLowerCase()
          .startsWith('content-length:');

        let body: string;
        if (startsWithLegacyHeaders) {
          const headerEnd = buffer.indexOf('\r\n\r\n');
          if (headerEnd === -1) {
            return;
          }

          const headerText = buffer.slice(0, headerEnd).toString('utf8');
          const match = headerText.match(/content-length:\s*(\d+)/i);
          if (!match) {
            reject(new Error('Missing Content-Length header'));
            return;
          }

          const contentLength = Number.parseInt(match[1], 10);
          const messageEnd = headerEnd + 4 + contentLength;
          if (buffer.length < messageEnd) {
            return;
          }

          body = buffer.slice(headerEnd + 4, messageEnd).toString('utf8');
          buffer = buffer.slice(messageEnd);
        } else {
          const newlineIndex = buffer.indexOf('\n');
          if (newlineIndex === -1) {
            return;
          }

          body = buffer.slice(0, newlineIndex).toString('utf8').replace(/\r$/, '').trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (!body) {
            continue;
          }
        }

        responses.push(JSON.parse(body) as Record<string, unknown>);

        if (responses.length >= expectedCount) {
          clearTimeout(timer);
          resolve(responses);
          return;
        }
      }
    }

    child.stdout.on('data', (chunk: Buffer) => {
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

    child.stderr.on('data', () => {
      // Ignore debug noise in tests.
    });
  });
}

function waitForClose(child: ReturnType<typeof spawn>): Promise<number | null> {
  return new Promise((resolve, reject) => {
    child.once('close', (code) => resolve(code));
    child.once('error', reject);
  });
}

describe('ccs-websearch MCP server', () => {
  it('lists the CCS WebSearch tool and returns provider-backed results', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'ccs-websearch-mcp-server-'));
    const preloadPath = join(tempDir, 'mock-fetch.cjs');
    const html = `
      <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Farticle">Example title</a>
      <a class="result__snippet">Example snippet</a>
    `.trim();
    writeFileSync(
      preloadPath,
      `global.fetch = async () => ({ ok: true, text: async () => ${JSON.stringify(html)} });\n`,
      'utf8'
    );

    const child = spawn('node', ['-r', preloadPath, serverPath], {
      env: {
        ...process.env,
        CCS_PROFILE_TYPE: 'settings',
        CCS_WEBSEARCH_ENABLED: '1',
        CCS_WEBSEARCH_SKIP: '0',
        CCS_WEBSEARCH_BRAVE: '0',
        CCS_WEBSEARCH_DUCKDUCKGO: '1',
        CCS_WEBSEARCH_EXA: '0',
        CCS_WEBSEARCH_GEMINI: '0',
        CCS_WEBSEARCH_GROK: '0',
        CCS_WEBSEARCH_OPENCODE: '0',
        CCS_WEBSEARCH_TAVILY: '0',
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
          params: { name: 'WebSearch', arguments: { query: 'btc price' } },
        })
      );

      const responses = await responsesPromise;
      const toolsList = responses.find((message) => message.id === 2);
      const toolCall = responses.find((message) => message.id === 3);

      expect(toolsList?.result).toEqual({
        tools: [
              {
                name: 'WebSearch',
                description:
                  'Third-party WebSearch replacement for CCS-managed Claude launches. Use this instead of Bash/curl/http fetches for web lookups. Provider order: Exa, Tavily, Keenable, Brave Search, SearXNG, DuckDuckGo, then optional legacy CLI fallback.',
                inputSchema: {
                  type: 'object',
                  properties: {
                query: {
                  type: 'string',
                  description:
                    'Web query to resolve through CCS providers. Prefer this tool over ad hoc Bash/curl lookups when you need current web information.',
                },
              },
              required: ['query'],
              additionalProperties: false,
            },
          },
        ],
      });
      expect(toolCall?.result).toBeDefined();
      expect(
        ((toolCall?.result as { content: Array<{ text: string }> }).content[0] || {}).text
      ).toContain('CCS local WebSearch evidence');
      expect(
        ((toolCall?.result as { content: Array<{ text: string }> }).content[0] || {}).text
      ).toContain('Provider: DuckDuckGo');
    } finally {
      child.kill();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('returns an MCP error result when DuckDuckGo responds with non-result HTML', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'ccs-websearch-mcp-server-'));
    const preloadPath = join(tempDir, 'mock-fetch.cjs');
    const html = `
      <html>
        <body>
          <form action="/anomaly.js" method="post">
            <input type="hidden" name="q" value="btc price" />
          </form>
        </body>
      </html>
    `.trim();
    writeFileSync(
      preloadPath,
      `global.fetch = async () => ({ ok: true, status: 202, headers: { get: () => null }, text: async () => ${JSON.stringify(html)} });\n`,
      'utf8'
    );

    const child = spawn('node', ['-r', preloadPath, serverPath], {
      env: {
        ...process.env,
        CCS_PROFILE_TYPE: 'settings',
        CCS_WEBSEARCH_ENABLED: '1',
        CCS_WEBSEARCH_SKIP: '0',
        CCS_WEBSEARCH_BRAVE: '0',
        CCS_WEBSEARCH_DUCKDUCKGO: '1',
        CCS_WEBSEARCH_EXA: '0',
        CCS_WEBSEARCH_GEMINI: '0',
        CCS_WEBSEARCH_GROK: '0',
        CCS_WEBSEARCH_OPENCODE: '0',
        CCS_WEBSEARCH_TAVILY: '0',
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
          params: { name: 'WebSearch', arguments: { query: 'btc price' } },
        })
      );

      const responses = await responsesPromise;
      const toolCall = responses.find((message) => message.id === 2);

      expect(toolCall?.result).toBeDefined();
      expect((toolCall?.result as { isError: boolean }).isError).toBe(true);
      expect(
        ((toolCall?.result as { content: Array<{ text: string }> }).content[0] || {}).text
      ).toContain('DuckDuckGo returned non-result HTML response');
      expect(
        ((toolCall?.result as { content: Array<{ text: string }> }).content[0] || {}).text
      ).not.toContain('Result count: 0');
    } finally {
      child.kill();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('accepts the legacy search alias for direct calls', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'ccs-websearch-mcp-server-'));
    const preloadPath = join(tempDir, 'mock-fetch.cjs');
    const html = `
      <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Farticle">Example title</a>
      <a class="result__snippet">Example snippet</a>
    `.trim();
    writeFileSync(
      preloadPath,
      `global.fetch = async () => ({ ok: true, text: async () => ${JSON.stringify(html)} });\n`,
      'utf8'
    );

    const child = spawn('node', ['-r', preloadPath, serverPath], {
      env: {
        ...process.env,
        CCS_PROFILE_TYPE: 'settings',
        CCS_WEBSEARCH_ENABLED: '1',
        CCS_WEBSEARCH_SKIP: '0',
        CCS_WEBSEARCH_BRAVE: '0',
        CCS_WEBSEARCH_DUCKDUCKGO: '1',
        CCS_WEBSEARCH_EXA: '0',
        CCS_WEBSEARCH_GEMINI: '0',
        CCS_WEBSEARCH_GROK: '0',
        CCS_WEBSEARCH_OPENCODE: '0',
        CCS_WEBSEARCH_TAVILY: '0',
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
          params: { name: 'search', arguments: { query: 'btc price' } },
        })
      );

      const responses = await responsesPromise;
      const toolCall = responses.find((message) => message.id === 2);

      expect(toolCall?.result).toBeDefined();
      expect(
        ((toolCall?.result as { content: Array<{ text: string }> }).content[0] || {}).text
      ).toContain('CCS local WebSearch evidence');
      expect(
        ((toolCall?.result as { content: Array<{ text: string }> }).content[0] || {}).text
      ).toContain('Provider: DuckDuckGo');
    } finally {
      child.kill();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('hides the tool for native account profiles', async () => {
    const child = spawn('node', [serverPath], {
      env: {
        ...process.env,
        CCS_PROFILE_TYPE: 'account',
        CCS_WEBSEARCH_ENABLED: '1',
        CCS_WEBSEARCH_SKIP: '1',
        CCS_WEBSEARCH_DUCKDUCKGO: '1',
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
      child.stdin.write(encodeMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' }));

      const responses = await responsesPromise;
      const toolsList = responses.find((message) => message.id === 2);
      expect(toolsList?.result).toEqual({ tools: [] });
    } finally {
      child.kill();
    }
  });

  it('writes trace records for exposure, tool calls, provider success, and session summary', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'ccs-websearch-mcp-trace-'));
    const preloadPath = join(tempDir, 'mock-fetch.cjs');
    const ccsHome = join(tempDir, 'home');
    const tracePath = join(ccsHome, '.ccs', 'logs', 'websearch-trace.jsonl');
    const html = `
      <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Farticle">Example title</a>
      <a class="result__snippet">Example snippet</a>
    `.trim();
    writeFileSync(
      preloadPath,
      `global.fetch = async () => ({ ok: true, text: async () => ${JSON.stringify(html)} });\n`,
      'utf8'
    );

    const child = spawn('node', ['-r', preloadPath, serverPath], {
      env: {
        ...process.env,
        CCS_HOME: ccsHome,
        CCS_PROFILE_TYPE: 'settings',
        CCS_WEBSEARCH_TRACE: '1',
        CCS_WEBSEARCH_TRACE_LAUNCH_ID: 'mcp-trace-test',
        CCS_WEBSEARCH_TRACE_LAUNCHER: 'unit-test',
        CCS_WEBSEARCH_ENABLED: '1',
        CCS_WEBSEARCH_SKIP: '0',
        CCS_WEBSEARCH_BRAVE: '0',
        CCS_WEBSEARCH_DUCKDUCKGO: '1',
        CCS_WEBSEARCH_EXA: '0',
        CCS_WEBSEARCH_GEMINI: '0',
        CCS_WEBSEARCH_GROK: '0',
        CCS_WEBSEARCH_OPENCODE: '0',
        CCS_WEBSEARCH_TAVILY: '0',
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
          params: { name: 'WebSearch', arguments: { query: 'btc price' } },
        })
      );

      await responsesPromise;
    } finally {
      child.kill();
      await waitForClose(child);
    }

    const traceEvents = readFileSync(tracePath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(
      traceEvents.some((event) => event.event === 'mcp_tools_list' && event.exposed === true)
    ).toBe(true);
    expect(
      traceEvents.some(
        (event) => event.event === 'mcp_tool_call_received' && event.toolName === 'WebSearch'
      )
    ).toBe(true);
    expect(
      traceEvents.some(
        (event) =>
          event.event === 'websearch_provider_success' && event.providerName === 'DuckDuckGo'
      )
    ).toBe(true);
    expect(
      traceEvents.some(
        (event) =>
          event.event === 'mcp_session_summary' &&
          event.calledWebSearch === true &&
          event.toolCalls === 1
      )
    ).toBe(true);

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('accepts legacy Content-Length framed requests for compatibility', async () => {
    const child = spawn('node', [serverPath], {
      env: {
        ...process.env,
        CCS_PROFILE_TYPE: 'account',
        CCS_WEBSEARCH_ENABLED: '1',
        CCS_WEBSEARCH_SKIP: '1',
        CCS_WEBSEARCH_DUCKDUCKGO: '1',
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
