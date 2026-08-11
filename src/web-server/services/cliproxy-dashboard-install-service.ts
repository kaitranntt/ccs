import { installCliproxyVersion, resolveLocalBackend } from '../../cliproxy/binary-manager';
import { resolveLifecyclePort } from '../../cliproxy/config/port-manager';
import { ensureCliproxyService, type ServiceStartResult } from '../../cliproxy/service-manager';
import { getProxyStatus as getProxyProcessStatus } from '../../cliproxy/session-tracker';
import { isCliproxyRunning } from '../../cliproxy/services/stats-fetcher';
import type { CLIProxyBackend } from '../../cliproxy/types';
import { ProxyError } from '../../errors/error-types';
import {
  isRunningUnderSupervisord,
  restartCliproxyViaSupervisord,
} from '../../docker/supervisord-lifecycle';

interface ProxyStatusLike {
  running: boolean;
}

interface InstallDashboardCliproxyVersionDeps {
  getProxyStatus: () => ProxyStatusLike;
  isCliproxyRunning: () => Promise<boolean>;
  installCliproxyVersion: (
    version: string,
    verbose?: boolean,
    backend?: CLIProxyBackend
  ) => Promise<void>;
  ensureCliproxyService: () => Promise<ServiceStartResult>;
  isRunningUnderSupervisord?: () => boolean;
  restartCliproxyViaSupervisord?: typeof restartCliproxyViaSupervisord;
}

const defaultDeps: InstallDashboardCliproxyVersionDeps = {
  getProxyStatus: () => getProxyProcessStatus(resolveLifecyclePort()),
  isCliproxyRunning: () => isCliproxyRunning(resolveLifecyclePort()),
  installCliproxyVersion,
  ensureCliproxyService: () => ensureCliproxyService(resolveLifecyclePort()),
};

export interface DashboardCliproxyInstallResult {
  success: boolean;
  restarted: boolean;
  port?: number;
  message: string;
  error?: string;
}

async function wasProxyRunning(deps: InstallDashboardCliproxyVersionDeps): Promise<boolean> {
  const status = deps.getProxyStatus();
  if (status.running) {
    return true;
  }

  return deps.isCliproxyRunning();
}

async function restoreProxyService(
  deps: InstallDashboardCliproxyVersionDeps
): Promise<ServiceStartResult> {
  const underSupervisord = deps.isRunningUnderSupervisord?.() ?? isRunningUnderSupervisord();
  if (underSupervisord) {
    const restart = deps.restartCliproxyViaSupervisord?.() ?? restartCliproxyViaSupervisord();
    return {
      started: restart.success,
      alreadyRunning: false,
      port: restart.port ?? resolveLifecyclePort(),
      error: restart.error,
    };
  }

  return deps.ensureCliproxyService();
}

export async function installDashboardCliproxyVersion(
  version: string,
  backend: CLIProxyBackend,
  deps: InstallDashboardCliproxyVersionDeps = defaultDeps
): Promise<DashboardCliproxyInstallResult> {
  const effectiveBackend = resolveLocalBackend(backend, { notifyOnPlus: true });
  const backendLabel = effectiveBackend === 'plus' ? 'CLIProxy Plus' : 'CLIProxy';
  const shouldRestoreService = await wasProxyRunning(deps);

  // The installer owns the stop-and-replace lifecycle, including best-effort
  // shutdown for tracked and untracked proxies before swapping the binary.
  try {
    await deps.installCliproxyVersion(version, true, effectiveBackend);
  } catch (error) {
    if (shouldRestoreService) {
      const restoreResult = await restoreProxyService(deps);
      if (!restoreResult.started && !restoreResult.alreadyRunning) {
        const installMessage = error instanceof Error ? error.message : String(error);
        throw new ProxyError(
          `${installMessage}; previous ${backendLabel} service also failed to restart: ${restoreResult.error ?? 'unknown restart error'}`,
          restoreResult.port
        );
      }
    }
    throw error;
  }

  if (!shouldRestoreService) {
    return {
      success: true,
      restarted: false,
      message: `Successfully installed ${backendLabel} v${version}`,
    };
  }

  // In Docker, supervisord owns process lifecycle — delegate restart to it
  const startResult = await restoreProxyService(deps);
  if (!startResult.started && !startResult.alreadyRunning) {
    return {
      success: false,
      restarted: false,
      error: startResult.error || `Installed ${backendLabel} v${version}, but restart failed`,
      message: `Installed ${backendLabel} v${version}, but failed to restart it`,
    };
  }

  return {
    success: true,
    restarted: true,
    port: startResult.port,
    message: `Successfully installed ${backendLabel} v${version} and restarted it on port ${startResult.port}`,
  };
}
