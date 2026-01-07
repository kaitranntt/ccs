/**
 * Provider Editor Component
 * Split-view editor for CLIProxy provider settings
 */

/* eslint-disable react-refresh/only-export-components */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, Code2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useCliproxyModels,
  usePresets,
  useCreatePreset,
  useDeletePreset,
} from '@/hooks/use-cliproxy';
import { CLIPROXY_PORT } from '@/lib/preset-utils';
import { usePrivacy } from '@/contexts/privacy-context';
import { useProviderEditor } from './use-provider-editor';
import { CustomPresetDialog } from './custom-preset-dialog';
import { RawEditorSection } from './raw-editor-section';
import { ProviderInfoTab } from './provider-info-tab';
import { ProviderEditorHeader } from './provider-editor-header';
import { ModelConfigTab } from './model-config-tab';
import type { ProviderEditorProps, ModelMappingValues } from './types';

export function ProviderEditor({
  provider,
  displayName,
  authStatus,
  catalog,
  logoProvider,
  baseProvider,
  isRemoteMode,
  port,
  onAddAccount,
  onSetDefault,
  onRemoveAccount,
  onPauseToggle,
  isRemovingAccount,
  isPausingAccount,
}: ProviderEditorProps) {
  const [customPresetOpen, setCustomPresetOpen] = useState(false);
  const { privacyMode } = usePrivacy();

  const { data: modelsData } = useCliproxyModels();
  const { data: presetsData } = usePresets(provider);
  const createPresetMutation = useCreatePreset();
  const deletePresetMutation = useDeletePreset();
  const savedPresets = presetsData?.presets || [];

  // Use baseProvider for model filtering (for variants, this is the parent provider)
  const modelFilterProvider = baseProvider || provider;

  const providerModels = useMemo(() => {
    if (!modelsData?.models) return [];
    const ownerMap: Record<string, string[]> = {
      gemini: ['google'],
      agy: ['antigravity'],
      codex: ['openai'],
      qwen: ['alibaba', 'qwen'],
      iflow: ['iflow'],
      kiro: ['kiro', 'aws'],
      ghcp: ['github', 'copilot'],
    };
    const owners = ownerMap[modelFilterProvider.toLowerCase()] || [
      modelFilterProvider.toLowerCase(),
    ];
    return modelsData.models.filter((m) =>
      owners.some((o) => m.owned_by.toLowerCase().includes(o))
    );
  }, [modelsData, modelFilterProvider]);

  const {
    data,
    isLoading,
    refetch,
    rawJsonContent,
    rawJsonEdits,
    isRawJsonValid,
    hasChanges,
    currentModel,
    opusModel,
    sonnetModel,
    haikuModel,
    handleRawJsonChange,
    updateEnvValue,
    updateEnvValues,
    saveMutation,
    conflictDialog,
    handleConflictResolve,
    missingRequiredFields,
  } = useProviderEditor(provider);

  const accounts = authStatus.accounts || [];

  // Fetch effective API key for presets (uses configured value, not hardcoded)
  const { data: authTokens } = useQuery<{ apiKey: { value: string } }>({
    queryKey: ['auth-tokens-raw'],
    queryFn: async () => {
      const response = await fetch('/api/settings/auth/tokens/raw');
      if (!response.ok) return { apiKey: { value: 'ccs-internal-managed' } };
      return response.json();
    },
    staleTime: 60000, // Cache for 1 minute
  });
  const effectiveApiKey = authTokens?.apiKey?.value ?? 'ccs-internal-managed';

  const handleApplyPreset = (updates: Record<string, string>) => {
    const effectivePort = port ?? CLIPROXY_PORT;
    updateEnvValues({
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${effectivePort}/api/provider/${provider}`,
      ANTHROPIC_AUTH_TOKEN: effectiveApiKey,
      ...updates,
    });
    toast.success(`Applied "${updates.ANTHROPIC_MODEL?.split('/').pop() || 'preset'}" preset`);
  };

  const handleCustomPresetApply = (values: ModelMappingValues, presetName?: string) => {
    const effectivePort = port ?? CLIPROXY_PORT;
    updateEnvValues({
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${effectivePort}/api/provider/${provider}`,
      ANTHROPIC_AUTH_TOKEN: effectiveApiKey,
      ANTHROPIC_MODEL: values.default,
      ANTHROPIC_DEFAULT_OPUS_MODEL: values.opus,
      ANTHROPIC_DEFAULT_SONNET_MODEL: values.sonnet,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: values.haiku,
    });
    toast.success(`Applied ${presetName ? `"${presetName}"` : 'custom'} preset`);
    setCustomPresetOpen(false);
  };

  const handleCustomPresetSave = (values: ModelMappingValues, presetName?: string) => {
    if (!presetName) {
      toast.error('Please enter a preset name to save');
      return;
    }
    createPresetMutation.mutate({ profile: provider, data: { name: presetName, ...values } });
    setCustomPresetOpen(false);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ProviderEditorHeader
        provider={provider}
        displayName={displayName}
        logoProvider={logoProvider}
        data={data}
        isLoading={isLoading}
        hasChanges={hasChanges}
        isRawJsonValid={isRawJsonValid}
        isSaving={saveMutation.isPending}
        isRemoteMode={isRemoteMode}
        port={port}
        onRefetch={refetch}
        onSave={() => saveMutation.mutate()}
      />

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          <span className="ml-3 text-muted-foreground">Loading settings...</span>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-[40%_60%] divide-x overflow-hidden">
          <div className="flex flex-col overflow-hidden bg-muted/5">
            <Tabs defaultValue="config" className="h-full flex flex-col">
              <div className="px-4 pt-4 shrink-0">
                <TabsList className="w-full">
                  <TabsTrigger value="config" className="flex-1">
                    Model Config
                  </TabsTrigger>
                  <TabsTrigger value="info" className="flex-1">
                    Info & Usage
                  </TabsTrigger>
                </TabsList>
              </div>
              <div className="flex-1 overflow-hidden flex flex-col">
                <TabsContent
                  value="config"
                  className="flex-1 mt-0 border-0 p-0 data-[state=inactive]:hidden flex flex-col overflow-hidden"
                >
                  <ModelConfigTab
                    provider={provider}
                    catalog={catalog}
                    savedPresets={savedPresets}
                    currentModel={currentModel}
                    opusModel={opusModel}
                    sonnetModel={sonnetModel}
                    haikuModel={haikuModel}
                    providerModels={providerModels}
                    onApplyPreset={handleApplyPreset}
                    onUpdateEnvValue={updateEnvValue}
                    onOpenCustomPreset={() => setCustomPresetOpen(true)}
                    onDeletePreset={(name) =>
                      deletePresetMutation.mutate({ profile: provider, name })
                    }
                    isDeletePending={deletePresetMutation.isPending}
                    accounts={accounts}
                    onAddAccount={onAddAccount}
                    onSetDefault={onSetDefault}
                    onRemoveAccount={onRemoveAccount}
                    onPauseToggle={onPauseToggle}
                    isRemovingAccount={isRemovingAccount}
                    isPausingAccount={isPausingAccount}
                    privacyMode={privacyMode}
                    isRemoteMode={isRemoteMode}
                  />
                </TabsContent>
                <TabsContent
                  value="info"
                  className="h-full mt-0 border-0 p-0 data-[state=inactive]:hidden"
                >
                  <ProviderInfoTab
                    provider={provider}
                    displayName={displayName}
                    data={data}
                    authStatus={authStatus}
                  />
                </TabsContent>
              </div>
            </Tabs>
          </div>

          <div className="flex flex-col overflow-hidden">
            <div className="px-6 py-2 bg-muted/30 border-b flex items-center gap-2 shrink-0 h-[45px]">
              <Code2 className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                Raw Configuration (JSON)
              </span>
            </div>
            <RawEditorSection
              rawJsonContent={rawJsonContent}
              isRawJsonValid={isRawJsonValid}
              rawJsonEdits={rawJsonEdits}
              onRawJsonChange={handleRawJsonChange}
              profileEnv={data?.settings?.env}
              missingRequiredFields={missingRequiredFields}
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        open={conflictDialog}
        title="File Modified Externally"
        description="This settings file was modified by another process. Overwrite with your changes or discard?"
        confirmText="Overwrite"
        variant="destructive"
        onConfirm={() => handleConflictResolve(true)}
        onCancel={() => handleConflictResolve(false)}
      />

      <CustomPresetDialog
        open={customPresetOpen}
        onClose={() => setCustomPresetOpen(false)}
        currentValues={{
          default: currentModel || '',
          opus: opusModel || '',
          sonnet: sonnetModel || '',
          haiku: haikuModel || '',
        }}
        onApply={handleCustomPresetApply}
        onSave={handleCustomPresetSave}
        isSaving={createPresetMutation.isPending}
        catalog={catalog}
        allModels={providerModels}
      />
    </div>
  );
}

export type { ProviderEditorProps, ModelMappingValues } from './types';
export { AccountItem } from './account-item';
export { UsageCommand } from './usage-command';
export { CustomPresetDialog } from './custom-preset-dialog';
export { ModelConfigSection } from './model-config-section';
export { RawEditorSection } from './raw-editor-section';
export { AccountsSection } from './accounts-section';
export { ProviderInfoTab } from './provider-info-tab';
export { ProviderEditorHeader } from './provider-editor-header';
export { ModelConfigTab } from './model-config-tab';
export { useProviderEditor } from './use-provider-editor';
