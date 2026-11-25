import type { SharedSummary } from '@/hooks/use-shared';

export type SharedTabType = 'commands' | 'skills' | 'agents' | 'plugins' | 'settings';

export function getPreferredInitialTab(summary: SharedSummary): SharedTabType {
  if (summary.commands > 0) return 'commands';
  if (summary.skills > 0) return 'skills';
  if (summary.agents > 0) return 'agents';
  if (summary.plugins > 0) return 'plugins';
  if (summary.settings) return 'settings';
  return 'commands';
}

export function getSharedErrorMessage(error: unknown, fallbackMessage: string): string {
  if (!(error instanceof Error)) {
    return fallbackMessage;
  }

  const normalized = error.message.toLowerCase();
  if (normalized.includes('failed to fetch') || normalized.includes('network')) {
    // TODO i18n: missing key for connection lost message
    return 'Connection to dashboard server lost or restarting. Keep `ccs config` running, then retry.';
  }

  return error.message || fallbackMessage;
}

export function formatSharedItemPath(itemPath: string): string {
  return itemPath.startsWith('plugin-registry:') ? 'installed_plugins.json' : itemPath;
}
