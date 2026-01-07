/**
 * Model Config Tab
 * Contains model config section, accounts section, and provider-specific settings
 */

import { useCallback, useEffect, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ModelConfigSection } from './model-config-section';
import { AccountsSection } from './accounts-section';
import { api } from '@/lib/api-client';
import type { ProviderCatalog } from '../provider-model-selector';
import type { OAuthAccount } from '@/lib/api-client';

interface ModelConfigTabProps {
  provider: string;
  catalog?: ProviderCatalog;
  savedPresets: Array<{
    name: string;
    default: string;
    opus: string;
    sonnet: string;
    haiku: string;
  }>;
  currentModel?: string;
  opusModel?: string;
  sonnetModel?: string;
  haikuModel?: string;
  providerModels: Array<{ id: string; owned_by: string }>;
  onApplyPreset: (updates: Record<string, string>) => void;
  onUpdateEnvValue: (key: string, value: string) => void;
  onOpenCustomPreset: () => void;
  onDeletePreset: (name: string) => void;
  isDeletePending?: boolean;
  accounts: OAuthAccount[];
  onAddAccount: () => void;
  onSetDefault: (accountId: string) => void;
  onRemoveAccount: (accountId: string) => void;
  onPauseToggle?: (accountId: string, paused: boolean) => void;
  isRemovingAccount?: boolean;
  /** Pause/resume mutation in progress */
  isPausingAccount?: boolean;
  privacyMode?: boolean;
  /** True if connected to remote CLIProxy (quota not available) */
  isRemoteMode?: boolean;
}

export function ModelConfigTab({
  provider,
  catalog,
  savedPresets,
  currentModel,
  opusModel,
  sonnetModel,
  haikuModel,
  providerModels,
  onApplyPreset,
  onUpdateEnvValue,
  onOpenCustomPreset,
  onDeletePreset,
  isDeletePending,
  accounts,
  onAddAccount,
  onSetDefault,
  onRemoveAccount,
  onPauseToggle,
  isRemovingAccount,
  isPausingAccount,
  privacyMode,
  isRemoteMode,
}: ModelConfigTabProps) {
  // Kiro-specific: no-incognito setting (defaults to true = normal browser)
  const isKiro = provider === 'kiro';
  const [kiroNoIncognito, setKiroNoIncognito] = useState(true);
  const [kiroSettingsLoading, setKiroSettingsLoading] = useState(true);
  const [kiroSaving, setKiroSaving] = useState(false);

  // Fetch Kiro settings from unified config
  const fetchKiroSettings = useCallback(async () => {
    if (!isKiro) return;
    try {
      setKiroSettingsLoading(true);
      const unifiedConfig = await api.config.get();
      const cliproxyConfig = unifiedConfig.cliproxy as { kiro_no_incognito?: boolean } | undefined;
      setKiroNoIncognito(cliproxyConfig?.kiro_no_incognito ?? true);
    } catch {
      setKiroNoIncognito(true);
    } finally {
      setKiroSettingsLoading(false);
    }
  }, [isKiro]);

  // Save Kiro no-incognito setting
  const saveKiroNoIncognito = useCallback(async (enabled: boolean) => {
    setKiroNoIncognito(enabled); // Optimistic update
    setKiroSaving(true);
    try {
      const unifiedConfig = await api.config.get();
      const existingCliproxy = (unifiedConfig.cliproxy ?? {}) as Record<string, unknown>;
      await api.config.update({
        ...unifiedConfig,
        cliproxy: {
          ...existingCliproxy,
          kiro_no_incognito: enabled,
        },
      });
    } catch {
      setKiroNoIncognito(!enabled); // Revert on error
    } finally {
      setKiroSaving(false);
    }
  }, []);

  // Load Kiro settings on mount
  useEffect(() => {
    fetchKiroSettings();
  }, [fetchKiroSettings]);

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-6">
        <ModelConfigSection
          catalog={catalog}
          savedPresets={savedPresets}
          currentModel={currentModel}
          opusModel={opusModel}
          sonnetModel={sonnetModel}
          haikuModel={haikuModel}
          providerModels={providerModels}
          onApplyPreset={onApplyPreset}
          onUpdateEnvValue={onUpdateEnvValue}
          onOpenCustomPreset={onOpenCustomPreset}
          onDeletePreset={onDeletePreset}
          isDeletePending={isDeletePending}
        />
        <Separator />
        <AccountsSection
          accounts={accounts}
          onAddAccount={onAddAccount}
          onSetDefault={onSetDefault}
          onRemoveAccount={onRemoveAccount}
          onPauseToggle={onPauseToggle}
          isRemovingAccount={isRemovingAccount}
          isPausingAccount={isPausingAccount}
          privacyMode={privacyMode}
          showQuota={provider === 'agy' && !isRemoteMode}
          isKiro={isKiro}
          kiroNoIncognito={kiroNoIncognito}
          onKiroNoIncognitoChange={saveKiroNoIncognito}
          kiroSettingsLoading={kiroSettingsLoading || kiroSaving}
        />
      </div>
    </ScrollArea>
  );
}
