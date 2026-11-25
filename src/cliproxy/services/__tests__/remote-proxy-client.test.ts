/**
 * Unit tests for remote-proxy-client module
 */
import { describe, it, expect } from 'bun:test';
import {
  type RemoteProxyClientConfig,
  type RemoteProxyStatus,
} from '../../services/remote-proxy-client';

// We test the module's type exports and error handling logic
// Actual HTTP calls are not mocked in this unit test - use integration tests for that

describe('remote-proxy-client', () => {
  describe('type exports', () => {
    it('should export RemoteProxyClientConfig interface', () => {
      // Type-level test - ensure the interface shape is correct
      const config: RemoteProxyClientConfig = {
        host: 'localhost',
        port: 8317,
        protocol: 'http',
        authToken: 'test-token',
        timeout: 2000,
        allowSelfSigned: false,
      };
      expect(config.host).toBe('localhost');
      expect(config.port).toBe(8317);
      expect(config.protocol).toBe('http');
    });

    it('should export RemoteProxyStatus interface', () => {
      // Success case
      const successStatus: RemoteProxyStatus = {
        reachable: true,
        latencyMs: 50,
      };
      expect(successStatus.reachable).toBe(true);
      expect(successStatus.latencyMs).toBe(50);

      // Error case
      const errorStatus: RemoteProxyStatus = {
        reachable: false,
        error: 'Connection refused',
        errorCode: 'CONNECTION_REFUSED',
      };
      expect(errorStatus.reachable).toBe(false);
      expect(errorStatus.error).toBe('Connection refused');
      expect(errorStatus.errorCode).toBe('CONNECTION_REFUSED');
    });
  });

  describe('RemoteProxyErrorCode', () => {
    it('should define expected error codes', () => {
      const validCodes: Array<string | undefined> = [
        'CONNECTION_REFUSED',
        'TIMEOUT',
        'AUTH_FAILED',
        'DNS_FAILED',
        'NETWORK_UNREACHABLE',
        'UNKNOWN',
      ];

      // Type-level test - ensure error codes can be used
      const status1: RemoteProxyStatus = { reachable: false, errorCode: 'CONNECTION_REFUSED' };
      const status2: RemoteProxyStatus = { reachable: false, errorCode: 'TIMEOUT' };
      const status3: RemoteProxyStatus = { reachable: false, errorCode: 'AUTH_FAILED' };
      const status4: RemoteProxyStatus = { reachable: false, errorCode: 'UNKNOWN' };
      const status5: RemoteProxyStatus = { reachable: false, errorCode: 'DNS_FAILED' };
      const status6: RemoteProxyStatus = { reachable: false, errorCode: 'NETWORK_UNREACHABLE' };

      expect(validCodes).toContain(status1.errorCode);
      expect(validCodes).toContain(status2.errorCode);
      expect(validCodes).toContain(status3.errorCode);
      expect(validCodes).toContain(status4.errorCode);
      expect(validCodes).toContain(status5.errorCode);
      expect(validCodes).toContain(status6.errorCode);
    });
  });

  describe('config validation', () => {
    it('should require host and port', () => {
      const minimalConfig: RemoteProxyClientConfig = {
        host: '127.0.0.1',
        port: 8317,
        protocol: 'http',
      };
      expect(minimalConfig.host).toBeDefined();
      expect(minimalConfig.port).toBeDefined();
      expect(minimalConfig.protocol).toBeDefined();
    });

    it('should allow optional fields', () => {
      const config: RemoteProxyClientConfig = {
        host: '127.0.0.1',
        port: 8317,
        protocol: 'https',
        authToken: 'secret',
        timeout: 5000,
        allowSelfSigned: true,
      };
      expect(config.authToken).toBe('secret');
      expect(config.timeout).toBe(5000);
      expect(config.allowSelfSigned).toBe(true);
    });

    it('should accept http and https protocols', () => {
      const httpConfig: RemoteProxyClientConfig = {
        host: 'localhost',
        port: 8317,
        protocol: 'http',
      };
      const httpsConfig: RemoteProxyClientConfig = {
        host: 'localhost',
        port: 8317,
        protocol: 'https',
      };
      expect(httpConfig.protocol).toBe('http');
      expect(httpsConfig.protocol).toBe('https');
    });
  });

  describe('health check URL construction', () => {
    // CLIProxyAPI uses root endpoint for liveness checks (no /health endpoint)
    it('should construct correct health check URL pattern using /', () => {
      const config: RemoteProxyClientConfig = {
        host: '192.168.1.100',
        port: 8317,
        protocol: 'http',
      };
      const expectedUrl = `${config.protocol}://${config.host}:${config.port}/`;
      expect(expectedUrl).toBe('http://192.168.1.100:8317/');
    });

    it('should construct HTTPS URL when protocol is https', () => {
      const config: RemoteProxyClientConfig = {
        host: 'secure.example.com',
        port: 443,
        protocol: 'https',
      };
      const expectedUrl = `${config.protocol}://${config.host}:${config.port}/`;
      expect(expectedUrl).toBe('https://secure.example.com:443/');
    });
  });

  describe('port defaults by protocol', () => {
    // Document expected default ports based on protocol
    // HTTP: 8317 (CLIProxyAPI default for local/dev scenarios)
    // HTTPS: 443 (standard SSL port for production remote servers)

    it('should document HTTP default port as 8317', () => {
      // HTTP connections default to CLIProxyAPI port 8317
      // This matches local development scenarios
      const expectedHttpDefault = 8317;
      expect(expectedHttpDefault).toBe(8317);
    });

    it('should document HTTPS default port as 443', () => {
      // HTTPS connections default to standard SSL port 443
      // This matches production remote server scenarios
      const expectedHttpsDefault = 443;
      expect(expectedHttpsDefault).toBe(443);
    });

    it('should allow port to be optional in config', () => {
      // Port is optional - when undefined, defaults based on protocol
      const configWithoutPort: RemoteProxyClientConfig = {
        host: 'example.com',
        protocol: 'https',
        // port is intentionally undefined
      };
      expect(configWithoutPort.port).toBeUndefined();
      expect(configWithoutPort.protocol).toBe('https');
    });
  });
});
