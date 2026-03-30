/**
 * Variant Creation Step
 */

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getAccountIdentityPresentation } from '@/lib/account-identity';
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
  const catalogModels = MODEL_CATALOGS[selectedProvider]?.models || [];
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
        <div className="flex items-start gap-2 p-2 bg-muted/50 rounded-md text-sm">
          <User className="w-4 h-4" />
          <div className="space-y-1">
            <span>
              {t('setupVariant.using')}{' '}
              <span className={cn(privacyMode && PRIVACY_BLUR_CLASS)}>
                {selectedAccountIdentity?.email}
              </span>
            </span>
            {(selectedAccountIdentity?.audienceLabel || selectedAccountIdentity?.detailLabel) && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {selectedAccountIdentity?.audienceLabel && (
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px] h-4 px-1.5 border-transparent',
                      selectedAccountIdentity.audience === 'business'
                        ? 'bg-sky-500/12 text-sky-700 dark:text-sky-300'
                        : 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                    )}
                  >
                    {selectedAccountIdentity.audienceLabel}
                  </Badge>
                )}
                {selectedAccountIdentity?.detailLabel && (
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
              <p className="text-xs text-destructive">
                Antigravity denylist: Claude Opus 4.5 and Claude Sonnet 4.5 are deprecated.
              </p>
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
            <SelectTrigger>
              <SelectValue placeholder={t('setupVariant.selectModel')} />
            </SelectTrigger>
            <SelectContent>
              {catalogModels.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  <div className="flex items-center gap-2">
                    <span>{m.name}</span>
                    {m.description && (
                      <span className="text-xs text-muted-foreground">- {m.description}</span>
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
                model:
                  MODEL_CATALOGS[selectedProvider]?.defaultModel ||
                  t('setupVariant.providerDefault'),
              })}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('setupVariant.back')}
        </Button>
        <div className="flex items-center gap-2">
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
