/**
 * Cursor Model Mapping Section
 * Default, Opus, Sonnet, Haiku model selectors with SearchableSelect.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { FormSection } from '@/components/config-layout';

interface CursorModel {
  id: string;
  name: string;
  provider: string;
}

// ---------------------------------------------------------------------------
// CursorModelSelector — single model picker row
// ---------------------------------------------------------------------------

function CursorModelSelector({
  label,
  description,
  value,
  models,
  disabled,
  allowDefaultFallback = false,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  models: CursorModel[];
  disabled?: boolean;
  allowDefaultFallback?: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const selectorValue = value || (allowDefaultFallback ? '__default' : '');

  const options = useMemo(() => {
    const mappedModels = models.map((model) => ({
      value: model.id,
      groupKey: 'models',
      searchText: `${model.name || model.id} ${model.id}`,
      keywords: [model.provider],
      triggerContent: (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-xs">{model.name || model.id}</span>
          {model.provider && (
            <Badge variant="outline" className="text-[9px] h-4 px-1 capitalize">
              {model.provider}
            </Badge>
          )}
        </div>
      ),
      itemContent: (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-xs font-mono">{model.name || model.id}</span>
          <Badge variant="outline" className="text-[9px] h-4 px-1 capitalize">
            {model.provider}
          </Badge>
        </div>
      ),
    }));

    if (!allowDefaultFallback) return mappedModels;

    return [
      {
        value: '__default',
        groupKey: 'models',
        searchText: t('cursorPage.useDefaultModel'),
        triggerContent: (
          <span className="truncate font-mono text-xs">{t('cursorPage.useDefaultModel')}</span>
        ),
        itemContent: <span>{t('cursorPage.useDefaultModel')}</span>,
      },
      ...mappedModels,
    ];
  }, [allowDefaultFallback, models, t]);

  return (
    <div className="space-y-1.5">
      <div>
        <Label className="text-xs font-medium">{label}</Label>
        <p className="text-[10px] text-muted-foreground">{description}</p>
      </div>
      <SearchableSelect
        value={selectorValue || undefined}
        onChange={(nextValue) => {
          if (allowDefaultFallback && nextValue === '__default') {
            onChange('');
            return;
          }
          onChange(nextValue);
        }}
        disabled={disabled}
        placeholder={t('cursorPage.selectModel')}
        searchPlaceholder={t('searchableSelect.searchModels')}
        emptyText={t('searchableSelect.noResults')}
        triggerClassName="h-9"
        groups={[
          {
            key: 'models',
            label: t('cursorPage.availableModelCount', { count: models.length }),
          },
        ]}
        options={options}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ModelMappingSection
// ---------------------------------------------------------------------------

interface ModelMappingSectionProps {
  models: CursorModel[];
  modelsLoading: boolean;
  effectiveModel: string;
  effectiveOpusModel: string;
  effectiveSonnetModel: string;
  effectiveHaikuModel: string;
  onChangeModel: (value: string) => void;
  onChangeOpusModel: (value: string) => void;
  onChangeSonnetModel: (value: string) => void;
  onChangeHaikuModel: (value: string) => void;
}

export function ModelMappingSection({
  models,
  modelsLoading,
  effectiveModel,
  effectiveOpusModel,
  effectiveSonnetModel,
  effectiveHaikuModel,
  onChangeModel,
  onChangeOpusModel,
  onChangeSonnetModel,
  onChangeHaikuModel,
}: ModelMappingSectionProps) {
  const { t } = useTranslation();

  return (
    <FormSection
      id="model-mapping"
      title={t('cursorPage.modelMapping')}
      description={t('cursorPage.modelMappingDesc')}
    >
      <div className="space-y-4">
        <CursorModelSelector
          label={t('cursorPage.defaultModel')}
          description={t('cursorPage.defaultModelDesc')}
          value={effectiveModel}
          models={models}
          disabled={modelsLoading}
          onChange={onChangeModel}
        />
        <CursorModelSelector
          label={t('cursorPage.opusModel')}
          description={t('cursorPage.opusModelDesc')}
          value={effectiveOpusModel}
          models={models}
          disabled={modelsLoading}
          allowDefaultFallback
          onChange={onChangeOpusModel}
        />
        <CursorModelSelector
          label={t('cursorPage.sonnetModel')}
          description={t('cursorPage.sonnetModelDesc')}
          value={effectiveSonnetModel}
          models={models}
          disabled={modelsLoading}
          allowDefaultFallback
          onChange={onChangeSonnetModel}
        />
        <CursorModelSelector
          label={t('cursorPage.haikuModel')}
          description={t('cursorPage.haikuModelDesc')}
          value={effectiveHaikuModel}
          models={models}
          disabled={modelsLoading}
          allowDefaultFallback
          onChange={onChangeHaikuModel}
        />
      </div>
    </FormSection>
  );
}
