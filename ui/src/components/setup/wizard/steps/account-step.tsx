/**
 * Account Selection Step
 */

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, ArrowLeft, User, ExternalLink } from 'lucide-react';
import {
  getAccountDisplayLabels,
  getAccountIdentityPresentation,
  getCodexIdentityBadge,
} from '@/lib/account-identity';
import { cn } from '@/lib/utils';
import { PRIVACY_BLUR_CLASS } from '@/contexts/privacy-context';
import type { AccountStepProps } from '../types';
import { useTranslation } from 'react-i18next';

export function AccountStep({
  accounts,
  privacyMode,
  onSelect,
  onAddNew,
  onBack,
}: AccountStepProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      {/* Existing accounts header */}
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {t('setupWizard.accountStep.selectAccount', { count: accounts.length })}
      </div>

      {/* Scrollable account list with max-height for many accounts */}
      <div className="grid gap-2 max-h-[320px] overflow-y-auto pr-1">
        {accounts.map((acc) => {
          const identity = getAccountIdentityPresentation(acc.id, acc.email, acc.tokenFile);
          const labels = getAccountDisplayLabels(acc.id, acc.email, acc.tokenFile, acc.nickname);
          const codexBadge =
            acc.provider?.toLowerCase() === 'codex' ? getCodexIdentityBadge(identity) : null;
          return (
            <button
              key={acc.id}
              type="button"
              onClick={() => onSelect(acc)}
              className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                  <User className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <div className={cn('font-medium', privacyMode && PRIVACY_BLUR_CLASS)}>
                    {labels.primary}
                  </div>
                  {labels.secondary && (
                    <div
                      className={cn(
                        'text-xs text-muted-foreground break-all',
                        privacyMode && PRIVACY_BLUR_CLASS
                      )}
                    >
                      {labels.secondary}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {codexBadge?.label ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] h-4 px-1.5 border-transparent',
                          privacyMode && PRIVACY_BLUR_CLASS,
                          codexBadge.audience === 'business'
                            ? 'bg-sky-500/12 text-sky-700 dark:text-sky-300'
                            : codexBadge.audience === 'free'
                              ? 'bg-slate-200/70 text-slate-700 dark:bg-slate-700/40 dark:text-slate-200'
                              : 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                        )}
                      >
                        {codexBadge.label}
                      </Badge>
                    ) : identity.audienceLabel ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] h-4 px-1.5 border-transparent',
                          privacyMode && PRIVACY_BLUR_CLASS,
                          identity.audience === 'business'
                            ? 'bg-sky-500/12 text-sky-700 dark:text-sky-300'
                            : identity.audience === 'free'
                              ? 'bg-slate-200/70 text-slate-700 dark:bg-slate-700/40 dark:text-slate-200'
                              : 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                        )}
                      >
                        {identity.audienceLabel}
                      </Badge>
                    ) : null}
                    {!codexBadge?.label && identity.detailLabel && (
                      <Badge
                        variant="outline"
                        className={cn('text-[10px] h-4 px-1.5', privacyMode && PRIVACY_BLUR_CLASS)}
                      >
                        {identity.detailLabel}
                      </Badge>
                    )}
                    {acc.isDefault && (
                      <span className="text-xs text-muted-foreground">
                        {t('setupWizard.accountStep.defaultAccount')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            {t('setupWizard.accountStep.or')}
          </span>
        </div>
      </div>

      {/* Add new account button - more prominent */}
      <button
        type="button"
        className="w-full flex items-center gap-3 p-3 border-2 border-dashed border-primary/50 rounded-lg hover:border-primary hover:bg-primary/5 transition-colors text-left"
        onClick={onAddNew}
      >
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <ExternalLink className="w-4 h-4 text-primary" />
        </div>
        <div>
          <div className="font-medium text-primary">
            {t('setupWizard.accountStep.addNewAccount')}
          </div>
          <div className="text-xs text-muted-foreground">
            {t('setupWizard.accountStep.addNewAccountDesc')}
          </div>
        </div>
      </button>

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('setupWizard.accountStep.back')}
        </Button>
      </div>
    </div>
  );
}
