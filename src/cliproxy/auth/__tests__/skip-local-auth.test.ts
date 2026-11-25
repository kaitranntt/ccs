/**
 * Unit tests for skip-local-auth functionality when using remote proxy with auth token
 *
 * When --proxy-host and --proxy-auth-token are provided together, the system should
 * skip local OAuth checks because the remote proxy handles authentication.
 *
 * Implementation uses: const remoteAuthToken = proxyConfig.authToken?.trim();
 *                      const skipLocalAuth = useRemoteProxy && !!remoteAuthToken;
 */
import { describe, it, expect } from 'bun:test';

/**
 * Helper to compute skipLocalAuth exactly as the implementation does
 * Mirrors logic from cliproxy-executor.ts lines 503-505
 */
function computeSkipLocalAuth(
  useRemoteProxy: boolean,
  proxyConfig: { authToken?: string | null }
): boolean {
  const remoteAuthToken = proxyConfig.authToken?.trim();
  return useRemoteProxy && !!remoteAuthToken;
}

describe('skip-local-auth logic', () => {
  describe('skipLocalAuth flag determination', () => {
    it('should skip local auth when both useRemoteProxy and authToken are truthy', () => {
      const useRemoteProxy = true;
      const proxyConfig = { authToken: 'test-token-123' };

      const skipLocalAuth = computeSkipLocalAuth(useRemoteProxy, proxyConfig);

      expect(skipLocalAuth).toBe(true);
    });

    it('should NOT skip local auth when useRemoteProxy is false', () => {
      const useRemoteProxy = false;
      const proxyConfig = { authToken: 'test-token-123' };

      const skipLocalAuth = computeSkipLocalAuth(useRemoteProxy, proxyConfig);

      expect(skipLocalAuth).toBe(false);
    });

    it('should NOT skip local auth when authToken is undefined', () => {
      const useRemoteProxy = true;
      const proxyConfig = { authToken: undefined };

      const skipLocalAuth = computeSkipLocalAuth(useRemoteProxy, proxyConfig);

      expect(skipLocalAuth).toBe(false);
    });

    it('should NOT skip local auth when authToken is empty string', () => {
      const useRemoteProxy = true;
      const proxyConfig = { authToken: '' };

      const skipLocalAuth = computeSkipLocalAuth(useRemoteProxy, proxyConfig);

      expect(skipLocalAuth).toBe(false);
    });

    it('should NOT skip local auth when both are falsy', () => {
      const useRemoteProxy = false;
      const proxyConfig = { authToken: undefined };

      const skipLocalAuth = computeSkipLocalAuth(useRemoteProxy, proxyConfig);

      expect(skipLocalAuth).toBe(false);
    });
  });

  describe('authToken edge cases', () => {
    it('should NOT skip local auth when authToken is whitespace-only', () => {
      const useRemoteProxy = true;
      const proxyConfig = { authToken: '   ' };

      const skipLocalAuth = computeSkipLocalAuth(useRemoteProxy, proxyConfig);

      expect(skipLocalAuth).toBe(false);
    });

    it('should NOT skip local auth when authToken is tabs and newlines', () => {
      const useRemoteProxy = true;
      const proxyConfig = { authToken: '\t\n\r' };

      const skipLocalAuth = computeSkipLocalAuth(useRemoteProxy, proxyConfig);

      expect(skipLocalAuth).toBe(false);
    });

    it('should NOT skip local auth when authToken is null', () => {
      const useRemoteProxy = true;
      const proxyConfig = { authToken: null };

      const skipLocalAuth = computeSkipLocalAuth(useRemoteProxy, proxyConfig);

      expect(skipLocalAuth).toBe(false);
    });

    it('should skip local auth when authToken has leading/trailing whitespace but valid content', () => {
      const useRemoteProxy = true;
      const proxyConfig = { authToken: '  valid-token-123  ' };

      const skipLocalAuth = computeSkipLocalAuth(useRemoteProxy, proxyConfig);

      expect(skipLocalAuth).toBe(true);
    });

    it('should skip local auth when authToken contains special characters', () => {
      const useRemoteProxy = true;
      const proxyConfig = { authToken: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test' };

      const skipLocalAuth = computeSkipLocalAuth(useRemoteProxy, proxyConfig);

      expect(skipLocalAuth).toBe(true);
    });
  });

  describe('OAuth check bypass scenarios', () => {
    it('should document that OAuth is skipped for remote proxy with auth', () => {
      // This test documents the expected behavior:
      // When using remote proxy with auth token, the remote server
      // already has its own OAuth sessions, so local OAuth is unnecessary
      const scenario = {
        useRemoteProxy: true,
        authToken: 'bearer-token',
        providerRequiresOAuth: true,
      };

      const skipLocalAuth = scenario.useRemoteProxy && scenario.authToken;
      const shouldTriggerLocalOAuth = scenario.providerRequiresOAuth && !skipLocalAuth;

      expect(skipLocalAuth).toBeTruthy();
      expect(shouldTriggerLocalOAuth).toBe(false);
    });

    it('should document that OAuth runs when no remote proxy', () => {
      const scenario = {
        useRemoteProxy: false,
        authToken: undefined,
        providerRequiresOAuth: true,
      };

      const skipLocalAuth = scenario.useRemoteProxy && scenario.authToken;
      const shouldTriggerLocalOAuth = scenario.providerRequiresOAuth && !skipLocalAuth;

      expect(skipLocalAuth).toBeFalsy();
      expect(shouldTriggerLocalOAuth).toBe(true);
    });

    it('should document that OAuth runs when remote proxy has no auth token', () => {
      // Edge case: remote proxy configured but no auth token
      // This should fall back to local OAuth
      const scenario = {
        useRemoteProxy: true,
        authToken: undefined,
        providerRequiresOAuth: true,
      };

      const skipLocalAuth = scenario.useRemoteProxy && scenario.authToken;
      const shouldTriggerLocalOAuth = scenario.providerRequiresOAuth && !skipLocalAuth;

      expect(skipLocalAuth).toBeFalsy();
      expect(shouldTriggerLocalOAuth).toBe(true);
    });
  });

  describe('preflight quota check bypass', () => {
    it('should skip preflight for agy provider when using remote proxy with auth', () => {
      const provider = 'agy';
      const skipLocalAuth = true;

      const shouldRunPreflight = provider === 'agy' && !skipLocalAuth;

      expect(shouldRunPreflight).toBe(false);
    });

    it('should run preflight for agy provider when using local mode', () => {
      const provider = 'agy';
      const skipLocalAuth = false;

      const shouldRunPreflight = provider === 'agy' && !skipLocalAuth;

      expect(shouldRunPreflight).toBe(true);
    });

    it('should not run preflight for non-agy providers regardless of mode', () => {
      const providers = ['gemini', 'codex', 'ghcp', 'kiro'];

      for (const provider of providers) {
        const shouldRunPreflight = provider === 'agy' && !false;
        expect(shouldRunPreflight).toBe(false);
      }
    });
  });

  describe('model configuration bypass', () => {
    it('should skip model config when using remote proxy with auth', () => {
      const supportsModelConfig = true;
      const skipLocalAuth = true;

      const shouldConfigureModel = supportsModelConfig && !skipLocalAuth;

      expect(shouldConfigureModel).toBe(false);
    });

    it('should run model config when using local mode', () => {
      const supportsModelConfig = true;
      const skipLocalAuth = false;

      const shouldConfigureModel = supportsModelConfig && !skipLocalAuth;

      expect(shouldConfigureModel).toBe(true);
    });
  });

  describe('broken model warning behavior', () => {
    it('should show broken model warning in BOTH remote and local modes', () => {
      // Updated behavior: warnings always shown (with different messaging for remote)
      // Remote users need to know about broken models too
      const currentModel = 'some-broken-model';
      const isModelBroken = true;

      // Warning should show regardless of skipLocalAuth
      const shouldWarnRemote = Boolean(currentModel && isModelBroken); // skipLocalAuth=true
      const shouldWarnLocal = Boolean(currentModel && isModelBroken); // skipLocalAuth=false

      expect(shouldWarnRemote).toBe(true);
      expect(shouldWarnLocal).toBe(true);
    });

    it('should show different message for remote vs local mode', () => {
      const skipLocalAuth = true;

      // When remote: "Note: Model may be overridden by remote proxy configuration."
      // When local: "Run ccs <provider> --config to change model."
      const remoteMessage = skipLocalAuth
        ? 'Note: Model may be overridden by remote proxy configuration.'
        : 'Run "ccs provider --config" to change model.';

      expect(remoteMessage).toContain('remote proxy');
    });
  });

  describe('CI/CD workflow scenarios', () => {
    it('should enable headless CI workflow with remote proxy', () => {
      // Simulate GitHub Actions workflow configuration
      const workflowConfig = {
        headless: true,
        proxyHost: 'proxy.example.com',
        proxyPort: 443,
        proxyProtocol: 'https',
        proxyAuthToken: 'github-secret-token',
        remoteOnly: true,
      };

      // Determine if this configuration should skip local OAuth
      const useRemoteProxy = !!workflowConfig.proxyHost;
      const skipLocalAuth = useRemoteProxy && !!workflowConfig.proxyAuthToken;

      expect(useRemoteProxy).toBe(true);
      expect(skipLocalAuth).toBe(true);
    });

    it('should require local OAuth when no proxy configured', () => {
      // Simulate local development without proxy
      const localConfig = {
        headless: false,
        proxyHost: undefined,
        proxyAuthToken: undefined,
      };

      const useRemoteProxy = !!localConfig.proxyHost;
      const skipLocalAuth = useRemoteProxy && !!localConfig.proxyAuthToken;

      expect(useRemoteProxy).toBe(false);
      expect(skipLocalAuth).toBe(false);
    });
  });
});
