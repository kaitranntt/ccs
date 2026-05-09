/**
 * Profile Create Dialog Component
 * Modal dialog with provider preset cards and model configuration
 */

/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ProviderLogo } from '@/components/cliproxy/provider-logo';
import { useCreateProfile } from '@/hooks/use-profiles';
import { useOpenRouterCatalog } from '@/hooks/use-openrouter-models';
import { Loader2, Plus, AlertTriangle, Info, Eye, EyeOff, Settings2, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  PROVIDER_PRESETS,
  getPresetsByCategory,
  getPresetById,
  resolvePresetApiKeyValue,
  type ProviderPreset,
} from '@/lib/provider-presets';
import {
  searchModels,
  formatPricingPair,
  formatContextLength,
  formatModelAge,
  getNewestModelsPerProvider,
} from '@/lib/openrouter-utils';
import type { CategorizedModel } from '@/lib/openrouter-types';
import type { CliTarget } from '@/lib/api-client';
import i18n from '@/lib/i18n';

const optionalUrlSchema = z
  .string()
  .refine((value) => value.trim().length === 0 || z.string().url().safeParse(value).success, {
    message: 'Invalid URL format',
  });

const schema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .regex(/^[a-zA-Z][a-zA-Z0-9._-]*$/, 'Must start with letter, only letters/numbers/.-_'),
  baseUrl: optionalUrlSchema,
  apiKey: z.string(), // Validation handled conditionally in onSubmit
  model: z.string().optional(),
  opusModel: z.string().optional(),
  sonnetModel: z.string().optional(),
  haikuModel: z.string().optional(),
  target: z.enum(['claude', 'droid', 'codex']),
});

type FormData = z.infer<typeof schema>;
type PresetSelection = ProviderPreset['id'] | 'custom';

interface ProfileCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (name: string) => void;
  initialMode?: ProviderPreset['id'] | 'normal';
}

// Common URL mistakes to warn about
const PROBLEMATIC_PATHS = ['/chat/completions', '/v1/messages', '/messages', '/completions'];
const CUSTOM_PRESET_ID = 'custom';
const DEFAULT_PRESET_ID: ProviderPreset['id'] = 'openrouter';
const LOCAL_PRESET_IDS = new Set<ProviderPreset['id']>(['ollama', 'llamacpp']);

const EMPTY_FORM_VALUES: FormData = {
  name: '',
  baseUrl: '',
  apiKey: '',
  model: '',
  opusModel: '',
  sonnetModel: '',
  haikuModel: '',
  target: 'claude',
};

const RECOMMENDED_PRESETS = getPresetsByCategory('recommended');
const FEATURED_PREMIUM_PRESETS = RECOMMENDED_PRESETS.filter(
  (preset) => !LOCAL_PRESET_IDS.has(preset.id)
);
const LOCAL_RUNTIME_PRESETS = RECOMMENDED_PRESETS.filter((preset) =>
  LOCAL_PRESET_IDS.has(preset.id)
);
const QUICK_TEMPLATE_PRESETS = PROVIDER_PRESETS.filter(
  (preset) => preset.category !== 'recommended'
);

export function ProfileCreateDialog({
  open,
  onOpenChange,
  onSuccess,
  initialMode = 'openrouter',
}: ProfileCreateDialogProps) {
  const { t } = useTranslation();
  const createMutation = useCreateProfile();
  const [activeTab, setActiveTab] = useState('basic');
  const [urlWarning, setUrlWarning] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<PresetSelection>(DEFAULT_PRESET_ID);
  const [modelSearch, setModelSearch] = useState('');

  // OpenRouter models for model picker
  const { models: openRouterModels } = useOpenRouterCatalog();

  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
    reset,
    setValue,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY_FORM_VALUES,
  });

  const baseUrlValue = useWatch({ control, name: 'baseUrl' });
  const targetValue = useWatch({ control, name: 'target' });
  const applyPresetToForm = useCallback(
    (preset: ProviderPreset | null) => {
      if (!preset) {
        reset(EMPTY_FORM_VALUES);
        return;
      }

      reset({
        ...EMPTY_FORM_VALUES,
        name: preset.defaultProfileName,
        baseUrl: preset.baseUrl,
        model: preset.defaultModel,
        opusModel: preset.defaultModel,
        sonnetModel: preset.defaultModel,
        haikuModel: preset.defaultModel,
        target: preset.defaultTarget ?? 'claude',
      });
    },
    [reset]
  );

  // Get current preset config
  const currentPreset = useMemo(() => {
    if (selectedPreset === CUSTOM_PRESET_ID) return null;
    return getPresetById(selectedPreset) ?? null;
  }, [selectedPreset]);

  // Filter models for OpenRouter search (newest first)
  const filteredModels = useMemo(() => {
    if (!modelSearch.trim()) {
      // Show newest models when no search
      return getNewestModelsPerProvider(openRouterModels, 2);
    }
    // Search and sort by created date (newest first)
    const results = searchModels(openRouterModels, modelSearch);
    return [...results].sort((a, b) => (b.created ?? 0) - (a.created ?? 0)).slice(0, 20);
  }, [openRouterModels, modelSearch]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setActiveTab('basic');
      setUrlWarning(null);
      setShowApiKey(false);
      setModelSearch('');

      // Set initial preset based on initialMode
      if (initialMode === 'normal') {
        setSelectedPreset(CUSTOM_PRESET_ID);
        applyPresetToForm(null);
      } else {
        const presetId = initialMode === 'openrouter' ? DEFAULT_PRESET_ID : initialMode;
        const defaultPreset = getPresetById(presetId);
        if (defaultPreset) {
          setSelectedPreset(defaultPreset.id);
          applyPresetToForm(defaultPreset);
          return;
        }

        // Safe fallback if default preset is missing.
        setSelectedPreset(CUSTOM_PRESET_ID);
        applyPresetToForm(null);
      }
    }
  }, [open, initialMode, applyPresetToForm, reset]);

  // Handle preset selection
  const handlePresetSelect = (presetId: string) => {
    const preset = getPresetById(presetId);

    if (preset) {
      setSelectedPreset(preset.id);
      applyPresetToForm(preset);
      return;
    }

    setSelectedPreset(CUSTOM_PRESET_ID);
    applyPresetToForm(null);
  };

  // Handle model selection from picker - applies to all 4 model tiers
  const handleModelSelect = (model: CategorizedModel) => {
    setValue('model', model.id);
    setValue('opusModel', model.id);
    setValue('sonnetModel', model.id);
    setValue('haikuModel', model.id);
    setModelSearch(model.name);
    // Show feedback that model was applied to all tiers
    toast.success(t('profileCreateDialog.appliedModelToTiers', { model: model.name }), {
      duration: 2000,
    });
  };

  // Check for common URL mistakes - only for truly custom URLs
  // Presets (OpenRouter, GLM, Kimi) have vetted URLs that may require full paths
  useEffect(() => {
    // Only warn for custom URLs, not preset-selected ones
    const isCustomUrl = selectedPreset === CUSTOM_PRESET_ID;
    if (baseUrlValue && isCustomUrl) {
      const lowerUrl = baseUrlValue.toLowerCase();
      for (const path of PROBLEMATIC_PATHS) {
        if (lowerUrl.endsWith(path)) {
          const suggestedUrl = baseUrlValue.replace(new RegExp(path + '$', 'i'), '');
          setUrlWarning(
            `URL ends with "${path}" - Claude appends this automatically. You likely want: ${suggestedUrl}`
          );
          return;
        }
      }
    }
    setUrlWarning(null);
  }, [baseUrlValue, selectedPreset]);

  const onSubmit = async (data: FormData) => {
    // Validate API key - required unless preset has requiresApiKey: false
    if (currentPreset?.requiresApiKey !== false && !data.apiKey) {
      toast.error(i18n.t('commonToast.apiKeyRequired'));
      return;
    }
    // Use user-provided baseUrl (allows customization of preset URLs)
    const finalData = {
      ...data,
      apiKey: resolvePresetApiKeyValue(currentPreset, data.apiKey),
    };
    try {
      await createMutation.mutateAsync(finalData);
      toast.success(t('profileCreateDialog.profileCreated', { name: finalData.name }));
      onSuccess(finalData.name);
      onOpenChange(false);
    } catch (error) {
      toast.error((error as Error).message || t('profileCreateDialog.failedCreate'));
    }
  };

  const hasBasicErrors = !!errors.name || !!errors.baseUrl || !!errors.apiKey;
  const hasModelErrors =
    !!errors.model || !!errors.opusModel || !!errors.sonnetModel || !!errors.haikuModel;
  const isCreating = createMutation.isPending;

  const isOpenRouter = currentPreset?.id === DEFAULT_PRESET_ID;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="profile-create-dialog"
        className="h-[calc(100dvh-2rem)] max-h-[900px] gap-0 overflow-hidden p-0 sm:max-w-[700px] !flex !flex-col"
      >
        <DialogHeader className="shrink-0 border-b p-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" />
            {t('profileCreateDialog.createProfile')}
          </DialogTitle>
          <DialogDescription>{t('profileCreateDialog.chooseProviderHint')}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col flex-1 min-h-0 overflow-hidden"
        >
          <div
            data-testid="profile-create-provider-chooser"
            className="max-h-[34dvh] shrink-0 space-y-3 overflow-y-auto overscroll-contain border-b bg-muted/10 px-6 py-3"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    {t('profileEditor.provider')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t('profileEditor.providerChooserHint')}
                  </p>
                </div>
                <span className="pt-0.5 text-[11px] text-muted-foreground">
                  {t('profileEditor.scrollHint')}
                </span>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium uppercase tracking-[0.12em] text-foreground/70">
                  {t('profileEditor.featuredProviders')}
                </Label>
                <div className="-mx-1 overflow-x-auto pb-1">
                  <div className="flex min-w-max items-stretch gap-2 px-1">
                    {FEATURED_PREMIUM_PRESETS.map((preset) => (
                      <CompactPresetCard
                        key={preset.id}
                        preset={preset}
                        isSelected={selectedPreset === preset.id}
                        onClick={() => handlePresetSelect(preset.id)}
                        density="featured"
                      />
                    ))}
                    <div className="mx-1 hidden w-px rounded-full bg-border/70 sm:block" />
                    <CustomPresetCard
                      isSelected={selectedPreset === CUSTOM_PRESET_ID}
                      onClick={() => handlePresetSelect(CUSTOM_PRESET_ID)}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium uppercase tracking-[0.12em] text-foreground/70">
                  {t('profileEditor.morePresets')}
                </Label>
                <div className="-mx-1 overflow-x-auto pb-1">
                  <div className="flex min-w-max items-stretch gap-2 px-1">
                    {QUICK_TEMPLATE_PRESETS.map((preset) => (
                      <CompactPresetCard
                        key={preset.id}
                        preset={preset}
                        isSelected={selectedPreset === preset.id}
                        onClick={() => handlePresetSelect(preset.id)}
                        density="compact"
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium uppercase tracking-[0.12em] text-foreground/70">
                  {t('openrouterQuickStart.localRuntimesTitle')}
                </Label>
                <div className="flex flex-wrap gap-2">
                  {LOCAL_RUNTIME_PRESETS.map((preset) => (
                    <CompactPresetCard
                      key={preset.id}
                      preset={preset}
                      isSelected={selectedPreset === preset.id}
                      onClick={() => handlePresetSelect(preset.id)}
                      density="compact"
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex flex-col flex-1 min-h-0 overflow-hidden"
          >
            <div className="px-6 pt-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="basic" className="relative">
                  {t('profileCreateDialog.basicInformation')}
                  {hasBasicErrors && (
                    <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-destructive animate-pulse" />
                  )}
                </TabsTrigger>
                <TabsTrigger value="models" className="relative">
                  {t('profileCreateDialog.modelConfiguration')}
                  {hasModelErrors && (
                    <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-destructive animate-pulse" />
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            <div data-testid="profile-create-tab-scroll" className="flex-1 min-h-0 overflow-y-auto">
              <TabsContent value="basic" className="p-6 space-y-4 mt-0">
                {/* Profile Name */}
                <div className="space-y-1.5">
                  <Label htmlFor="name">
                    {t('profileDialog.name')} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    {...register('name')}
                    placeholder={t('profileDialog.namePlaceholder')}
                    className="font-mono"
                  />
                  {errors.name ? (
                    <p className="text-xs text-destructive">{errors.name.message}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {t('profileCreateDialog.usedInCli')}{' '}
                      <code className="bg-muted px-1 rounded text-[10px]">ccs my-api "prompt"</code>
                    </p>
                  )}
                </div>

                {/* Base URL - always editable, pre-filled from preset */}
                <div className="space-y-1.5">
                  <Label htmlFor="baseUrl">{t('profileCreateDialog.apiBaseUrl')}</Label>
                  <Input
                    id="baseUrl"
                    {...register('baseUrl')}
                    placeholder={t('profileCreateDialog.baseUrlPlaceholder')}
                  />
                  {errors.baseUrl ? (
                    <p className="text-xs text-destructive">{errors.baseUrl.message}</p>
                  ) : urlWarning ? (
                    <div className="flex items-start gap-2 text-xs text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{urlWarning}</span>
                    </div>
                  ) : currentPreset ? (
                    <p className="text-xs text-muted-foreground">
                      {currentPreset.baseUrl
                        ? t('profileCreateDialog.prefilledFromPreset', { name: currentPreset.name })
                        : t('profileCreateDialog.optionalForPreset', { name: currentPreset.name })}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {t('profileCreateDialog.endpointHint')}
                    </p>
                  )}
                </div>

                {/* API Key - optional for presets that don't require it */}
                <div className="space-y-1.5">
                  <Label htmlFor="apiKey">
                    {t('profileDialog.apiKey')}{' '}
                    {currentPreset?.requiresApiKey !== false && (
                      <span className="text-destructive">*</span>
                    )}
                    {currentPreset?.requiresApiKey === false && (
                      <span className="text-muted-foreground text-xs font-normal">
                        {t('profileCreateDialog.optional')}
                      </span>
                    )}
                  </Label>
                  <div className="relative">
                    <Input
                      id="apiKey"
                      type={showApiKey ? 'text' : 'password'}
                      {...register('apiKey')}
                      placeholder={
                        currentPreset?.requiresApiKey === false
                          ? t('profileCreateDialog.apiKeyOptionalPlaceholder')
                          : (currentPreset?.apiKeyPlaceholder ??
                            t('profileCreateDialog.apiKeyPlaceholder'))
                      }
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-9 w-9 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowApiKey(!showApiKey)}
                      tabIndex={-1}
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {errors.apiKey ? (
                    <p className="text-xs text-destructive">{errors.apiKey.message}</p>
                  ) : currentPreset?.requiresApiKey === false ? (
                    <p className="text-xs text-muted-foreground">
                      {t('profileCreateDialog.apiKeyOptionalHint')}
                    </p>
                  ) : (
                    currentPreset?.apiKeyHint && (
                      <p className="text-xs text-muted-foreground">{currentPreset.apiKeyHint}</p>
                    )
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="target">{t('codex.defaultTargetCli')}</Label>
                  <Select
                    value={targetValue}
                    onValueChange={(value) => setValue('target', value as CliTarget)}
                  >
                    <SelectTrigger id="target">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="claude">{t('profileCard.claudeCodeDefault')}</SelectItem>
                      <SelectItem value="droid">{t('profileCard.factoryDroid')}</SelectItem>
                      <SelectItem value="codex">{t('profileCard.codexCli')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {targetValue === 'droid' ? (
                      <>
                        {t('profileEditor.targetHintPreferredAlias')}{' '}
                        <code className="bg-muted px-1 rounded text-[10px]">ccs-droid</code>.
                      </>
                    ) : targetValue === 'codex' ? (
                      <>
                        {t('profileEditor.targetHintPreferredAlias')}{' '}
                        <code className="bg-muted px-1 rounded text-[10px]">ccsx</code>.
                      </>
                    ) : (
                      <>
                        {t('profileEditor.targetHintClaudeDefault')}{' '}
                        <code className="bg-muted px-1 rounded text-[10px]">ccs</code>.
                      </>
                    )}
                    {targetValue === 'droid' ? (
                      <>
                        {' '}
                        {t('profileEditor.targetHintLegacyAlias')}{' '}
                        <code className="bg-muted px-1 rounded text-[10px]">ccsd</code>.
                      </>
                    ) : targetValue === 'codex' ? (
                      <>
                        {' '}
                        {t('profileEditor.targetHintLegacyAlias')}{' '}
                        <code className="bg-muted px-1 rounded text-[10px]">ccs-codex</code>.
                      </>
                    ) : null}{' '}
                    {t('profileEditor.targetHintOverride')}{' '}
                    <code className="bg-muted px-1 rounded text-[10px]">--target</code>.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="models" className="p-6 mt-0 space-y-4">
                <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-950/20 text-blue-800 dark:text-blue-300 rounded-md text-sm border border-blue-100 dark:border-blue-900/30">
                  <Info className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium mb-1">{t('profileCreateDialog.modelMapping')}</p>
                    <p className="text-xs opacity-90">
                      {t('profileCreateDialog.modelMappingDesc')}
                    </p>
                  </div>
                </div>

                {/* OpenRouter Model Picker */}
                {isOpenRouter && (
                  <div className="space-y-2">
                    <Label>{t('openrouterModelPicker.searchModels')}</Label>
                    <Input
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      placeholder={t('profileCreateDialog.searchModelsPlaceholder')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && filteredModels.length > 0) {
                          e.preventDefault();
                          handleModelSelect(filteredModels[0]);
                        }
                      }}
                    />
                    <div className="border rounded-md max-h-48 overflow-y-auto">
                      {filteredModels.length === 0 ? (
                        <p className="text-sm text-muted-foreground p-3 text-center">
                          {modelSearch
                            ? t('profileCreateDialog.noModelsFound', { query: modelSearch })
                            : t('profileCreateDialog.loadingModels')}
                        </p>
                      ) : (
                        <div className="p-1">
                          {!modelSearch && (
                            <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground">
                              <Sparkles className="w-3 h-3 text-accent" />
                              <span>{t('openrouterModelPicker.newestModels')}</span>
                            </div>
                          )}
                          {filteredModels.map((model) => (
                            <ModelSearchItem
                              key={model.id}
                              model={model}
                              onClick={() => handleModelSelect(model)}
                              showAge={!modelSearch}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Model Inputs */}
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="model">
                      {t('profileCreateDialog.defaultModel')}
                      <Badge variant="outline" className="ml-2 text-[10px] font-mono">
                        ANTHROPIC_MODEL
                      </Badge>
                    </Label>
                    <Input
                      id="model"
                      {...register('model')}
                      placeholder={currentPreset?.defaultModel ?? 'claude-sonnet-4'}
                      className="font-mono text-sm"
                    />
                  </div>

                  <div className="grid gap-3 pt-2 border-t">
                    <div className="space-y-1.5">
                      <Label htmlFor="sonnetModel" className="text-sm">
                        {t('profileCreateDialog.sonnetMapping')}
                        <Badge variant="outline" className="ml-2 text-[10px] font-mono">
                          DEFAULT_SONNET
                        </Badge>
                      </Label>
                      <Input
                        id="sonnetModel"
                        {...register('sonnetModel')}
                        placeholder={t('profileCreateDialog.sonnetMappingPlaceholder')}
                        className="font-mono text-sm h-9"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="opusModel" className="text-sm">
                        {t('profileCreateDialog.opusMapping')}
                        <Badge variant="outline" className="ml-2 text-[10px] font-mono">
                          DEFAULT_OPUS
                        </Badge>
                      </Label>
                      <Input
                        id="opusModel"
                        {...register('opusModel')}
                        placeholder={t('profileCreateDialog.opusMappingPlaceholder')}
                        className="font-mono text-sm h-9"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="haikuModel" className="text-sm">
                        {t('profileCreateDialog.haikuMapping')}
                        <Badge variant="outline" className="ml-2 text-[10px] font-mono">
                          DEFAULT_HAIKU
                        </Badge>
                      </Label>
                      <Input
                        id="haikuModel"
                        {...register('haikuModel')}
                        placeholder={t('profileCreateDialog.haikuMappingPlaceholder')}
                        className="font-mono text-sm h-9"
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>
            </div>

            <DialogFooter
              data-testid="profile-create-footer"
              className="shrink-0 border-t bg-muted/10 p-6 pt-4"
            >
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('profileDialog.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={isCreating}
                className={cn(isCreating && 'opacity-80')}
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t('cliproxyDialog.creating')}
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    {t('profileCreateDialog.createProfile')}
                  </>
                )}
              </Button>
            </DialogFooter>
          </Tabs>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Compact preset card component - horizontal layout */
function CompactPresetCard({
  preset,
  isSelected,
  onClick,
  density = 'compact',
}: {
  preset: ProviderPreset;
  isSelected: boolean;
  onClick: () => void;
  density?: 'featured' | 'compact';
}) {
  const isAnthropicDirect = preset.id === 'anthropic';
  const isFeaturedDensity = density === 'featured';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-none items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all',
        isFeaturedDensity ? 'h-[68px] w-[236px]' : 'h-[64px] w-[168px]',
        isSelected
          ? 'border-primary bg-primary/8 shadow-sm ring-1 ring-primary/10'
          : 'border-border/60 bg-background hover:border-primary/40 hover:bg-accent/20'
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background">
        {isAnthropicDirect ? (
          <ProviderLogo provider="claude" size="md" className="rounded-lg" />
        ) : preset.icon ? (
          <img src={preset.icon} alt="" className="h-5 w-5 object-contain" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/70 text-xs font-semibold text-foreground/70">
            {preset.name.charAt(0)}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="space-y-1">
          <div className="truncate text-[13px] font-semibold leading-tight tracking-[-0.01em]">
            {preset.name}
          </div>
          {preset.badge && isFeaturedDensity && (
            <Badge
              variant="secondary"
              className="inline-flex bg-muted px-1.5 py-0 text-[10px] text-muted-foreground"
            >
              {preset.badge}
            </Badge>
          )}
        </div>
        {preset.badge && !isFeaturedDensity && (
          <Badge
            variant="secondary"
            className="inline-flex w-fit bg-muted px-1.5 py-0 text-[10px] text-muted-foreground"
          >
            {preset.badge}
          </Badge>
        )}
      </div>
    </button>
  );
}

function CustomPresetCard({ isSelected, onClick }: { isSelected: boolean; onClick: () => void }) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-[68px] w-[236px] flex-none items-center gap-3 rounded-xl border border-dashed px-3 py-2.5 text-left transition-all',
        isSelected
          ? 'border-primary bg-primary/8 shadow-sm ring-1 ring-primary/10'
          : 'border-muted-foreground/30 bg-background hover:border-primary/40 hover:bg-accent/20'
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-dashed border-current/30 bg-muted/70">
        <Settings2 className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold leading-tight">
          {t('profileEditor.customEndpoint')}
        </div>
      </div>
    </button>
  );
}

/** Model search result item */
function ModelSearchItem({
  model,
  onClick,
  showAge,
}: {
  model: CategorizedModel;
  onClick: () => void;
  showAge?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
    >
      <span className="flex-1 truncate">{model.name}</span>
      <span className="text-muted-foreground group-hover:text-accent-foreground/80 ml-2 flex items-center gap-2 text-xs">
        {showAge && model.created && (
          <Badge
            variant="outline"
            className="text-[10px] text-accent group-hover:text-accent-foreground/80 group-hover:border-accent-foreground/30"
          >
            {formatModelAge(model.created)}
          </Badge>
        )}
        {model.isFree ? (
          <Badge
            variant="secondary"
            className="text-xs group-hover:bg-accent-foreground/20 group-hover:text-accent-foreground"
          >
            {t('profileCreateDialog.free')}
          </Badge>
        ) : (
          <span>{formatPricingPair(model.pricing)}</span>
        )}
        <span>{formatContextLength(model.context_length)}</span>
      </span>
    </button>
  );
}
