import { mutateUnifiedConfig, loadOrCreateUnifiedConfig } from '../config/unified-config-loader';
import { regenerateConfig } from './config/generator';
import { getAuthDir, getConfigPathForPort } from './config/path-resolver';
import {
  fetchCliproxyRoutingResponse,
  getCliproxyRoutingTarget,
  getRoutingErrorMessage,
} from './routing-strategy-http';
import type { CliproxyRoutingStrategy } from './types';

export const DEFAULT_CLIPROXY_ROUTING_STRATEGY: CliproxyRoutingStrategy = 'round-robin';

export interface CliproxyRoutingState {
  strategy: CliproxyRoutingStrategy;
  source: 'live' | 'config';
  target: 'local' | 'remote';
  reachable: boolean;
  message?: string;
}

export interface CliproxyRoutingApplyResult extends CliproxyRoutingState {
  applied: 'live' | 'live-and-config' | 'config-only';
}

export function normalizeCliproxyRoutingStrategy(value: unknown): CliproxyRoutingStrategy | null {
  if (typeof value !== 'string') {
    return null;
  }

  switch (value.trim().toLowerCase()) {
    case 'round-robin':
    case 'roundrobin':
    case 'rr':
      return 'round-robin';
    case 'fill-first':
    case 'fillfirst':
    case 'ff':
      return 'fill-first';
    default:
      return null;
  }
}

export function getConfiguredCliproxyRoutingStrategy(): CliproxyRoutingStrategy {
  return (
    normalizeCliproxyRoutingStrategy(loadOrCreateUnifiedConfig().cliproxy?.routing?.strategy) ??
    DEFAULT_CLIPROXY_ROUTING_STRATEGY
  );
}

export async function fetchLiveCliproxyRoutingStrategy(): Promise<CliproxyRoutingStrategy> {
  const response = await fetchCliproxyRoutingResponse(getCliproxyRoutingTarget(), 'GET');
  if (!response.ok) {
    throw new Error(
      await getRoutingErrorMessage(response, `Failed to read routing strategy (${response.status})`)
    );
  }

  const data = (await response.json()) as { strategy?: string };
  const strategy = normalizeCliproxyRoutingStrategy(data?.strategy);
  if (!strategy) {
    throw new Error('CLIProxy returned an invalid routing strategy');
  }

  return strategy;
}

export async function readCliproxyRoutingState(): Promise<CliproxyRoutingState> {
  const target = getCliproxyRoutingTarget();

  if (target.isRemote) {
    return {
      strategy: await fetchLiveCliproxyRoutingStrategy(),
      source: 'live',
      target: 'remote',
      reachable: true,
    };
  }

  try {
    return {
      strategy: await fetchLiveCliproxyRoutingStrategy(),
      source: 'live',
      target: 'local',
      reachable: true,
    };
  } catch {
    return {
      strategy: getConfiguredCliproxyRoutingStrategy(),
      source: 'config',
      target: 'local',
      reachable: false,
      message: 'Local CLIProxy is not reachable. Showing the saved startup default.',
    };
  }
}

export async function applyCliproxyRoutingStrategy(
  strategy: CliproxyRoutingStrategy
): Promise<CliproxyRoutingApplyResult> {
  const target = getCliproxyRoutingTarget();
  const configPath = getConfigPathForPort(target.port);
  const authDir = getAuthDir();

  if (target.isRemote) {
    await updateLiveCliproxyRoutingStrategy(strategy);
    return {
      strategy,
      source: 'live',
      target: 'remote',
      reachable: true,
      applied: 'live',
      message: 'Updated remote CLIProxy routing strategy.',
    };
  }

  mutateUnifiedConfig((config) => {
    if (config.cliproxy) {
      config.cliproxy.routing = { strategy };
    }
  });
  regenerateConfig(target.port, { configPath, authDir });

  try {
    await updateLiveCliproxyRoutingStrategy(strategy);
    return {
      strategy,
      source: 'live',
      target: 'local',
      reachable: true,
      applied: 'live-and-config',
      message: 'Updated the running proxy and saved the local startup default.',
    };
  } catch {
    return {
      strategy,
      source: 'config',
      target: 'local',
      reachable: false,
      applied: 'config-only',
      message: 'Saved the local startup default. It will apply the next time CLIProxy starts.',
    };
  }
}

async function updateLiveCliproxyRoutingStrategy(strategy: CliproxyRoutingStrategy): Promise<void> {
  const response = await fetchCliproxyRoutingResponse(getCliproxyRoutingTarget(), 'PUT', {
    value: strategy,
  });
  if (!response.ok) {
    throw new Error(
      await getRoutingErrorMessage(
        response,
        `Failed to update routing strategy (${response.status})`
      )
    );
  }
}
