import {
  getAuthStatus,
  initializeAccounts,
  type AuthStatus,
} from '../../cliproxy/auth/auth-handler';
import {
  checkRemoteProxy,
  type RemoteProxyClientConfig,
  type RemoteProxyStatus,
} from '../../cliproxy/services/remote-proxy-client';
import {
  fetchRemoteAuthStatus,
  type RemoteAuthStatus,
} from '../../cliproxy/services/remote-auth-fetcher';
import { getProxyTarget, type ProxyTarget } from '../../cliproxy/proxy/proxy-target-resolver';
import { getProviderDisplayName, isCLIProxyProvider } from '../../cliproxy/provider-capabilities';
import { isCliproxyRunning } from '../../cliproxy/services/stats-fetcher';
import type { CLIProxyProvider } from '../../cliproxy/types';
import { getImageAnalysisConfig } from '../../config/config-loader-facade';
import { type ImageAnalysisConfig } from '../../config/unified-config-types';
import {
  resolveImageAnalysisStatus,
  type ImageAnalysisResolutionContext,
  type ImageAnalysisStatus,
} from './image-analysis-backend-resolver';

interface ImageAnalysisRuntimeStatusDeps {
  checkRemoteProxy: (config: RemoteProxyClientConfig) => Promise<RemoteProxyStatus>;
  fetchRemoteAuthStatus: (target: ProxyTarget) => Promise<RemoteAuthStatus[]>;
  getAuthStatus: (provider: CLIProxyProvider) => AuthStatus;
  getProxyTarget: () => ProxyTarget;
  initializeAccounts: () => void;
  isCliproxyRunning: () => Promise<boolean>;
}

const defaultDeps: ImageAnalysisRuntimeStatusDeps = {
  checkRemoteProxy: (...args) => checkRemoteProxy(...args),
  fetchRemoteAuthStatus: (...args) => fetchRemoteAuthStatus(...args),
  getAuthStatus: (...args) => getAuthStatus(...args),
  getProxyTarget: () => getProxyTarget(),
  initializeAccounts: () => initializeAccounts(),
  isCliproxyRunning: () => isCliproxyRunning(),
};

function mergeDefinedDeps<T extends object>(defaults: T, overrides: Partial<T>): T {
  const definedOverrides = Object.fromEntries(
    Object.entries(overrides as Record<string, unknown>).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
  return { ...defaults, ...definedOverrides };
}

async function resolveAuthReadiness(
  status: ImageAnalysisStatus,
  deps: ImageAnalysisRuntimeStatusDeps
): Promise<
  Pick<ImageAnalysisStatus, 'authReadiness' | 'authProvider' | 'authDisplayName' | 'authReason'>
> {
  if (!status.backendId || !status.model || !isCLIProxyProvider(status.backendId)) {
    return {
      authReadiness: 'not-needed',
      authProvider: null,
      authDisplayName: null,
      authReason: null,
    };
  }

  const authProvider = status.backendId;
  const authDisplayName = getProviderDisplayName(authProvider);

  try {
    let authenticated = false;
    const target = deps.getProxyTarget();
    if (target.isRemote) {
      const remoteStatuses = await deps.fetchRemoteAuthStatus(target);
      authenticated = remoteStatuses.some(
        (entry) => entry.provider === authProvider && entry.authenticated
      );
    } else {
      deps.initializeAccounts();
      authenticated = deps.getAuthStatus(authProvider).authenticated;
    }

    return {
      authReadiness: authenticated ? 'ready' : 'missing',
      authProvider,
      authDisplayName,
      authReason: authenticated
        ? null
        : `${authDisplayName} auth is missing. Run "ccs ${authProvider} --auth" to enable image analysis.`,
    };
  } catch (error) {
    return {
      authReadiness: 'unknown',
      authProvider,
      authDisplayName,
      authReason: `CCS could not verify ${authDisplayName} auth readiness: ${(error as Error).message}`,
    };
  }
}

async function resolveProxyReadiness(
  status: ImageAnalysisStatus,
  deps: ImageAnalysisRuntimeStatusDeps
): Promise<Pick<ImageAnalysisStatus, 'proxyReadiness' | 'proxyReason'>> {
  if (!status.backendId || !status.model) {
    return {
      proxyReadiness: 'not-needed',
      proxyReason: null,
    };
  }

  const target = deps.getProxyTarget();
  if (target.isRemote) {
    const remoteStatus = await deps.checkRemoteProxy({
      host: target.host,
      port: target.port,
      protocol: target.protocol,
      authToken: target.authToken,
      allowSelfSigned: target.allowSelfSigned,
    });

    return {
      proxyReadiness: remoteStatus.reachable ? 'remote' : 'unavailable',
      proxyReason: remoteStatus.reachable
        ? `Remote CLIProxy target ${target.host}:${target.port} is reachable.`
        : remoteStatus.error ||
          `Remote CLIProxy target ${target.host}:${target.port} is unreachable.`,
    };
  }

  const reachable = await deps.isCliproxyRunning();
  return {
    proxyReadiness: reachable ? 'ready' : 'stopped',
    proxyReason: reachable
      ? 'Local CLIProxy service is reachable.'
      : 'Local CLIProxy service is idle. CCS will start it automatically when image analysis is needed.',
  };
}

function resolveEffectiveRuntime(
  status: ImageAnalysisStatus
): Pick<ImageAnalysisStatus, 'effectiveRuntimeMode' | 'effectiveRuntimeReason'> {
  if (!status.enabled || !status.backendId || !status.model) {
    return {
      effectiveRuntimeMode: 'native-read',
      effectiveRuntimeReason: status.reason,
    };
  }

  if (status.authReadiness === 'missing' || status.authReadiness === 'unknown') {
    return {
      effectiveRuntimeMode: 'native-read',
      effectiveRuntimeReason: status.authReason,
    };
  }

  if (status.proxyReadiness === 'unavailable' || status.proxyReadiness === 'unknown') {
    return {
      effectiveRuntimeMode: 'native-read',
      effectiveRuntimeReason: status.proxyReason,
    };
  }

  return {
    effectiveRuntimeMode: 'cliproxy-image-analysis',
    effectiveRuntimeReason:
      status.status === 'attention' || status.status === 'hook-missing' ? status.reason : null,
  };
}

export async function hydrateImageAnalysisRuntimeStatus(
  baseStatus: ImageAnalysisStatus,
  deps: Partial<ImageAnalysisRuntimeStatusDeps> = {}
): Promise<ImageAnalysisStatus> {
  const resolvedDeps = mergeDefinedDeps(defaultDeps, deps);
  const authStatus = await resolveAuthReadiness(baseStatus, resolvedDeps);
  const proxyStatus = await resolveProxyReadiness(baseStatus, resolvedDeps);
  const mergedStatus = {
    ...baseStatus,
    ...authStatus,
    ...proxyStatus,
  };

  return {
    ...mergedStatus,
    ...resolveEffectiveRuntime(mergedStatus),
  };
}

export async function resolveImageAnalysisRuntimeStatus(
  context: ImageAnalysisResolutionContext,
  config?: ImageAnalysisConfig,
  deps: Partial<ImageAnalysisRuntimeStatusDeps> = {}
): Promise<ImageAnalysisStatus> {
  // Fall back to the user's saved image_analysis config, not the built-in
  // constant. Launch paths call this without an explicit config, and the
  // constant carries empty profile_backends plus a gemini fallback_backend,
  // so user mappings were dropped and every profile resolved to gemini.
  const resolvedConfig = config ?? getImageAnalysisConfig();
  const baseStatus = resolveImageAnalysisStatus(context, resolvedConfig);
  return hydrateImageAnalysisRuntimeStatus(baseStatus, deps);
}
