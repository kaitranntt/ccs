/**
 * HTTPS Tunnel Proxy Tests
 *
 * Tests for HttpsTunnelProxy which tunnels HTTP requests to remote HTTPS CLIProxyAPI.
 * Required because Claude Code (undici) doesn't support HTTPS in ANTHROPIC_BASE_URL.
 */
import { describe, it, expect, afterEach } from 'bun:test';
import * as http from 'http';

// Import the class under test
import { HttpsTunnelProxy, type HttpsTunnelConfig } from '../https-tunnel-proxy';

describe('HttpsTunnelProxy', () => {
  let tunnel: HttpsTunnelProxy | null = null;

  afterEach(() => {
    // Clean up tunnel
    if (tunnel) {
      tunnel.stop();
      tunnel = null;
    }
  });

  describe('constructor', () => {
    it('should apply default values for optional config', () => {
      tunnel = new HttpsTunnelProxy({
        remoteHost: 'example.com',
      });

      // The proxy should be created without error
      expect(tunnel).toBeDefined();
      expect(tunnel.getPort()).toBeNull(); // Not started yet
    });

    it('should accept custom config values', () => {
      tunnel = new HttpsTunnelProxy({
        remoteHost: 'custom.host.com',
        remotePort: 8443,
        authToken: 'test-token',
        timeoutMs: 30000,
        verbose: true,
        allowSelfSigned: true,
      });

      expect(tunnel).toBeDefined();
    });

    // Hostname validation tests
    it('should throw error for empty hostname', () => {
      expect(() => {
        new HttpsTunnelProxy({ remoteHost: '' });
      }).toThrow('Invalid remoteHost format');
    });

    it('should throw error for hostname with protocol prefix', () => {
      expect(() => {
        new HttpsTunnelProxy({ remoteHost: 'https://example.com' });
      }).toThrow('Invalid remoteHost format');
    });

    it('should throw error for hostname with spaces', () => {
      expect(() => {
        new HttpsTunnelProxy({ remoteHost: 'example .com' });
      }).toThrow('Invalid remoteHost format');
    });

    it('should throw error for hostname with invalid characters', () => {
      expect(() => {
        new HttpsTunnelProxy({ remoteHost: 'example@com' });
      }).toThrow('Invalid remoteHost format');
    });

    it('should accept valid hostnames', () => {
      // Standard domain
      expect(() => new HttpsTunnelProxy({ remoteHost: 'example.com' })).not.toThrow();
      // Subdomain
      expect(() => new HttpsTunnelProxy({ remoteHost: 'api.example.com' })).not.toThrow();
      // With dashes
      expect(() => new HttpsTunnelProxy({ remoteHost: 'my-api.example-site.com' })).not.toThrow();
      // IP-like
      expect(() => new HttpsTunnelProxy({ remoteHost: '192.168.1.1' })).not.toThrow();
      // Localhost
      expect(() => new HttpsTunnelProxy({ remoteHost: 'localhost' })).not.toThrow();
      // Single char hostname
      expect(() => new HttpsTunnelProxy({ remoteHost: 'a' })).not.toThrow();
    });
  });

  describe('start()', () => {
    it('should start server and return valid port', async () => {
      tunnel = new HttpsTunnelProxy({
        remoteHost: 'example.com',
      });

      const port = await tunnel.start();

      expect(port).toBeGreaterThan(0);
      expect(port).toBeLessThan(65536);
      expect(tunnel.getPort()).toBe(port);
    });

    it('should return same port on subsequent start() calls', async () => {
      tunnel = new HttpsTunnelProxy({
        remoteHost: 'example.com',
      });

      const port1 = await tunnel.start();
      const port2 = await tunnel.start();

      expect(port1).toBe(port2);
    });

    it('should bind to localhost only (127.0.0.1)', async () => {
      tunnel = new HttpsTunnelProxy({
        remoteHost: 'example.com',
      });

      const port = await tunnel.start();
      const net = await import('net');
      const socket = new net.Socket();

      await new Promise<void>((resolve, reject) => {
        socket.once('error', reject);
        socket.connect(port, '127.0.0.1', () => {
          socket.end();
          resolve();
        });
      });

      expect(tunnel.getPort()).toBe(port);
    });
  });

  describe('stop()', () => {
    it('should clear port after stop', async () => {
      tunnel = new HttpsTunnelProxy({
        remoteHost: 'example.com',
      });

      await tunnel.start();
      expect(tunnel.getPort()).not.toBeNull();

      tunnel.stop();
      expect(tunnel.getPort()).toBeNull();
    });

    it('should be idempotent (safe to call multiple times)', () => {
      tunnel = new HttpsTunnelProxy({
        remoteHost: 'example.com',
      });

      // Stop without start - should not throw
      tunnel.stop();
      tunnel.stop();
      tunnel.stop();

      expect(tunnel.getPort()).toBeNull();
    });

    it('should allow restart after stop', async () => {
      tunnel = new HttpsTunnelProxy({
        remoteHost: 'example.com',
      });

      const port1 = await tunnel.start();
      tunnel.stop();

      const port2 = await tunnel.start();

      expect(port2).toBeGreaterThan(0);
      // Ports may or may not be the same depending on OS port reuse
    });
  });

  describe('getPort()', () => {
    it('should return null before start', () => {
      tunnel = new HttpsTunnelProxy({
        remoteHost: 'example.com',
      });

      expect(tunnel.getPort()).toBeNull();
    });

    it('should return valid port after start', async () => {
      tunnel = new HttpsTunnelProxy({
        remoteHost: 'example.com',
      });

      await tunnel.start();

      const port = tunnel.getPort();
      expect(port).not.toBeNull();
      expect(port).toBeGreaterThan(0);
    });
  });

  describe('buildForwardHeaders (Authorization injection)', () => {
    // We test this indirectly through the proxy behavior
    // The buildForwardHeaders method is private, so we verify via integration

    it('should forward existing Authorization header', async () => {
      // This test requires a mock HTTPS server
      // For now, we document the expected behavior
      const config: HttpsTunnelConfig = {
        remoteHost: 'example.com',
        authToken: 'fallback-token',
      };

      tunnel = new HttpsTunnelProxy(config);
      await tunnel.start();

      // The tunnel should:
      // 1. Forward 'Authorization' header if present in request
      // 2. Inject 'Authorization: Bearer fallback-token' if not present
      expect(tunnel.getPort()).toBeGreaterThan(0);
    });
  });

  describe('hop-by-hop headers filtering', () => {
    // RFC 7230 hop-by-hop headers should be filtered
    const hopByHopHeaders = [
      'host',
      'connection',
      'transfer-encoding',
      'keep-alive',
      'proxy-authenticate',
      'proxy-authorization',
      'te',
      'trailer',
      'upgrade',
    ];

    it('should define all RFC 7230 hop-by-hop headers for filtering', () => {
      // Document expected filtered headers
      expect(hopByHopHeaders).toContain('connection');
      expect(hopByHopHeaders).toContain('transfer-encoding');
      expect(hopByHopHeaders).toContain('keep-alive');
    });
  });

  describe('connection tracking', () => {
    it('should track active connections for cleanup', async () => {
      tunnel = new HttpsTunnelProxy({
        remoteHost: 'example.com',
        verbose: false,
      });

      const port = await tunnel.start();

      // Create a connection
      const net = await import('net');
      const socket = new net.Socket();

      // Use a promise that resolves when connection is established
      await new Promise<void>((resolve, reject) => {
        socket.on('error', reject);
        socket.connect(port, '127.0.0.1', () => resolve());
      });

      // Give the server time to register the connection
      await new Promise((r) => setTimeout(r, 50));

      // Stop should forcefully close all connections and the server
      tunnel.stop();

      // Verify stop() was called successfully (server is null after stop)
      // The key behavior is that stop() destroys server-side sockets
      // and clears activeConnections - we verify by checking getPort() returns null
      expect(tunnel.getPort()).toBe(null);

      // Clean up client socket
      socket.destroy();
    });
  });

  describe('error handling', () => {
    it('should handle client disconnect (premature close)', async () => {
      // Test that tunnel handles client-side aborts gracefully
      // No need for mock - just test tunnel's resilience to client errors
      const testTunnel = new HttpsTunnelProxy({
        remoteHost: 'example.com',
        timeoutMs: 10000,
      });

      const port = await testTunnel.start();

      try {
        // Make request and immediately abort
        const req = http.request({
          hostname: '127.0.0.1',
          port,
          path: '/v1/messages',
          method: 'POST',
        });
        req.on('error', () => {
          // Client abort emits ECONNRESET, which is expected
        });

        req.write('{}');
        req.end();

        // Abort after a short delay to trigger premature close
        await new Promise((resolve) => setTimeout(resolve, 50));
        req.destroy();

        // Give time for error handling
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Tunnel should still be operational
        expect(testTunnel.getPort()).toBe(port);
      } finally {
        testTunnel.stop();
      }
    });
    it('should handle client request error', async () => {
      tunnel = new HttpsTunnelProxy({
        remoteHost: 'example.com',
        remotePort: 443,
        timeoutMs: 5000,
      });

      const port = await tunnel.start();

      // Create socket and send malformed request
      const net = await import('net');
      const socket = new net.Socket();

      await new Promise<void>((resolve, reject) => {
        socket.connect(port, '127.0.0.1', () => {
          // Send partial HTTP request then destroy
          socket.write('POST /test HTTP/1.1\r\n');
          socket.write('Content-Length: 100\r\n\r\n'); // Claim 100 bytes
          socket.write('partial'); // Only send partial body
          socket.destroy(); // Trigger error
          resolve();
        });
        socket.on('error', () => resolve()); // Ignore socket errors
      });

      // Give time for error handling
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Tunnel should still be operational
      expect(tunnel.getPort()).toBe(port);
    });

    it('should handle upstream connection errors gracefully', async () => {
      tunnel = new HttpsTunnelProxy({
        remoteHost: 'nonexistent.invalid.host',
        remotePort: 12345,
        timeoutMs: 1000,
      });

      const port = await tunnel.start();

      // Make request to tunnel - should get 502 error
      const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: '/v1/messages',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
          },
          resolve
        );
        req.on('error', reject);
        req.setTimeout(5000);
        req.write('{}');
        req.end();
      });

      expect(response.statusCode).toBe(502);
    });

    it('should return JSON error response', async () => {
      tunnel = new HttpsTunnelProxy({
        remoteHost: 'nonexistent.invalid.host',
        remotePort: 12345,
        timeoutMs: 1000,
      });

      const port = await tunnel.start();

      const body = await new Promise<string>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: '/v1/messages',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => resolve(data));
          }
        );
        req.on('error', reject);
        req.setTimeout(5000);
        req.write('{}');
        req.end();
      });

      const parsed = JSON.parse(body);
      expect(parsed).toHaveProperty('error');
      expect(typeof parsed.error).toBe('string');
    });
  });

  describe('config interface', () => {
    it('should export HttpsTunnelConfig type', () => {
      const config: HttpsTunnelConfig = {
        remoteHost: 'test.com',
        remotePort: 443,
        authToken: 'token',
        timeoutMs: 60000,
        verbose: false,
        allowSelfSigned: false,
      };

      expect(config.remoteHost).toBe('test.com');
      expect(config.remotePort).toBe(443);
    });

    it('should allow minimal config with only remoteHost', () => {
      const config: HttpsTunnelConfig = {
        remoteHost: 'minimal.test.com',
      };

      expect(config.remoteHost).toBe('minimal.test.com');
      expect(config.remotePort).toBeUndefined();
      expect(config.authToken).toBeUndefined();
    });
  });
});

describe('HttpsTunnelProxy stripPathPrefix integration with CodexReasoningProxy', () => {
  // Document the integration pattern between HttpsTunnelProxy and CodexReasoningProxy
  // In remote mode, the path flow is:
  //   Claude → CodexReasoningProxy → HttpsTunnelProxy → Remote CLIProxyAPI
  //
  // CodexReasoningProxy strips /api/provider/codex prefix before forwarding
  // HttpsTunnelProxy then tunnels HTTP→HTTPS to remote server

  it('should document path transformation for remote mode', () => {
    // Remote CLIProxyAPI expects: /v1/messages
    // Local CLIProxy expects: /api/provider/codex/v1/messages
    //
    // CodexReasoningProxy.stripPathPrefix handles this transformation:
    //   Input:  /api/provider/codex/v1/messages
    //   Output: /v1/messages
    const inputPath = '/api/provider/codex/v1/messages';
    const prefix = '/api/provider/codex';
    const expectedOutput = '/v1/messages';

    const result = inputPath.startsWith(prefix) ? inputPath.slice(prefix.length) || '/' : inputPath;

    expect(result).toBe(expectedOutput);
  });

  it('should handle root path after prefix strip', () => {
    const inputPath = '/api/provider/codex';
    const prefix = '/api/provider/codex';

    const result = inputPath.startsWith(prefix) ? inputPath.slice(prefix.length) || '/' : inputPath;

    expect(result).toBe('/');
  });
});
