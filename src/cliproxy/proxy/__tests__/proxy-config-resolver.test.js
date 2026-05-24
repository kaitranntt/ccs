/**
 * Unit tests for proxy-config-resolver module
 */
const { describe, it, expect, beforeEach, afterEach } = require('bun:test');

// Import from compiled dist
const {
  parseProxyFlags,
  getProxyEnvVars,
  resolveProxyConfig,
  hasProxyFlags,
  PROXY_CLI_FLAGS,
  PROXY_ENV_VARS,
} = require('../../../../dist/cliproxy/proxy/proxy-config-resolver');

describe('proxy-config-resolver', () => {
  describe('PROXY_CLI_FLAGS', () => {
    it('should define all expected proxy flags', () => {
      expect(PROXY_CLI_FLAGS).toContain('--proxy-host');
      expect(PROXY_CLI_FLAGS).toContain('--proxy-port');
      expect(PROXY_CLI_FLAGS).toContain('--proxy-protocol');
      expect(PROXY_CLI_FLAGS).toContain('--proxy-auth-token');
      expect(PROXY_CLI_FLAGS).toContain('--local-proxy');
      expect(PROXY_CLI_FLAGS).toContain('--remote-only');
    });
  });

  describe('PROXY_ENV_VARS', () => {
    it('should define all expected environment variable names', () => {
      expect(PROXY_ENV_VARS.host).toBe('CCS_PROXY_HOST');
      expect(PROXY_ENV_VARS.port).toBe('CCS_PROXY_PORT');
      expect(PROXY_ENV_VARS.protocol).toBe('CCS_PROXY_PROTOCOL');
      expect(PROXY_ENV_VARS.authToken).toBe('CCS_PROXY_AUTH_TOKEN');
      expect(PROXY_ENV_VARS.fallbackEnabled).toBe('CCS_PROXY_FALLBACK_ENABLED');
    });
  });

  describe('parseProxyFlags', () => {
    it('should parse --proxy-host flag', () => {
      const { flags, remainingArgs } = parseProxyFlags(['--proxy-host', '192.168.1.100']);
      expect(flags.host).toBe('192.168.1.100');
      expect(remainingArgs).toEqual([]);
    });

    it('should parse --proxy-port flag', () => {
      const { flags, remainingArgs } = parseProxyFlags(['--proxy-port', '9000']);
      expect(flags.port).toBe(9000);
      expect(remainingArgs).toEqual([]);
    });

    it('should parse --proxy-protocol flag', () => {
      const { flags } = parseProxyFlags(['--proxy-protocol', 'https']);
      expect(flags.protocol).toBe('https');
    });

    it('should parse --proxy-auth-token flag', () => {
      const { flags } = parseProxyFlags(['--proxy-auth-token', 'secret123']);
      expect(flags.authToken).toBe('secret123');
    });

    it('should parse --local-proxy boolean flag', () => {
      const { flags } = parseProxyFlags(['--local-proxy']);
      expect(flags.localProxy).toBe(true);
    });

    it('should parse --remote-only boolean flag', () => {
      const { flags } = parseProxyFlags(['--remote-only']);
      expect(flags.remoteOnly).toBe(true);
    });

    it('should preserve non-proxy args in remainingArgs', () => {
      const { flags, remainingArgs } = parseProxyFlags([
        '--verbose',
        '--proxy-host',
        'localhost',
        '--some-other-flag',
      ]);
      expect(flags.host).toBe('localhost');
      expect(remainingArgs).toEqual(['--verbose', '--some-other-flag']);
    });

    it('should handle mixed proxy and non-proxy args', () => {
      const { flags, remainingArgs } = parseProxyFlags([
        'arg1',
        '--proxy-port',
        '8080',
        'arg2',
        '--local-proxy',
        'arg3',
      ]);
      expect(flags.port).toBe(8080);
      expect(flags.localProxy).toBe(true);
      expect(remainingArgs).toEqual(['arg1', 'arg2', 'arg3']);
    });

    it('should ignore invalid port values', () => {
      const { flags } = parseProxyFlags(['--proxy-port', 'invalid']);
      expect(flags.port).toBeUndefined();
    });

    it('should ignore out-of-range port values', () => {
      const { flags: flags1 } = parseProxyFlags(['--proxy-port', '0']);
      expect(flags1.port).toBeUndefined();

      const { flags: flags2 } = parseProxyFlags(['--proxy-port', '70000']);
      expect(flags2.port).toBeUndefined();
    });

    it('should normalize protocol to lowercase', () => {
      const { flags } = parseProxyFlags(['--proxy-protocol', 'HTTPS']);
      expect(flags.protocol).toBe('https');
    });

    it('should ignore invalid protocol values', () => {
      const { flags } = parseProxyFlags(['--proxy-protocol', 'ftp']);
      expect(flags.protocol).toBeUndefined();
    });
  });

  describe('getProxyEnvVars', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      // Clear proxy env vars
      delete process.env.CCS_PROXY_HOST;
      delete process.env.CCS_PROXY_PORT;
      delete process.env.CCS_PROXY_PROTOCOL;
      delete process.env.CCS_PROXY_AUTH_TOKEN;
      delete process.env.CCS_PROXY_FALLBACK_ENABLED;
    });

    afterEach(() => {
      // Restore original env
      Object.keys(process.env).forEach((key) => {
        if (key.startsWith('CCS_PROXY_')) {
          delete process.env[key];
        }
      });
      Object.assign(process.env, originalEnv);
    });

    it('should return empty config when no env vars set', () => {
      const config = getProxyEnvVars();
      expect(config.host).toBeUndefined();
      expect(config.port).toBeUndefined();
      expect(config.protocol).toBeUndefined();
      expect(config.authToken).toBeUndefined();
      expect(config.fallbackEnabled).toBeUndefined();
    });

    it('should read CCS_PROXY_HOST', () => {
      process.env.CCS_PROXY_HOST = 'remote.example.com';
      const config = getProxyEnvVars();
      expect(config.host).toBe('remote.example.com');
    });

    it('should read and parse CCS_PROXY_PORT', () => {
      process.env.CCS_PROXY_PORT = '9000';
      const config = getProxyEnvVars();
      expect(config.port).toBe(9000);
    });

    it('should read CCS_PROXY_PROTOCOL', () => {
      process.env.CCS_PROXY_PROTOCOL = 'https';
      const config = getProxyEnvVars();
      expect(config.protocol).toBe('https');
    });

    it('should read CCS_PROXY_AUTH_TOKEN', () => {
      process.env.CCS_PROXY_AUTH_TOKEN = 'my-secret-token';
      const config = getProxyEnvVars();
      expect(config.authToken).toBe('my-secret-token');
    });

    it('should parse CCS_PROXY_FALLBACK_ENABLED as true', () => {
      process.env.CCS_PROXY_FALLBACK_ENABLED = '1';
      expect(getProxyEnvVars().fallbackEnabled).toBe(true);

      process.env.CCS_PROXY_FALLBACK_ENABLED = 'true';
      expect(getProxyEnvVars().fallbackEnabled).toBe(true);

      process.env.CCS_PROXY_FALLBACK_ENABLED = 'yes';
      expect(getProxyEnvVars().fallbackEnabled).toBe(true);
    });

    it('should parse CCS_PROXY_FALLBACK_ENABLED as false', () => {
      process.env.CCS_PROXY_FALLBACK_ENABLED = '0';
      expect(getProxyEnvVars().fallbackEnabled).toBe(false);

      process.env.CCS_PROXY_FALLBACK_ENABLED = 'false';
      expect(getProxyEnvVars().fallbackEnabled).toBe(false);

      process.env.CCS_PROXY_FALLBACK_ENABLED = 'no';
      expect(getProxyEnvVars().fallbackEnabled).toBe(false);
    });
  });

  describe('resolveProxyConfig', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      delete process.env.CCS_PROXY_HOST;
      delete process.env.CCS_PROXY_PORT;
      delete process.env.CCS_PROXY_PROTOCOL;
      delete process.env.CCS_PROXY_AUTH_TOKEN;
      delete process.env.CCS_PROXY_FALLBACK_ENABLED;
    });

    afterEach(() => {
      Object.keys(process.env).forEach((key) => {
        if (key.startsWith('CCS_PROXY_')) {
          delete process.env[key];
        }
      });
      Object.assign(process.env, originalEnv);
    });

    it('should return local mode by default', () => {
      const { config } = resolveProxyConfig([]);
      expect(config.mode).toBe('local');
      expect(config.port).toBe(8317); // Default CLIProxy port
      expect(config.fallbackEnabled).toBe(true);
    });

    it('should enable remote mode when --proxy-host is provided', () => {
      const { config } = resolveProxyConfig(['--proxy-host', '192.168.1.100']);
      expect(config.mode).toBe('remote');
      expect(config.host).toBe('192.168.1.100');
    });

    it('should enable remote mode when CCS_PROXY_HOST env is set', () => {
      process.env.CCS_PROXY_HOST = 'remote.example.com';
      const { config } = resolveProxyConfig([]);
      expect(config.mode).toBe('remote');
      expect(config.host).toBe('remote.example.com');
    });

    it('should prioritize CLI flags over ENV vars', () => {
      process.env.CCS_PROXY_HOST = 'env-host';
      process.env.CCS_PROXY_PORT = '9000';
      const { config } = resolveProxyConfig(['--proxy-host', 'cli-host', '--proxy-port', '8080']);
      expect(config.host).toBe('cli-host');
      expect(config.port).toBe(8080);
    });

    it('should force local mode with --local-proxy', () => {
      process.env.CCS_PROXY_HOST = 'remote.example.com';
      const { config } = resolveProxyConfig(['--local-proxy']);
      expect(config.mode).toBe('local');
      expect(config.forceLocal).toBe(true);
    });

    it('should set remoteOnly and disable fallback with --remote-only', () => {
      const { config } = resolveProxyConfig(['--proxy-host', 'remote', '--remote-only']);
      expect(config.remoteOnly).toBe(true);
      expect(config.fallbackEnabled).toBe(false);
    });

    // Tests for YAML enabled:false handling (Bug fix validation)
    describe('YAML remote.enabled handling', () => {
      it('should block remote mode when YAML remote.enabled is false', () => {
        const { config } = resolveProxyConfig([], {
          remote: { enabled: false, host: 'yaml-host.example.com' },
        });
        expect(config.mode).toBe('local');
        // Host from YAML should NOT be used when enabled: false
      });

      it('should allow remote mode when YAML remote.enabled is true', () => {
        const { config } = resolveProxyConfig([], {
          remote: { enabled: true, host: 'yaml-host.example.com' },
        });
        expect(config.mode).toBe('remote');
        expect(config.host).toBe('yaml-host.example.com');
      });

      it('should allow remote mode when YAML remote.enabled is undefined (backwards compat)', () => {
        const { config } = resolveProxyConfig([], {
          remote: { host: 'yaml-host.example.com' },
        });
        expect(config.mode).toBe('remote');
        expect(config.host).toBe('yaml-host.example.com');
      });

      it('should preserve YAML management key for remote mode', () => {
        const { config } = resolveProxyConfig([], {
          remote: {
            host: 'yaml-host.example.com',
            auth_token: 'remote-auth-token',
            management_key: 'remote-management-key',
          },
        });
        expect(config.mode).toBe('remote');
        expect(config.managementKey).toBe('remote-management-key');
      });

      it('should clear YAML management key when CLI overrides remote host', () => {
        const { config } = resolveProxyConfig(['--proxy-host', 'cli-host.example.com'], {
          remote: {
            host: 'yaml-host.example.com',
            auth_token: 'remote-auth-token',
            management_key: 'remote-management-key',
          },
        });
        expect(config.mode).toBe('remote');
        expect(config.host).toBe('cli-host.example.com');
        expect(config.managementKey).toBeUndefined();
      });

      it('should clear YAML management key when ENV overrides auth token', () => {
        process.env.CCS_PROXY_AUTH_TOKEN = 'env-auth-token';
        const { config } = resolveProxyConfig([], {
          remote: {
            host: 'yaml-host.example.com',
            auth_token: 'remote-auth-token',
            management_key: 'remote-management-key',
          },
        });
        expect(config.mode).toBe('remote');
        expect(config.authToken).toBe('env-auth-token');
        expect(config.managementKey).toBeUndefined();
      });

      it('should allow CLI --proxy-host to override YAML enabled:false', () => {
        const { config } = resolveProxyConfig(['--proxy-host', 'cli-host'], {
          remote: { enabled: false, host: 'yaml-host' },
        });
        expect(config.mode).toBe('remote');
        expect(config.host).toBe('cli-host');
      });

      it('should allow ENV CCS_PROXY_HOST to override YAML enabled:false', () => {
        process.env.CCS_PROXY_HOST = 'env-host';
        const { config } = resolveProxyConfig([], {
          remote: { enabled: false, host: 'yaml-host' },
        });
        expect(config.mode).toBe('remote');
        expect(config.host).toBe('env-host');
      });

      it('should force local mode with --local-proxy even when YAML enabled:true', () => {
        const { config } = resolveProxyConfig(['--local-proxy'], {
          remote: { enabled: true, host: 'yaml-host' },
        });
        expect(config.mode).toBe('local');
        expect(config.forceLocal).toBe(true);
      });
    });
  });

  describe('hasProxyFlags', () => {
    it('should return true when proxy flags are present', () => {
      expect(hasProxyFlags(['--proxy-host', 'localhost'])).toBe(true);
      expect(hasProxyFlags(['--proxy-port', '8080'])).toBe(true);
      expect(hasProxyFlags(['--local-proxy'])).toBe(true);
      expect(hasProxyFlags(['--remote-only'])).toBe(true);
    });

    it('should return false when no proxy flags are present', () => {
      expect(hasProxyFlags([])).toBe(false);
      expect(hasProxyFlags(['--verbose', '--help'])).toBe(false);
      expect(hasProxyFlags(['gemini', 'some-task'])).toBe(false);
    });
  });
});
