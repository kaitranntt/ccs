/**
 * Variant Creation Step
 */

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getAccountIdentityPresentation, getCodexIdentityBadge } from '@/lib/account-identity';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, User } from 'lucide-react';
import { cn, isDeniedAgyModelId } from '@/lib/utils';
import { PRIVACY_BLUR_CLASS } from '@/contexts/privacy-context';
import { MODEL_CATALOGS } from '@/lib/model-catalogs';
import type { VariantStepProps } from '../types';
import { useTranslation } from 'react-i18next';

const CUSTOM_MODEL_VALUE = '__custom__';

export function VariantStep({
  selectedProvider,
  catalog,
  selectedAccount,
  variantName,
  modelName,
  isPending,
  privacyMode,
  onVariantNameChange,
  onModelChange,
  onBack,
  onSkip,
  onCreate,
}: VariantStepProps) {
  const { t } = useTranslation();
  // Track if user selected custom model option
  const resolvedCatalog = catalog || MODEL_CATALOGS[selectedProvider];
  const catalogModels = resolvedCatalog?.models || [];
  const isCustomModel = modelName && !catalogModels.some((m) => m.id === modelName);
  const [showCustomInput, setShowCustomInput] = useState(isCustomModel);
  const deniedCustomModel =
    selectedProvider === 'agy' && modelName.trim().length > 0
      ? isDeniedAgyModelId(modelName)
      : false;
  const selectedAccountIdentity = selectedAccount
    ? getAccountIdentityPresentation(
        selectedAccount.id,
        selectedAccount.email,
        selectedAccount.tokenFile
      )
    : null;
  const selectedCodexBadge =
    selectedProvider === 'codex' && selectedAccountIdentity
      ? getCodexIdentityBadge(selectedAccountIdentity)
      : null;

  const handleModelSelect = (value: string) => {
    if (value === CUSTOM_MODEL_VALUE) {
      setShowCustomInput(true);
      onModelChange(''); // Clear to let user type custom
    } else {
      setShowCustomInput(false);
      onModelChange(value);
    }
  };

  return (
    <div className="space-y-4">
      {selectedAccount && (
        <div className="flex min-w-0 items-start gap-2 rounded-md bg-muted/50 p-2 text-sm">
          <User className="w-4 h-4 shrink-0" />
          <div className="min-w-0 space-y-1">
            <span>
              {t('setupVariant.using')}{' '}
              <span className={cn('break-all', privacyMode && PRIVACY_BLUR_CLASS)}>
                {selectedAccountIdentity?.email}
              </span>
            </span>
            {(selectedAccountIdentity?.audienceLabel || selectedAccountIdentity?.detailLabel) && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {selectedCodexBadge?.label ? (
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px] h-4 px-1.5 border-transparent',
                      selectedCodexBadge.audience === 'business'
                        ? 'bg-sky-500/12 text-sky-700 dark:text-sky-300'
                        : selectedCodexBadge.audience === 'free'
                          ? 'bg-slate-200/70 text-slate-700 dark:bg-slate-700/40 dark:text-slate-200'
                          : 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                    )}
                  >
                    {selectedCodexBadge.label}
                  </Badge>
                ) : selectedAccountIdentity?.audienceLabel ? (
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px] h-4 px-1.5 border-transparent',
                      selectedAccountIdentity.audience === 'business'
                        ? 'bg-sky-500/12 text-sky-700 dark:text-sky-300'
                        : selectedAccountIdentity.audience === 'free'
                          ? 'bg-slate-200/70 text-slate-700 dark:bg-slate-700/40 dark:text-slate-200'
                          : 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                    )}
                  >
                    {selectedAccountIdentity.audienceLabel}
                  </Badge>
                ) : null}
                {!selectedCodexBadge?.label && selectedAccountIdentity?.detailLabel && (
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                    {selectedAccountIdentity.detailLabel}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="variant-name">{t('setupVariant.variantNameRequired')}</Label>
        <Input
          id="variant-name"
          value={variantName}
          onChange={(e) => onVariantNameChange(e.target.value)}
          placeholder={t('setupVariant.variantNamePlaceholder')}
        />
        <div className="text-xs text-muted-foreground">
          {t('setupVariant.invokeHintPrefix')} ccs {variantName || '<name>'} "prompt"
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t('setupVariant.model')}</Label>
        {showCustomInput ? (
          <div className="space-y-2">
            <Input
              value={modelName}
              onChange={(e) => onModelChange(e.target.value)}
              placeholder={t('setupVariant.modelPlaceholder')}
            />
            {deniedCustomModel && (
              <p className="text-xs text-destructive">{t('providerEditor.agyDenylist')}</p>
            )}
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => {
                setShowCustomInput(false);
                if (selectedProvider === 'agy' && isDeniedAgyModelId(modelName)) {
                  onModelChange('');
                }
              }}
            >
              {t('setupVariant.choosePresetInstead')}
            </button>
          </div>
        ) : (
          <Select
            value={catalogModels.some((m) => m.id === modelName) ? modelName : ''}
            onValueChange={handleModelSelect}
          >
            <SelectTrigger className="min-w-0">
              <SelectValue placeholder={t('setupVariant.selectModel')} />
            </SelectTrigger>
            <SelectContent className="max-w-[calc(100vw-2rem)]">
              {catalogModels.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{m.name}</span>
                    {m.description && (
                      <span className="truncate text-xs text-muted-foreground">
                        - {m.description}
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM_MODEL_VALUE}>
                <span className="text-primary">{t('setupVariant.customModelName')}</span>
              </SelectItem>
            </SelectContent>
          </Select>
        )}
        <div className="text-xs text-muted-foreground">
          {showCustomInput
            ? t('setupVariant.enterAnyModel')
            : t('setupVariant.defaultModel', {
                model: resolvedCatalog?.defaultModel || t('setupVariant.providerDefault'),
              })}
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" onClick={onBack} className="justify-start">
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('setupVariant.back')}
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          <Button variant="ghost" onClick={onSkip}>
            {t('setupVariant.skip')}
          </Button>
          <Button onClick={onCreate} disabled={!variantName || isPending || deniedCustomModel}>
            {isPending ? t('setupVariant.creating') : t('setupVariant.createVariant')}
          </Button>
        </div>
      </div>
      <p className="text-xs text-center text-muted-foreground">{t('setupVariant.skipHint')}</p>
    </div>
  );
}
