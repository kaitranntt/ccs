import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as childProcess from 'child_process';
import { ConfigError } from '../../../../errors/error-types';
import type { ProxyTarget } from '../../../proxy/proxy-target-resolver';

const scenario = process.env['GEMINI_GUIDANCE_SCENARIO'];
if (!scenario) {
  throw new ConfigError('GEMINI_GUIDANCE_SCENARIO is required');
}

let activeBackend: 'original' | 'plus' = 'original';
let headlessEnvironment = false;
const proxyTarget: ProxyTarget = {
  host: '127.0.0.1',
  port: 8317,
  protocol: 'http',
  isRemote: false,
};

const ensureBinaryMock = mock(async () => '/tmp/fake-cli-proxy-api');
const generateConfigMock = mock(() => '/tmp/cliproxy-config.yaml');
const preflightCheckMock = mock(async () => ({
  ready: true,
  checks: [],
  firewallWarning: false,
  firewallFixCommand: undefined,
}));

const originalIsTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
const originalFetch = globalThis.fetch;

function restoreIsTTY(): void {
  if (originalIsTTY) {
    Object.defineProperty(process.stdin, 'isTTY', originalIsTTY);
  }
}

function getAdvertisedHelpText(localScenario: string): string {
  switch (localScenario) {
    case 'original-headless-auto-paste-supported':
      return '  -login\n';
    case 'original-direct-unsupported':
    case 'original-headless-auto-paste-unsupported':
      return '  -codex-login\n';
    default:
      return '';
  }
}

async function registerScenarioMocks(): Promise<void> {
  const [
    realConfigGenerator,
    realAccountManager,
    realTokenManager,
    realEnvironmentDetector,
    realProxyTargetResolver,
    realAccountSafety,
    realAccountSafetyCrossLane,
    realPoolOptInPrompt,
    realOAuthPortDiagnostics,
  ] = await Promise.all([
    import('../../../config/config-generator'),
    import('../../../accounts/account-manager'),
    import('../../token-manager'),
    import('../../environment-detector'),
    import('../../../proxy/proxy-target-resolver'),
    import('../../../accounts/account-safety'),
    import('../../../accounts/account-safety-cross-lane'),
    import('../../../routing/pool-opt-in-prompt'),
    import('../../../../management/oauth-port-diagnostics'),
  ]);

  mock.module('../../../binary-manager', () => ({
    ensureCLIProxyBinary: ensureBinaryMock,
    getConfiguredBackend: () => activeBackend,
  }));

  mock.module('../../../config/config-generator', () => ({
    ...realConfigGenerator,
    generateConfig: generateConfigMock,
  }));

  mock.module('../../../../management/oauth-port-diagnostics', () => ({
    ...realOAuthPortDiagnostics,
    enhancedPreflightOAuthCheck: preflightCheckMock,
    OAUTH_CALLBACK_PORTS: { gemini: 8085 },
  }));

  mock.module('../../environment-detector', () => ({
    ...realEnvironmentDetector,
    isHeadlessEnvironment: () => headlessEnvironment,
    killProcessOnPort: () => false,
    showStep: () => {},
  }));

  mock.module('../../../proxy/proxy-target-resolver', () => ({
    ...realProxyTargetResolver,
    getProxyTarget: () => proxyTarget,
    buildProxyUrl: (target: ProxyTarget, endpointPath: string) =>
      `${target.protocol}://${target.host}:${target.port}${
        endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`
      }`,
    buildManagementHeaders: () => ({}),
  }));

  mock.module('../../../accounts/account-manager', () => ({
    ...realAccountManager,
    getProviderAccounts: () => [],
    getDefaultAccount: () => null,
    touchAccount: () => undefined,
    hasAccountNameConflict: () => false,
    findAccountNameMatch: () => null,
    PROVIDERS_WITHOUT_EMAIL: [],
    validateNickname: () => null,
  }));

  mock.module('../../token-manager', () => ({
    ...realTokenManager,
    getProviderTokenDir: () => '/tmp/ccs-gemini-auth-tests',
    isAuthenticated: () => false,
    listProviderTokenSnapshots: () => [],
    findNewTokenSnapshotForAuthAttempt: () => null,
    registerAccountFromToken: () => null,
  }));

  mock.module('../../../accounts/account-safety', () => ({
    ...realAccountSafety,
    checkNewAccountConflict: () => null,
    warnNewAccountConflict: () => undefined,
    warnOAuthBanRisk: () => undefined,
    warnPossible403Ban: () => undefined,
  }));

  mock.module('../../../accounts/account-safety-cross-lane', () => ({
    ...realAccountSafetyCrossLane,
    checkCrossLaneEmailOverlap: () => null,
  }));

  mock.module('../../../routing/pool-opt-in-prompt', () => ({
    ...realPoolOptInPrompt,
    maybeOfferPoolRouting: async () => undefined,
  }));
}

afterEach(() => {
  delete process.env.CLIPROXY_GEMINI_OAUTH_CLIENT_ID;
  delete process.env.CLIPROXY_GEMINI_OAUTH_CLIENT_SECRET;
  restoreIsTTY();
  globalThis.fetch = originalFetch;
});

describe('child Gemini backend guidance scenario', () => {
  it(`validates ${scenario}`, async () => {
    if (scenario === 'plus-missing-env') {
      activeBackend = 'plus';
    } else if (
      scenario === 'original-headless-auto-paste-unsupported' ||
      scenario === 'original-headless-auto-paste-supported'
    ) {
      headlessEnvironment = true;
      Object.defineProperty(process.stdin, 'isTTY', {
        value: false,
        configurable: true,
      });
    }

    if (scenario === 'original-headless-auto-paste-supported') {
      globalThis.fetch = mock(async () => {
        throw new ConfigError('fetch failed');
      }) as unknown as typeof fetch;
    }

    const spawnSpy = spyOn(childProcess, 'spawnSync').mockReturnValue({
      status: 0,
      stdout: getAdvertisedHelpText(scenario),
      stderr: '',
      pid: 0,
      output: [],
      signal: null,
      error: undefined,
    });
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});

    try {
      await registerScenarioMocks();
      const { triggerOAuth } = await import(
        `../../oauth-handler?gemini-guidance-child=${Date.now()}`
      );
      const account = await triggerOAuth('gemini', {
        headless: scenario === 'original-direct-unsupported' ? false : undefined,
      });
      const output = logSpy.mock.calls.map(([message]) => String(message)).join('\n');

      expect(account).toBeNull();

      if (scenario === 'plus-missing-env') {
        expect(ensureBinaryMock).not.toHaveBeenCalled();
        expect(output).toContain('CLIPROXY_GEMINI_OAUTH_CLIENT_ID');
        expect(output).toContain('CLIPROXY_GEMINI_OAUTH_CLIENT_SECRET');
        expect(output).toContain(
          'Current `cliproxy.backend: original` releases do not advertise Gemini login'
        );
        expect(output).not.toContain('switch `cliproxy.backend` to `original` for Gemini');
        return;
      }

      expect(ensureBinaryMock).toHaveBeenCalledTimes(1);
      const firstEnsureBinaryCall = ensureBinaryMock.mock.calls.at(0) as unknown[] | undefined;
      expect(firstEnsureBinaryCall?.[1]).toEqual(
        expect.objectContaining({ backend: 'original', skipAutoUpdate: true })
      );

      if (scenario === 'original-headless-auto-paste-supported') {
        expect(output).not.toContain(
          'The active `cliproxy.backend: original` runtime cannot start Gemini OAuth from CCS'
        );
        expect(output).toContain('Starting Google Gemini OAuth (paste-callback mode)...');
        expect(output).toContain('Failed to start OAuth flow');
        return;
      }

      expect(output).toContain(
        'The active `cliproxy.backend: original` runtime cannot start Gemini OAuth from CCS'
      );
      expect(output).toContain('CLIPROXY_GEMINI_OAUTH_CLIENT_ID');
      expect(output).toContain('CLIPROXY_GEMINI_OAUTH_CLIENT_SECRET');
    } finally {
      spawnSpy.mockRestore();
      logSpy.mockRestore();
    }
  });
});
