/**
 * Provider Model Selector Component
 * Per-provider model selection using model-catalog.ts
 * Includes tier badges, broken/deprecated status indicators
 */

import { useMemo } from 'react';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Skeleton } from '@/components/ui/skeleton';
import type { CliproxyProviderRoutingHints } from '@/lib/api-client';
import type { CodexEffort, CodexServiceTier } from '@/lib/codex-effort';
import {
  getCodexEffortDisplay,
  getCodexEffortVariants,
  parseCodexServiceTier,
} from '@/lib/codex-effort';
import { getResolvedCatalogModels, getSupplementalCatalogModels } from '@/lib/model-catalogs';
import { cn } from '@/lib/utils';

/** Model entry from catalog */
export interface ModelEntry {
  id: string;
  name: string;
  tier?: 'free' | 'paid';
  description?: string;
  broken?: boolean;
  issueUrl?: string;
  deprecated?: boolean;
  deprecationReason?: string;
  /** Whether model supports 1M extended context window */
  extendedContext?: boolean;
  /** Optional preset mapping for different tiers (if different from id) */
  presetMapping?: {
    default: string;
    opus: string;
    sonnet: string;
    haiku: string;
  };
  /** Highest codex reasoning-effort suffix this model supports in the dashboard UI. */
  codexMaxEffort?: CodexEffort;
  /** Additional Codex service-tier suffixes supported by this model in the dashboard UI. */
  codexServiceTiers?: CodexServiceTier[];
}

/** Provider catalog */
export interface ProviderCatalog {
  provider: string;
  displayName: string;
  models: ModelEntry[];
  defaultModel: string;
}

interface ProviderModelSelectorProps {
  /** Provider catalog data */
  catalog: ProviderCatalog | undefined;
  /** Loading state */
  isLoading?: boolean;
  /** Currently selected model */
  value: string | undefined;
  /** Callback when model changes */
  onChange: (model: string) => void;
  /** Disabled state */
  disabled?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Custom className */
  className?: string;
}

function PaidBadge({ label }: { label: string }) {
  return (
    <Badge variant="outline" className="text-[9px] h-4 px-1">
      {label}
    </Badge>
  );
}

function StatusBadges({
  model,
  brokenLabel,
  deprecatedLabel,
}: {
  model: Pick<ModelEntry, 'broken' | 'deprecated'>;
  brokenLabel: string;
  deprecatedLabel: string;
}) {
  return (
    <>
      {model.broken && (
        <Badge variant="destructive" className="text-[9px] h-4 px-1">
          {brokenLabel}
        </Badge>
      )}
      {model.deprecated && (
        <Badge variant="secondary" className="text-[9px] h-4 px-1">
          {deprecatedLabel}
        </Badge>
      )}
    </>
  );
}

function CodexEffortBadge({ modelId }: { modelId: string | undefined }) {
  const codexEffort = getCodexEffortDisplay(modelId);
  if (!codexEffort) return null;

  return (
    <Badge
      variant={codexEffort.explicit ? 'secondary' : 'outline'}
      className="text-[9px] h-4 px-1 uppercase"
    >
      {codexEffort.label}
    </Badge>
  );
}

function CodexServiceTierBadge({ modelId }: { modelId: string | undefined }) {
  const serviceTier = parseCodexServiceTier(modelId);
  if (!serviceTier) return null;

  return (
    <Badge variant="secondary" className="text-[9px] h-4 px-1 uppercase">
      {serviceTier}
    </Badge>
  );
}

export function ProviderModelSelector({
  catalog,
  isLoading,
  value,
  onChange,
  disabled,
  placeholder,
  className,
}: ProviderModelSelectorProps) {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t('providerModelSelector.selectModel');

  const groupedModels = useMemo(() => {
    if (!catalog?.models) return { free: [], paid: [] };
    return {
      free: catalog.models.filter((model) => !model.tier || model.tier === 'free'),
      paid: catalog.models.filter((model) => model.tier === 'paid'),
    };
  }, [catalog]);

  const selectedModel = useMemo(
    () => catalog?.models.find((model) => model.id === value),
    [catalog, value]
  );

  if (isLoading) {
    return <Skeleton className={cn('h-9 w-full', className)} />;
  }

  if (!catalog || catalog.models.length === 0) {
    return (
      <div className={cn('py-2 text-sm text-muted-foreground', className)}>
        {t('providerModelSelector.noModelsForProvider')}
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <SearchableSelect
        value={value || undefined}
        onChange={onChange}
        disabled={disabled}
        placeholder={resolvedPlaceholder}
        searchPlaceholder={t('searchableSelect.searchModels')}
        emptyText={t('searchableSelect.noResults')}
        groups={[
          {
            key: 'free',
            label: (
              <span className="text-xs text-muted-foreground">
                {t('providerModelSelector.freeTier')}
              </span>
            ),
          },
          {
            key: 'paid',
            label: (
              <span className="text-xs text-amber-600">{t('providerModelSelector.paidTier')}</span>
            ),
          },
        ]}
        options={[...groupedModels.free, ...groupedModels.paid].map((model) => ({
          value: model.id,
          groupKey: model.tier === 'paid' ? 'paid' : 'free',
          searchText: `${model.name} ${model.id}`,
          keywords: [model.tier ?? 'free'],
          triggerContent: (
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate">{model.name}</span>
              {model.tier === 'paid' && <PaidBadge label={t('providerModelSelector.paid')} />}
            </div>
          ),
          itemContent: (
            <div
              className={cn(
                'flex min-w-0 items-center gap-2',
                (model.broken || model.deprecated) && 'opacity-60'
              )}
            >
              <span className="truncate">{model.name}</span>
              <StatusBadges
                model={model}
                brokenLabel={t('providerModelSelector.broken')}
                deprecatedLabel={t('providerModelSelector.deprecated')}
              />
            </div>
          ),
        }))}
      />

      {selectedModel?.broken && (
        <div className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-md p-2 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <p className="font-medium">{t('providerModelSelector.modelKnownIssues')}</p>
            {selectedModel.issueUrl && (
              <a
                href={selectedModel.issueUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:no-underline"
              >
                {t('providerModelSelector.viewIssueDetails')}
              </a>
            )}
          </div>
        </div>
      )}

      {selectedModel?.deprecated && (
        <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-2 text-xs text-amber-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <p className="font-medium">{t('providerModelSelector.modelDeprecated')}</p>
            {selectedModel.deprecationReason && (
              <p className="opacity-80">{selectedModel.deprecationReason}</p>
            )}
          </div>
        </div>
      )}

      {selectedModel?.description && !selectedModel.broken && !selectedModel.deprecated && (
        <p className="text-xs text-muted-foreground">{selectedModel.description}</p>
      )}
    </div>
  );
}

/** Model Mapping Selector - For Opus/Sonnet/Haiku mapping */
interface ModelMappingSelectorProps {
  catalog: ProviderCatalog | undefined;
  label: string;
  value: string | undefined;
  onChange: (model: string) => void;
  disabled?: boolean;
}

export function ModelMappingSelector({
  catalog,
  label,
  value,
  onChange,
  disabled,
}: ModelMappingSelectorProps) {
  const { t } = useTranslation();
  if (!catalog) return null;

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <SearchableSelect
        value={value || undefined}
        onChange={onChange}
        disabled={disabled}
        placeholder={t('providerModelSelector.selectModel')}
        searchPlaceholder={t('searchableSelect.searchModels')}
        emptyText={t('searchableSelect.noResults')}
        triggerClassName="h-8 text-sm"
        options={catalog.models.map((model) => ({
          value: model.id,
          searchText: `${model.name} ${model.id}`,
          triggerContent: <span className="truncate font-mono text-xs">{model.id}</span>,
          itemContent: (
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm">{model.name}</span>
              {model.tier === 'paid' && <PaidBadge label={t('providerModelSelector.paid')} />}
            </div>
          ),
        }))}
      />
    </div>
  );
}

/** Flexible Model Selector - Combines catalog recommendations with full model list */
interface FlexibleModelSelectorProps {
  label: string;
  description?: string;
  value: string | undefined;
  onChange: (model: string) => void;
  catalog?: ProviderCatalog;
  allModels: { id: string; owned_by: string }[];
  routing?: CliproxyProviderRoutingHints;
  disabled?: boolean;
}

function normalizeModelValue(
  value: string | undefined,
  routing?: CliproxyProviderRoutingHints
): string {
  if (!value) return '';
  if (!routing?.prefix) return value;
  const prefix = `${routing.prefix}/`;
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function getPreferredOptionValue(
  modelId: string,
  routingHint: CliproxyProviderRoutingHints['models'][number] | undefined
): string {
  return routingHint?.recommendedModelId ?? modelId;
}

function getModelOptionValues(
  codexMaxEffort: CodexEffort | undefined,
  codexServiceTiers: readonly CodexServiceTier[] | undefined,
  optionValue: string,
  isCodexProvider: boolean
): string[] {
  return isCodexProvider
    ? getCodexEffortVariants(optionValue, codexMaxEffort, codexServiceTiers)
    : [optionValue];
}

export function FlexibleModelSelector({
  label,
  description,
  value,
  onChange,
  catalog,
  allModels,
  routing,
  disabled,
}: FlexibleModelSelectorProps) {
  const { t } = useTranslation();
  const isCodexProvider = catalog?.provider === 'codex';
  const resolvedCatalogModels = useMemo(
    () => getResolvedCatalogModels(catalog, allModels),
    [allModels, catalog]
  );
  const supplementalModels = useMemo(
    () => getSupplementalCatalogModels(catalog?.provider ?? '', catalog, allModels),
    [allModels, catalog]
  );
  const catalogModelIds = new Set(resolvedCatalogModels.map((model) => model.id));
  const routingHints = useMemo(
    () =>
      new Map((routing?.models ?? []).map((hint) => [hint.modelId.toLowerCase(), hint] as const)),
    [routing]
  );
  const recommendedOptionValues = useMemo(
    () =>
      new Set(
        resolvedCatalogModels.flatMap((model) =>
          getModelOptionValues(
            model.codexMaxEffort,
            model.codexServiceTiers,
            getPreferredOptionValue(model.id, routingHints.get(model.id.toLowerCase())),
            isCodexProvider
          )
        )
      ),
    [isCodexProvider, resolvedCatalogModels, routingHints]
  );
  const selectedRoutingHint = useMemo(
    () => routingHints.get(normalizeModelValue(value, routing).toLowerCase()),
    [routing, routingHints, value]
  );

  const recommendedOptions = resolvedCatalogModels.flatMap((model) => {
    const routingHint = routingHints.get(model.id.toLowerCase());
    const optionValues = getModelOptionValues(
      model.codexMaxEffort,
      model.codexServiceTiers,
      getPreferredOptionValue(model.id, routingHint),
      isCodexProvider
    );

    return optionValues.map((optionValue) => ({
      value: optionValue,
      groupKey: 'recommended',
      searchText: `${optionValue} ${model.id} ${model.name} ${routingHint?.recommendedModelId ?? ''}`,
      keywords: [model.tier ?? '', catalog?.provider ?? ''],
      triggerContent: (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-xs">{optionValue}</span>
          {routingHint?.pinnedAvailable ? (
            <Badge variant="secondary" className="text-[9px] h-4 px-1 uppercase">
              {routingHint.prefix}
            </Badge>
          ) : null}
          {isCodexProvider && <CodexEffortBadge modelId={optionValue} />}
          {isCodexProvider && <CodexServiceTierBadge modelId={optionValue} />}
        </div>
      ),
      itemContent: (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-xs">{optionValue}</span>
          {model.tier === 'paid' && <PaidBadge label={t('providerModelSelector.paid')} />}
          {routingHint?.unprefixedStatus === 'shadowed' ? (
            <Badge variant="outline" className="text-[9px] h-4 px-1">
              {t('providerModelSelector.shadowed')}
            </Badge>
          ) : null}
          {routingHint?.unprefixedStatus === 'prefix-only' ? (
            <Badge variant="outline" className="text-[9px] h-4 px-1">
              {t('providerModelSelector.prefixOnly')}
            </Badge>
          ) : null}
          {isCodexProvider && <CodexEffortBadge modelId={optionValue} />}
          {isCodexProvider && <CodexServiceTierBadge modelId={optionValue} />}
        </div>
      ),
    }));
  });

  const allModelOptions = supplementalModels
    .filter((model) => !catalogModelIds.has(model.id))
    .filter(
      (model) =>
        !recommendedOptionValues.has(
          getPreferredOptionValue(model.id, routingHints.get(model.id.toLowerCase()))
        )
    )
    .flatMap((model) => {
      const routingHint = routingHints.get(model.id.toLowerCase());
      const optionValues = getModelOptionValues(
        undefined,
        undefined,
        getPreferredOptionValue(model.id, routingHint),
        isCodexProvider
      );

      return optionValues.map((optionValue) => ({
        value: optionValue,
        groupKey: 'all',
        searchText: `${optionValue} ${model.id} ${routingHint?.recommendedModelId ?? ''}`,
        keywords: [model.owned_by],
        triggerContent: (
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-mono text-xs">{optionValue}</span>
            {routingHint?.pinnedAvailable ? (
              <Badge variant="secondary" className="text-[9px] h-4 px-1 uppercase">
                {routingHint.prefix}
              </Badge>
            ) : null}
            {isCodexProvider && <CodexEffortBadge modelId={optionValue} />}
            {isCodexProvider && <CodexServiceTierBadge modelId={optionValue} />}
          </div>
        ),
        itemContent: (
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-mono text-xs">{optionValue}</span>
            {routingHint?.unprefixedStatus === 'shadowed' ? (
              <Badge variant="outline" className="text-[9px] h-4 px-1">
                {t('providerModelSelector.shadowed')}
              </Badge>
            ) : null}
            {routingHint?.unprefixedStatus === 'prefix-only' ? (
              <Badge variant="outline" className="text-[9px] h-4 px-1">
                {t('providerModelSelector.prefixOnly')}
              </Badge>
            ) : null}
            {isCodexProvider && <CodexEffortBadge modelId={optionValue} />}
            {isCodexProvider && <CodexServiceTierBadge modelId={optionValue} />}
          </div>
        ),
      }));
    });
  const selectedValueMissing =
    Boolean(value) &&
    !recommendedOptions.some((option) => option.value === value) &&
    !allModelOptions.some((option) => option.value === value);
  const legacySelectedOption = value
    ? {
        value,
        groupKey: 'current',
        searchText: value,
        triggerContent: (
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-mono text-xs">{value}</span>
            <Badge variant="outline" className="text-[9px] h-4 px-1">
              {t('providerModelSelector.current')}
            </Badge>
          </div>
        ),
        itemContent: (
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-mono text-xs">{value}</span>
            <Badge variant="outline" className="text-[9px] h-4 px-1">
              {t('providerModelSelector.current')}
            </Badge>
          </div>
        ),
      }
    : null;
  const hasAvailableModels = recommendedOptions.length + allModelOptions.length > 0;

  return (
    <div className="space-y-1.5">
      <div>
        <label className="text-xs font-medium">{label}</label>
        {description && <p className="text-[10px] text-muted-foreground">{description}</p>}
      </div>
      <SearchableSelect
        value={value || undefined}
        onChange={onChange}
        disabled={disabled}
        placeholder={t('providerModelSelector.selectModel')}
        searchPlaceholder={t('searchableSelect.searchModels')}
        emptyText={
          hasAvailableModels
            ? t('searchableSelect.noResults')
            : t('providerModelSelector.noModelsAvailable')
        }
        triggerClassName="h-9"
        groups={[
          ...(selectedValueMissing && legacySelectedOption
            ? [
                {
                  key: 'current',
                  label: (
                    <span className="text-xs text-muted-foreground">
                      {t('providerModelSelector.currentValue')}
                    </span>
                  ),
                },
              ]
            : []),
          {
            key: 'recommended',
            label: (
              <span className="text-xs text-primary">{t('providerModelSelector.recommended')}</span>
            ),
          },
          ...(allModelOptions.length > 0
            ? [
                {
                  key: 'all',
                  label: (
                    <span className="text-xs text-muted-foreground">
                      {t('providerModelSelector.allModelsCount', {
                        count: allModelOptions.length,
                      })}
                    </span>
                  ),
                },
              ]
            : []),
        ]}
        options={[
          ...(selectedValueMissing && legacySelectedOption ? [legacySelectedOption] : []),
          ...recommendedOptions,
          ...allModelOptions,
        ]}
      />
      {selectedRoutingHint ? (
        <div
          className={cn(
            'rounded-md border px-2.5 py-2 text-[11px]',
            selectedRoutingHint.unprefixedStatus === 'safe'
              ? 'border-border/70 bg-muted/25 text-muted-foreground'
              : 'border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/25 dark:text-amber-100'
          )}
        >
          <div className="font-medium">
            {selectedRoutingHint.pinnedAvailable
              ? t('providerModelSelector.preferredPinnedModel')
              : t('providerModelSelector.pinnedRouteStatus')}{' '}
            <code>
              {selectedRoutingHint.pinnedAvailable
                ? selectedRoutingHint.recommendedModelId
                : selectedRoutingHint.pinnedModelId}
            </code>
          </div>
          <p className="mt-1 leading-5">{selectedRoutingHint.summary}</p>
        </div>
      ) : null}
      {value && !selectedRoutingHint && normalizeModelValue(value, routing) !== value ? (
        <div className="rounded-md border border-amber-300/60 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/25 dark:text-amber-100">
          {t('providerModelSelector.pinnedModelNotAdvertised', { model: value })}
        </div>
      ) : null}
    </div>
  );
}
