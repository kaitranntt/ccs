import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';

export function CursorModelSelector({
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
  models: Array<{ id: string; name: string; provider: string }>;
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
