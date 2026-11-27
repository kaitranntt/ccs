import type { SharedItemSource, SharedSummary } from '@/hooks/use-shared';
import type { TFunction } from 'i18next';

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

export function getSharedItemSourceMeta(
  source: SharedItemSource | undefined,
  t: TFunction
): { label: string; className: string } | null {
  if (source === 'ccs-shared') {
    return {
      label: t('sharedPage.sourceCcsShared'),
      className:
        'border-emerald-300/60 bg-emerald-50/50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300',
    };
  }
  if (source === 'claude-default') {
    return {
      label: t('sharedPage.sourceClaudeDefault'),
      className:
        'border-amber-300/60 bg-amber-50/50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300',
    };
  }
  return null;
}
