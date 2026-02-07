/**
 * Integration tests for ToolSanitizationProxy
 *
 * Tests the full proxy flow: request sanitization → upstream forwarding → response restoration
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import * as http from 'http';
import { ToolSanitizationProxy } from '../../../src/cliproxy/tool-sanitization-proxy';

// Mock upstream server that echoes requests
let mockUpstream: http.Server;
let mockUpstreamPort: number;
let lastRequest: { body: unknown; headers: http.IncomingHttpHeaders } | null = null;

// Track response to send back
let mockResponse: { status: number; body: unknown; stream?: boolean } = {
  status: 200,
  body: { content: [] },
};

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    mockUpstream = http.createServer((req, res) => {
      const chunks: Buffer[] = [];

      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        lastRequest = {
          body: body ? JSON.parse(body) : null,
          headers: req.headers,
        };

        if (mockResponse.stream) {
          // SSE streaming response
          res.writeHead(mockResponse.status, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          });
          const events = mockResponse.body as string[];
          for (const event of events) {
            res.write(event);
          }
          res.end();
        } else {
          // Buffered JSON response
          res.writeHead(mockResponse.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(mockResponse.body));
        }
      });
    });

    mockUpstream.listen(0, '127.0.0.1', () => {
      const addr = mockUpstream.address();
      mockUpstreamPort = typeof addr === 'object' && addr ? addr.port : 0;
      resolve();
    });
  });
});

afterAll(() => {
  mockUpstream?.close();
});

beforeEach(() => {
  lastRequest = null;
  mockResponse = { status: 200, body: { content: [] } };
});

describe('ToolSanitizationProxy Integration', () => {
  describe('Proxy Lifecycle', () => {
    it('starts on ephemeral port and stops cleanly', async () => {
      const proxy = new ToolSanitizationProxy({
        upstreamBaseUrl: `http://127.0.0.1:${mockUpstreamPort}`,
      });

      const port = await proxy.start();
      expect(port).toBeGreaterThan(0);
      expect(proxy.getPort()).toBe(port);

      proxy.stop();
      expect(proxy.getPort()).toBeNull();
    });

    it('returns same port on multiple start calls', async () => {
      const proxy = new ToolSanitizationProxy({
        upstreamBaseUrl: `http://127.0.0.1:${mockUpstreamPort}`,
      });

      const port1 = await proxy.start();
      const port2 = await proxy.start();
      expect(port1).toBe(port2);

      proxy.stop();
    });
  });

  describe('Request Sanitization', () => {
    it('sanitizes duplicate segment tool names in request', async () => {
      const proxy = new ToolSanitizationProxy({
        upstreamBaseUrl: `http://127.0.0.1:${mockUpstreamPort}`,
      });
      const port = await proxy.start();

      try {
        const response = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'test-model',
            tools: [
              { name: 'gitmcp__plus-pro-components__plus-pro-components', description: 'Test tool' },
              { name: 'valid_tool', description: 'Valid tool' },
            ],
            messages: [{ role: 'user', content: 'test' }],
          }),
        });

        expect(response.ok).toBe(true);
        expect(lastRequest).not.toBeNull();

        const sentTools = (lastRequest!.body as Record<string, unknown>).tools as Array<{
          name: string;
        }>;
        expect(sentTools[0].name).toBe('gitmcp__plus-pro-components');
        expect(sentTools[1].name).toBe('valid_tool');
      } finally {
        proxy.stop();
      }
    });

    it('truncates tool names exceeding 64 characters', async () => {
      const proxy = new ToolSanitizationProxy({
        upstreamBaseUrl: `http://127.0.0.1:${mockUpstreamPort}`,
      });
      const port = await proxy.start();

      try {
        const longName = 'a'.repeat(100);
        await fetch(`http://127.0.0.1:${port}/v1/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tools: [{ name: longName }],
          }),
        });

        const sentTools = (lastRequest!.body as Record<string, unknown>).tools as Array<{
          name: string;
        }>;
        expect(sentTools[0].name.length).toBe(64);
        expect(sentTools[0].name).toContain('_'); // Has hash separator
      } finally {
        proxy.stop();
      }
    });

    it('passes through requests without tools unchanged', async () => {
      const proxy = new ToolSanitizationProxy({
        upstreamBaseUrl: `http://127.0.0.1:${mockUpstreamPort}`,
      });
      const port = await proxy.start();

      try {
        const originalBody = {
          model: 'test-model',
          messages: [{ role: 'user', content: 'Hello' }],
        };

        await fetch(`http://127.0.0.1:${port}/v1/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(originalBody),
        });

        expect(lastRequest!.body).toEqual(originalBody);
      } finally {
        proxy.stop();
      }
    });

    it('preserves other tool properties during sanitization', async () => {
      const proxy = new ToolSanitizationProxy({
        upstreamBaseUrl: `http://127.0.0.1:${mockUpstreamPort}`,
      });
      const port = await proxy.start();

      try {
        await fetch(`http://127.0.0.1:${port}/v1/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tools: [
              {
                name: 'foo__bar__bar',
                description: 'Test description',
                input_schema: { type: 'object', properties: { x: { type: 'string' } } },
              },
            ],
          }),
        });

        const sentTools = (lastRequest!.body as Record<string, unknown>).tools as Array<{
          name: string;
          description: string;
          input_schema: object;
        }>;
        expect(sentTools[0].name).toBe('foo__bar');
        expect(sentTools[0].description).toBe('Test description');
        expect(sentTools[0].input_schema).toEqual({
          type: 'object',
          properties: { x: { type: 'string' } },
        });
      } finally {
        proxy.stop();
      }
    });
  });

  describe('Response Restoration (Buffered)', () => {
    it('restores original tool names in tool_use response blocks', async () => {
      const proxy = new ToolSanitizationProxy({
        upstreamBaseUrl: `http://127.0.0.1:${mockUpstreamPort}`,
      });
      const port = await proxy.start();

      // Mock upstream returns sanitized name in tool_use
      mockResponse = {
        status: 200,
        body: {
          content: [
            { type: 'text', text: 'Using tool...' },
            { type: 'tool_use', id: 'call_123', name: 'foo__bar', input: { query: 'test' } },
          ],
        },
      };

      try {
        const response = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tools: [{ name: 'foo__bar__bar' }],
          }),
        });

        const data = (await response.json()) as { content: Array<{ type: string; name?: string }> };
        expect(data.content[0].type).toBe('text');
        expect(data.content[1].type).toBe('tool_use');
        expect(data.content[1].name).toBe('foo__bar__bar'); // Restored!
      } finally {
        proxy.stop();
      }
    });

    it('leaves unknown tool names unchanged in response', async () => {
      const proxy = new ToolSanitizationProxy({
        upstreamBaseUrl: `http://127.0.0.1:${mockUpstreamPort}`,
      });
      const port = await proxy.start();

      mockResponse = {
        status: 200,
        body: {
          content: [{ type: 'tool_use', id: 'call_456', name: 'unknown_tool', input: {} }],
        },
      };

      try {
        const response = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tools: [{ name: 'foo__bar__bar' }],
          }),
        });

        const data = (await response.json()) as { content: Array<{ name: string }> };
        expect(data.content[0].name).toBe('unknown_tool');
      } finally {
        proxy.stop();
      }
    });
  });

  describe('Response Restoration (Streaming)', () => {
    it('restores tool names in SSE streaming responses', async () => {
      const proxy = new ToolSanitizationProxy({
        upstreamBaseUrl: `http://127.0.0.1:${mockUpstreamPort}`,
      });
      const port = await proxy.start();

      // Mock SSE events with sanitized tool name
      mockResponse = {
        status: 200,
        stream: true,
        body: [
          'event: content_block_start\n',
          `data: ${JSON.stringify({ type: 'content_block_start', content_block: { type: 'tool_use', id: 'call_789', name: 'foo__bar' } })}\n\n`,
          'event: content_block_stop\n',
          'data: {"type":"content_block_stop"}\n\n',
        ],
      };

      try {
        const response = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stream: true,
            tools: [{ name: 'foo__bar__bar' }],
          }),
        });

        const text = await response.text();
        expect(text).toContain('foo__bar__bar'); // Restored in SSE
        expect(text).not.toContain('"name":"foo__bar"'); // Original sanitized name replaced
      } finally {
        proxy.stop();
      }
    });

    it('passes through SSE events when no sanitization occurred', async () => {
      const proxy = new ToolSanitizationProxy({
        upstreamBaseUrl: `http://127.0.0.1:${mockUpstreamPort}`,
      });
      const port = await proxy.start();

      mockResponse = {
        status: 200,
        stream: true,
        body: [
          'event: message_start\n',
          'data: {"type":"message_start"}\n\n',
          'event: content_block_delta\n',
          'data: {"type":"content_block_delta","delta":{"text":"Hello"}}\n\n',
        ],
      };

      try {
        const response = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stream: true,
            tools: [{ name: 'valid_tool' }], // No sanitization needed
          }),
        });

        const text = await response.text();
        expect(text).toContain('message_start');
        expect(text).toContain('content_block_delta');
      } finally {
        proxy.stop();
      }
    });
  });

  describe('Error Handling', () => {
    it('returns 400 for invalid JSON request body', async () => {
      const proxy = new ToolSanitizationProxy({
        upstreamBaseUrl: `http://127.0.0.1:${mockUpstreamPort}`,
      });
      const port = await proxy.start();

      try {
        const response = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'not valid json{',
        });

        expect(response.status).toBe(400);
        const data = (await response.json()) as { error: string };
        expect(data.error).toContain('Invalid JSON');
      } finally {
        proxy.stop();
      }
    });

    it('forwards upstream errors correctly', async () => {
      const proxy = new ToolSanitizationProxy({
        upstreamBaseUrl: `http://127.0.0.1:${mockUpstreamPort}`,
      });
      const port = await proxy.start();

      mockResponse = {
        status: 429,
        body: { error: { type: 'rate_limit_error', message: 'Too many requests' } },
      };

      try {
        const response = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tools: [] }),
        });

        expect(response.status).toBe(429);
      } finally {
        proxy.stop();
      }
    });

    it('handles upstream connection errors gracefully', async () => {
      const proxy = new ToolSanitizationProxy({
        upstreamBaseUrl: 'http://127.0.0.1:1', // Invalid port
        timeoutMs: 1000,
      });
      const port = await proxy.start();

      try {
        const response = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tools: [] }),
        });

        expect(response.status).toBe(502);
      } finally {
        proxy.stop();
      }
    });
  });

  describe('Non-JSON Passthrough', () => {
    it('forwards GET requests without modification', async () => {
      const proxy = new ToolSanitizationProxy({
        upstreamBaseUrl: `http://127.0.0.1:${mockUpstreamPort}`,
      });
      const port = await proxy.start();

      mockResponse = { status: 200, body: { status: 'ok' } };

      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`);
        expect(response.ok).toBe(true);
      } finally {
        proxy.stop();
      }
    });
  });

  describe('Multiple Tools Sanitization', () => {
    it('sanitizes multiple tools and tracks all mappings', async () => {
      const proxy = new ToolSanitizationProxy({
        upstreamBaseUrl: `http://127.0.0.1:${mockUpstreamPort}`,
      });
      const port = await proxy.start();

      mockResponse = {
        status: 200,
        body: {
          content: [
            { type: 'tool_use', id: '1', name: 'tool_a__x', input: {} },
            { type: 'tool_use', id: '2', name: 'tool_b__y', input: {} },
          ],
        },
      };

      try {
        const response = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tools: [
              { name: 'tool_a__x__x' },
              { name: 'tool_b__y__y' },
              { name: 'tool_c_valid' },
            ],
          }),
        });

        // Verify request was sanitized
        const sentTools = (lastRequest!.body as Record<string, unknown>).tools as Array<{
          name: string;
        }>;
        expect(sentTools[0].name).toBe('tool_a__x');
        expect(sentTools[1].name).toBe('tool_b__y');
        expect(sentTools[2].name).toBe('tool_c_valid');

        // Verify response was restored
        const data = (await response.json()) as { content: Array<{ name: string }> };
        expect(data.content[0].name).toBe('tool_a__x__x');
        expect(data.content[1].name).toBe('tool_b__y__y');
      } finally {
        proxy.stop();
      }
    });
  });

  describe('Empty Response Safety Net (Issue #350)', () => {
    it('injects synthetic response when streaming 200 has no content blocks', async () => {
      const proxy = new ToolSanitizationProxy({
        upstreamBaseUrl: `http://127.0.0.1:${mockUpstreamPort}`,
      });
      const port = await proxy.start();

      // Upstream sends message_start + message_delta + message_stop but NO content blocks
      mockResponse = {
        status: 200,
        stream: true,
        body: [
          'event: message_start\n',
          'data: {"type":"message_start","message":{"id":"msg_test","type":"message","role":"assistant","content":[],"model":"test","stop_reason":null}}\n\n',
          'event: message_delta\n',
          'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":10,"output_tokens":0}}\n\n',
          'event: message_stop\n',
          'data: {"type":"message_stop"}\n\n',
        ],
      };

      try {
        const response = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stream: true,
            tools: [{ name: 'valid_tool' }],
          }),
        });

        const text = await response.text();
        // Should contain the synthetic error message
        expect(text).toContain('[Proxy Error]');
        expect(text).toContain('content_block_start');
        expect(text).toContain('content_block_delta');
        expect(text).toContain('content_block_stop');
        // Should NOT have duplicate message_start (upstream already sent one)
        const messageStartCount = (text.match(/"type":"message_start"/g) || []).length;
        expect(messageStartCount).toBe(1); // Only the upstream one, not a synthetic duplicate
      } finally {
        proxy.stop();
      }
    });

    it('does NOT inject synthetic response when content blocks exist', async () => {
      const proxy = new ToolSanitizationProxy({
        upstreamBaseUrl: `http://127.0.0.1:${mockUpstreamPort}`,
      });
      const port = await proxy.start();

      mockResponse = {
        status: 200,
        stream: true,
        body: [
          'event: message_start\n',
          'data: {"type":"message_start","message":{"id":"msg_ok","type":"message","role":"assistant","content":[],"model":"test"}}\n\n',
          'event: content_block_start\n',
          'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
          'event: content_block_delta\n',
          'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n',
          'event: content_block_stop\n',
          'data: {"type":"content_block_stop","index":0}\n\n',
          'event: message_delta\n',
          'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n',
          'event: message_stop\n',
          'data: {"type":"message_stop"}\n\n',
        ],
      };

      try {
        const response = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stream: true,
            tools: [{ name: 'valid_tool' }],
          }),
        });

        const text = await response.text();
        expect(text).toContain('Hello');
        expect(text).not.toContain('[Proxy Error]');
      } finally {
        proxy.stop();
      }
    });

    it('does NOT inject synthetic response for 4xx/5xx errors', async () => {
      const proxy = new ToolSanitizationProxy({
        upstreamBaseUrl: `http://127.0.0.1:${mockUpstreamPort}`,
      });
      const port = await proxy.start();

      // 429 rate limit with SSE body but no content blocks
      mockResponse = {
        status: 429,
        stream: true,
        body: [
          'event: error\n',
          'data: {"type":"error","error":{"type":"rate_limit_error","message":"Too many requests"}}\n\n',
        ],
      };

      try {
        const response = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stream: true,
            tools: [{ name: 'valid_tool' }],
          }),
        });

        expect(response.status).toBe(429);
        const text = await response.text();
        expect(text).not.toContain('[Proxy Error]');
        expect(text).toContain('rate_limit_error');
      } finally {
        proxy.stop();
      }
    });

    it('injects synthetic response via SSE processing path (with sanitized tool names)', async () => {
      const proxy = new ToolSanitizationProxy({
        upstreamBaseUrl: `http://127.0.0.1:${mockUpstreamPort}`,
      });
      const port = await proxy.start();

      // Upstream returns empty content — no content_block_start events
      // Using sanitized tool name ('foo__bar__bar' → 'foo__bar') triggers the SSE processing path
      mockResponse = {
        status: 200,
        stream: true,
        body: [
          'event: message_start\n',
          'data: {"type":"message_start","message":{"id":"msg_sse","type":"message","role":"assistant","content":[],"model":"test","stop_reason":null}}\n\n',
          'event: message_delta\n',
          'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":10,"output_tokens":0}}\n\n',
          'event: message_stop\n',
          'data: {"type":"message_stop"}\n\n',
        ],
      };

      try {
        const response = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stream: true,
            tools: [{ name: 'foo__bar__bar' }], // Triggers sanitization → SSE processing path
          }),
        });

        const text = await response.text();
        expect(text).toContain('[Proxy Error]');
        expect(text).toContain('content_block_start');
        const messageStartCount = (text.match(/"type":"message_start"/g) || []).length;
        expect(messageStartCount).toBe(1);
      } finally {
        proxy.stop();
      }
    });

    it('injects synthetic response when upstream sends only message_start (real failure mode)', async () => {
      const proxy = new ToolSanitizationProxy({
        upstreamBaseUrl: `http://127.0.0.1:${mockUpstreamPort}`,
      });
      const port = await proxy.start();

      // Real failure: upstream sends message_start then abruptly ends — no message_delta or message_stop
      mockResponse = {
        status: 200,
        stream: true,
        body: [
          'event: message_start\n',
          'data: {"type":"message_start","message":{"id":"msg_abrupt","type":"message","role":"assistant","content":[],"model":"test","stop_reason":null}}\n\n',
        ],
      };

      try {
        const response = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stream: true,
            tools: [{ name: 'valid_tool' }],
          }),
        });

        const text = await response.text();
        expect(text).toContain('[Proxy Error]');
        expect(text).toContain('content_block_start');
        expect(text).toContain('message_delta');
        expect(text).toContain('message_stop');
        // Only 1 message_start — upstream's original
        const messageStartCount = (text.match(/"type":"message_start"/g) || []).length;
        expect(messageStartCount).toBe(1);
      } finally {
        proxy.stop();
      }
    });
  });
});
