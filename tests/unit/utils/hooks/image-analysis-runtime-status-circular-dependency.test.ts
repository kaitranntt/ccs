import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'fs';
import { dirname } from 'path';
import type { ImageAnalysisStatus } from '../../../../src/utils/hooks/image-analysis-backend-resolver';
import type { AuthStatus } from '../../../../src/cliproxy/auth/auth-handler';
import {
  ModuleKind,
  ScriptTarget,
  transpileModule,
  type CompilerOptions,
} from 'typescript';

function createStatus(overrides: Partial<ImageAnalysisStatus> = {}): ImageAnalysisStatus {
  return {
    enabled: true,
    supported: true,
    status: 'active',
    backendId: 'ghcp',
    backendDisplayName: 'GitHub Copilot (OAuth)',
    model: 'claude-haiku-4.5',
    resolutionSource: 'profile-backend',
    reason: null,
    shouldPersistHook: true,
    persistencePath: '/tmp/orq.settings.json',
    runtimePath: '/api/provider/ghcp',
    usesCurrentTarget: true,
    usesCurrentAuthToken: true,
    hookInstalled: true,
    sharedHookInstalled: true,
    authReadiness: 'unknown',
    authProvider: 'ghcp',
    authDisplayName: 'GitHub Copilot (OAuth)',
    authReason: 'Auth readiness has not been verified yet.',
    proxyReadiness: 'unknown',
    proxyReason: 'CLIProxy runtime readiness has not been verified yet.',
    effectiveRuntimeMode: 'native-read',
    effectiveRuntimeReason: null,
    profileModel: 'claude-haiku-4.5',
    nativeReadPreference: false,
    nativeImageCapable: true,
    nativeImageReason: 'claude-haiku-4.5 can read images natively.',
    ...overrides,
  };
}

describe('image-analysis-runtime-status circular dependency regression', () => {
  it('reads auth deps from the CommonJS module object at call time', async () => {
    const authHandlerModule: {
      initializeAccounts: undefined | (() => void);
      getAuthStatus: undefined | ((provider: 'ghcp') => AuthStatus);
    } = {
      initializeAccounts: undefined,
      getAuthStatus: undefined,
    };

    const sourcePath = new URL(
      '../../../../src/utils/hooks/image-analysis-runtime-status.ts',
      import.meta.url
    );
    const source = readFileSync(sourcePath, 'utf8');
    const compilerOptions: CompilerOptions = {
      module: ModuleKind.CommonJS,
      target: ScriptTarget.ES2020,
      esModuleInterop: true,
    };
    const transpiled = transpileModule(source, { compilerOptions }).outputText;

    const module = { exports: {} as Record<string, unknown> };
    const requireMap: Record<string, unknown> = {
      '../../cliproxy/auth/auth-handler': authHandlerModule,
      '../../cliproxy/services/remote-proxy-client': {
        checkRemoteProxy: async () => ({ reachable: false, error: 'not-used' }),
      },
      '../../cliproxy/services/remote-auth-fetcher': {
        fetchRemoteAuthStatus: async () => [],
      },
      '../../cliproxy/proxy/proxy-target-resolver': {
        getProxyTarget: () => ({
          host: '127.0.0.1',
          port: 8317,
          protocol: 'http',
          isRemote: false,
        }),
      },
      '../../cliproxy/provider-capabilities': {
        getProviderDisplayName: () => 'GitHub Copilot (OAuth)',
        isCLIProxyProvider: () => true,
      },
      '../../cliproxy/services/stats-fetcher': {
        isCliproxyRunning: async () => true,
      },
      '../../config/unified-config-types': {},
      '../../config/config-loader-facade': {
        getImageAnalysisConfig: () => ({
          enabled: true,
          timeout: 60,
          provider_models: { ghcp: 'claude-haiku-4.5' },
          fallback_backend: 'ghcp',
          profile_backends: {},
        }),
      },
      './image-analysis-backend-resolver': {
        resolveImageAnalysisStatus: () => createStatus(),
      },
    };

    const compiledModule = new Function(
      'exports',
      'require',
      'module',
      '__filename',
      '__dirname',
      transpiled
    );
    compiledModule(
      module.exports,
      (specifier: string) => {
        const dependency = requireMap[specifier];
        if (!dependency) {
          throw new Error(`Unexpected dependency: ${specifier}`);
        }
        return dependency;
      },
      module,
      sourcePath.pathname,
      dirname(sourcePath.pathname)
    );

    authHandlerModule.initializeAccounts = () => {};
    authHandlerModule.getAuthStatus = () => ({
      provider: 'ghcp',
      authenticated: true,
      tokenDir: '/tmp/auth',
      tokenFiles: ['github-copilot-test.json'],
      accounts: [],
      defaultAccount: undefined,
    });

    const { hydrateImageAnalysisRuntimeStatus } = module.exports as {
      hydrateImageAnalysisRuntimeStatus: (
        baseStatus: ImageAnalysisStatus,
        deps?: Record<string, unknown>
      ) => Promise<ImageAnalysisStatus>;
    };
    const status = await hydrateImageAnalysisRuntimeStatus(createStatus(), {});

    expect(status.authReadiness).toBe('ready');
    expect(status.proxyReadiness).toBe('ready');
    expect(status.effectiveRuntimeMode).toBe('cliproxy-image-analysis');
  });
});
