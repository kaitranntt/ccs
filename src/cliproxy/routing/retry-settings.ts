import { regenerateConfig } from '../config/generator';
import { getAuthDir, getConfigPathForPort } from '../config/path-resolver';
import { loadOrCreateUnifiedConfig, mutateConfig } from '../../config/config-loader-facade';
import type { ProxyTarget } from '../proxy/proxy-target-resolver';
import { ConfigError, NetworkError } from '../../errors/error-types';
import {
  fetchCliproxyRetryResponse,
  getCliproxyRoutingTarget,
  getRoutingErrorMessage,
  type CliproxyRetryManagementSetting,
} from './routing-strategy-http';

export interface CliproxyRetryValues {
  request_retry: number;
  max_retry_interval: number;
}

export interface CliproxyRetryState extends CliproxyRetryValues {
  source: 'live' | 'config';
  target: 'local' | 'remote';
  reachable: boolean;
  manageable: boolean;
  message?: string;
}

export interface CliproxyRetryApplyResult extends CliproxyRetryState {
  applied: 'live' | 'live-and-config' | 'config-only';
}

const DEFAULT_RETRY_VALUES: CliproxyRetryValues = {
  request_retry: 0,
  max_retry_interval: 0,
};

let retryOperationQueue: Promise<void> = Promise.resolve();

export function normalizeCliproxyRetryValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function serializeRetryOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = retryOperationQueue.then(operation, operation);
  retryOperationQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

function getConfiguredRetryValues(): CliproxyRetryValues {
  const retry = loadOrCreateUnifiedConfig().cliproxy?.retry;
  return {
    request_retry:
      normalizeCliproxyRetryValue(retry?.request_retry) ?? DEFAULT_RETRY_VALUES.request_retry,
    max_retry_interval:
      normalizeCliproxyRetryValue(retry?.max_retry_interval) ??
      DEFAULT_RETRY_VALUES.max_retry_interval,
  };
}

async function readLiveRetryValue(
  target: ProxyTarget,
  setting: CliproxyRetryManagementSetting
): Promise<number> {
  const response = await fetchCliproxyRetryResponse(target, setting, 'GET');
  if (!response.ok) {
    throw new NetworkError(
      await getRoutingErrorMessage(
        response,
        `Failed to read CLIProxy ${setting} (${response.status})`
      )
    );
  }

  const data = (await response.json()) as Record<string, unknown>;
  const value = normalizeCliproxyRetryValue(data[setting] ?? data.value);
  if (value === null) {
    throw new NetworkError(`CLIProxy returned an invalid ${setting} value`);
  }
  return value;
}

async function readLiveRetryValues(target: ProxyTarget): Promise<CliproxyRetryValues> {
  const requestRetry = await readLiveRetryValue(target, 'request-retry');
  const maxRetryInterval = await readLiveRetryValue(target, 'max-retry-interval');
  return {
    request_retry: requestRetry,
    max_retry_interval: maxRetryInterval,
  };
}

async function putLiveRetryValue(
  target: ProxyTarget,
  setting: CliproxyRetryManagementSetting,
  value: number
): Promise<void> {
  const response = await fetchCliproxyRetryResponse(target, setting, 'PUT', value);
  if (!response.ok) {
    throw new NetworkError(
      await getRoutingErrorMessage(
        response,
        `Failed to update CLIProxy ${setting} (${response.status})`
      )
    );
  }
}

async function updateLiveRetryValues(
  target: ProxyTarget,
  values: CliproxyRetryValues,
  previousRequestRetry: number
): Promise<void> {
  await putLiveRetryValue(target, 'request-retry', values.request_retry);
  try {
    await putLiveRetryValue(target, 'max-retry-interval', values.max_retry_interval);
  } catch (error) {
    try {
      await putLiveRetryValue(target, 'request-retry', previousRequestRetry);
    } catch (rollbackError) {
      throw new NetworkError(
        `${(error as Error).message}. Failed to roll back request-retry: ${(rollbackError as Error).message}`
      );
    }
    throw error;
  }
}

function persistLocalRetryValues(target: ProxyTarget, values: CliproxyRetryValues): void {
  const previousRetry = loadOrCreateUnifiedConfig().cliproxy?.retry;
  const previous = previousRetry ? { ...previousRetry } : undefined;
  const configPath = getConfigPathForPort(target.port);
  const authDir = getAuthDir();

  mutateConfig((config) => {
    config.cliproxy = config.cliproxy ?? {};
    config.cliproxy.retry = { ...values };
  });

  try {
    regenerateConfig(target.port, { configPath, authDir });
  } catch (error) {
    mutateConfig((config) => {
      config.cliproxy = config.cliproxy ?? {};
      if (previous) {
        config.cliproxy.retry = previous;
      } else {
        delete config.cliproxy.retry;
      }
    });

    try {
      regenerateConfig(target.port, { configPath, authDir });
    } catch (rollbackError) {
      throw new ConfigError(
        `Failed to regenerate CLIProxy config: ${(error as Error).message}. Rollback regeneration also failed: ${(rollbackError as Error).message}`
      );
    }
    throw new ConfigError(
      `Failed to regenerate CLIProxy config: ${(error as Error).message}. Saved retry settings were rolled back.`
    );
  }
}

export function readCliproxyRetryState(): Promise<CliproxyRetryState> {
  return serializeRetryOperation(async () => {
    const target = getCliproxyRoutingTarget();
    try {
      const values = await readLiveRetryValues(target);
      return {
        ...values,
        source: 'live',
        target: target.isRemote ? 'remote' : 'local',
        reachable: true,
        manageable: true,
      };
    } catch (error) {
      if (target.isRemote) throw error;
      return {
        ...getConfiguredRetryValues(),
        source: 'config',
        target: 'local',
        reachable: false,
        manageable: true,
        message: 'Local CLIProxy is not reachable. Showing the saved startup defaults.',
      };
    }
  });
}

export function applyCliproxyRetrySettings(
  values: CliproxyRetryValues
): Promise<CliproxyRetryApplyResult> {
  return serializeRetryOperation(async () => {
    const target = getCliproxyRoutingTarget();
    let previousLive: CliproxyRetryValues;

    try {
      previousLive = await readLiveRetryValues(target);
    } catch (error) {
      if (target.isRemote) throw error;
      persistLocalRetryValues(target, values);
      return {
        ...values,
        source: 'config',
        target: 'local',
        reachable: false,
        manageable: true,
        applied: 'config-only',
        message: 'Saved the local startup defaults. They will apply the next time CLIProxy starts.',
      };
    }

    if (!target.isRemote) {
      persistLocalRetryValues(target, values);
    }

    try {
      await updateLiveRetryValues(target, values, previousLive.request_retry);
    } catch (error) {
      if (target.isRemote) throw error;
      return {
        ...values,
        source: 'config',
        target: 'local',
        reachable: true,
        manageable: true,
        applied: 'config-only',
        message: `Saved the local startup defaults, but the running proxy rejected the live update: ${(error as Error).message}`,
      };
    }

    return {
      ...values,
      source: 'live',
      target: target.isRemote ? 'remote' : 'local',
      reachable: true,
      manageable: true,
      applied: target.isRemote ? 'live' : 'live-and-config',
      message: target.isRemote
        ? 'Updated the running remote CLIProxy. Local CCS config was not changed.'
        : 'Updated the running local CLIProxy and saved the startup defaults.',
    };
  });
}
