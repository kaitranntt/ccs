/**
 * Account Selection Step
 */

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, ArrowLeft, User, ExternalLink } from 'lucide-react';
import { getAccountIdentityPresentation } from '@/lib/account-identity';
import { cn } from '@/lib/utils';
import { PRIVACY_BLUR_CLASS } from '@/contexts/privacy-context';
import type { AccountStepProps } from '../types';

export function AccountStep({
  accounts,
  privacyMode,
  onSelect,
  onAddNew,
  onBack,
}: AccountStepProps) {
  return (
    <div className="space-y-4">
      {/* Existing accounts header */}
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Select an account ({accounts.length})
      </div>

      {/* Scrollable account list with max-height for many accounts */}
      <div className="grid gap-2 max-h-[320px] overflow-y-auto pr-1">
        {accounts.map((acc) => {
          const identity = getAccountIdentityPresentation(acc.id, acc.email, acc.tokenFile);
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
                    {identity.email}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {identity.audienceLabel && (
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] h-4 px-1.5 border-transparent',
                          identity.audience === 'business'
                            ? 'bg-sky-500/12 text-sky-700 dark:text-sky-300'
                            : 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                        )}
                      >
                        {identity.audienceLabel}
                      </Badge>
                    )}
                    {identity.detailLabel && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                        {identity.detailLabel}
                      </Badge>
                    )}
                    {acc.isDefault && (
                      <span className="text-xs text-muted-foreground">Default account</span>
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
          <span className="bg-background px-2 text-muted-foreground">Or</span>
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
          <div className="font-medium text-primary">Add new account</div>
          <div className="text-xs text-muted-foreground">Authenticate with a different account</div>
        </div>
      </button>

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
      </div>
    </div>
  );
}
