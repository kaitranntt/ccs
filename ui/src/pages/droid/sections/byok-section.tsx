/**
 * Droid BYOK section — Quick controls + Reasoning controls + BYOK Summary + Custom Models table.
 * Maps to the former "BYOK" tab in the droid monolith.
 */

import { Server } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { FormSection } from '@/components/config-layout';
import { DroidByokReasoningControlsCard } from '@/components/compatible-cli/droid-byok-reasoning-controls-card';
import {
  DroidSettingsQuickControlsCard,
  type DroidQuickSettingsValues,
} from '@/components/compatible-cli/droid-settings-quick-controls-card';
import type { DroidDashboardDiagnostics, DroidCustomModelDiagnostics } from '@/hooks/use-droid';
import type { DroidByokModelView } from '@/lib/droid-byok-custom-models';

// ---- Detail row (matches the one in overview-section, kept local) -----------

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`text-right break-all${mono ? ' font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}

// ---- Props ------------------------------------------------------------------

interface ByokSectionProps {
  diagnostics: DroidDashboardDiagnostics | null | undefined;
  quickSettingsValues: DroidQuickSettingsValues;
  byokModels: DroidByokModelView[];
  rawSettingsLoading: boolean;
  rawEditorParsed:
    | { valid: true; value: Record<string, unknown> }
    | { valid: false; error: string };
  customModels: DroidCustomModelDiagnostics[];
  providerRows: [string, number][];
  onEnumSettingChange: (key: string, value: string | null) => void;
  onBooleanSettingChange: (key: string, value: boolean | null) => void;
  onNumberSettingChange: (key: string, value: number | null) => void;
  onEffortChange: (modelId: string, effort: string | null) => void;
  onAnthropicBudgetChange: (modelId: string, budgetTokens: number | null) => void;
}

// ---- Component --------------------------------------------------------------

export function ByokSection({
  diagnostics,
  quickSettingsValues,
  byokModels,
  rawSettingsLoading,
  rawEditorParsed,
  customModels,
  providerRows,
  onEnumSettingChange,
  onBooleanSettingChange,
  onNumberSettingChange,
  onEffortChange,
  onAnthropicBudgetChange,
}: ByokSectionProps) {
  const { t } = useTranslation();

  const controlsDisabled = rawSettingsLoading || !rawEditorParsed.valid;
  const disabledReason = rawEditorParsed.valid
    ? null
    : `Quick settings disabled: ${rawEditorParsed.error}`;
  const byokDisabledReason = rawEditorParsed.valid
    ? null
    : `${t('droidPage.byok')}: ${rawEditorParsed.error}`;

  return (
    <FormSection id="byok" title={t('droidPage.byok')}>
      <div className="space-y-4">
        {/* Quick controls card */}
        <DroidSettingsQuickControlsCard
          values={quickSettingsValues}
          disabled={controlsDisabled}
          disabledReason={disabledReason}
          onEnumSettingChange={onEnumSettingChange}
          onBooleanSettingChange={onBooleanSettingChange}
          onNumberSettingChange={onNumberSettingChange}
        />

        {/* BYOK reasoning controls card */}
        <DroidByokReasoningControlsCard
          models={byokModels}
          disabled={controlsDisabled}
          disabledReason={byokDisabledReason}
          onEffortChange={onEffortChange}
          onAnthropicBudgetChange={onAnthropicBudgetChange}
        />

        {/* BYOK summary card */}
        {diagnostics && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Server className="h-4 w-4" />
                {t('droidPage.byokSummary')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <DetailRow
                label={t('droidPage.activeModelSelector')}
                value={diagnostics.byok.activeModelSelector || 'Not set'}
                mono
              />
              <DetailRow
                label={t('droidPage.customModels')}
                value={String(diagnostics.byok.customModelCount)}
              />
              <DetailRow
                label={t('droidPage.ccsManaged')}
                value={String(diagnostics.byok.ccsManagedCount)}
              />
              <DetailRow
                label={t('droidPage.userManaged')}
                value={String(diagnostics.byok.userManagedCount)}
              />
              <DetailRow
                label={t('droidPage.malformedEntries')}
                value={String(diagnostics.byok.invalidModelEntryCount)}
              />
              <Separator />
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t('droidPage.providers')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {providerRows.length === 0 && (
                    <Badge variant="secondary" className="font-mono">
                      {t('droidPage.none')}
                    </Badge>
                  )}
                  {providerRows.map(([provider, count]) => (
                    <Badge key={provider} variant="outline" className="font-mono text-xs">
                      {provider}: {count}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Custom models table */}
        {diagnostics && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t('droidPage.customModelsTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-hidden">
                <div className="grid grid-cols-[2fr_1fr_2fr] bg-muted/40 px-3 py-2 text-xs font-medium">
                  <span>{t('droidPage.modelName')}</span>
                  <span>{t('droidPage.provider')}</span>
                  <span>{t('droidPage.baseUrl')}</span>
                </div>
                <ScrollArea className="h-52">
                  <div className="divide-y">
                    {customModels.length === 0 && (
                      <div className="px-3 py-4 text-xs text-muted-foreground">
                        {t('droidPage.noCustomModels')}
                      </div>
                    )}
                    {customModels.map((model) => (
                      <div
                        key={`${model.displayName}-${model.model}-${model.baseUrl}`}
                        className="grid grid-cols-[2fr_1fr_2fr] gap-2 px-3 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate">{model.displayName}</p>
                          <p className="text-muted-foreground font-mono truncate">{model.model}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate">{model.provider}</p>
                          <p className="text-muted-foreground">{model.apiKeyPreview || 'no-key'}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate" title={model.baseUrl}>
                            {model.host || model.baseUrl}
                          </p>
                          <p className="text-muted-foreground font-mono truncate">
                            {model.baseUrl}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </FormSection>
  );
}
