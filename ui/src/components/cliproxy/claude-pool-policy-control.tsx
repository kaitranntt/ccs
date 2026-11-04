import { useId, useState } from 'react';
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ClaudePoolPolicyAccount } from '@shared/claude-pool-policy';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { usePrivacy, PRIVACY_BLUR_CLASS } from '@/contexts/privacy-context';
import {
  useClaudePoolPolicy,
  useClaudePoolPolicyAccounts,
  useUpdateClaudePoolPolicy,
} from '@/hooks/use-claude-pool-policy';
import { getAccountIdentityPresentation } from '@/lib/account-identity';
import type { OAuthAccount } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface ClaudePoolPolicyControlProps {
  poolEnabled: boolean;
  manageable: boolean;
  compact?: boolean;
}

function observationAge(timestamp: number, language: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  const formatter = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
  if (seconds < 60) return formatter.format(-seconds, 'second');
  if (seconds < 3600) return formatter.format(-Math.floor(seconds / 60), 'minute');
  if (seconds < 86400) return formatter.format(-Math.floor(seconds / 3600), 'hour');
  return formatter.format(-Math.floor(seconds / 86400), 'day');
}

export function ClaudePoolPolicyControl({
  poolEnabled,
  manageable,
  compact = false,
}: ClaudePoolPolicyControlProps) {
  const { t, i18n } = useTranslation();
  const { privacyMode } = usePrivacy();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();
  const query = useClaudePoolPolicy(manageable);
  const accountsQuery = useClaudePoolPolicyAccounts(
    manageable && detailsOpen && Boolean(query.data?.accounts.length)
  );
  const update = useUpdateClaudePoolPolicy();
  const state = query.data;
  const now = query.dataUpdatedAt;
  const enabled = manageable && state?.enabled === true;
  const error = query.error?.message ?? update.error?.message ?? state?.error;
  const status =
    !manageable || query.isError
      ? 'unavailable'
      : query.isLoading
        ? 'loading'
        : state?.status === 'degraded'
          ? 'degraded'
          : state?.status === 'pending'
            ? 'pending'
            : !enabled
              ? 'off'
              : state?.status === 'active' && state.controllerActive
                ? 'active'
                : 'pending';
  const disabled =
    !manageable ||
    query.isLoading ||
    query.isError ||
    !state ||
    update.isPending ||
    (!enabled && !poolEnabled);
  const accountsById = new Map(
    accountsQuery.data?.accounts.map((account) => [account.id, account])
  );
  const textSize = compact ? 'text-[10px]' : 'text-xs';

  return (
    <section aria-label={t('claudePoolPolicy.title')} className={cn('space-y-1.5', textSize)}>
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-2 py-1.5">
        <div className="min-w-0 space-y-0.5">
          <div className="font-medium text-foreground">{t('claudePoolPolicy.title')}</div>
          <div className="text-muted-foreground">{t('claudePoolPolicy.shortOrder')}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {update.isPending ? <RefreshCw aria-hidden className="h-3 w-3 animate-spin" /> : null}
          <Switch
            aria-label={t('claudePoolPolicy.title')}
            checked={enabled}
            disabled={disabled}
            onCheckedChange={(checked) => update.mutate(checked)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-1 px-1">
        <Badge
          variant={status === 'active' ? 'secondary' : 'outline'}
          className={cn(
            status === 'degraded' && 'border-amber-500/50 text-amber-700 dark:text-amber-300'
          )}
        >
          {t(`claudePoolPolicy.status.${status}`)}
        </Badge>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          aria-expanded={detailsOpen}
          aria-controls={detailsId}
          onClick={() => setDetailsOpen((open) => !open)}
        >
          {t(detailsOpen ? 'claudePoolPolicy.hideDetails' : 'claudePoolPolicy.showDetails')}
          {detailsOpen ? (
            <ChevronUp aria-hidden className="h-3 w-3" />
          ) : (
            <ChevronDown aria-hidden className="h-3 w-3" />
          )}
        </button>
      </div>

      {!manageable ? (
        <p className="px-1 text-muted-foreground">{t('claudePoolPolicy.localOnly')}</p>
      ) : null}
      {manageable && !enabled && !poolEnabled ? (
        <p className="px-1 text-muted-foreground">{t('claudePoolPolicy.poolRequired')}</p>
      ) : null}
      {enabled && !state?.controllerActive ? (
        <p role="status" className="px-1 text-muted-foreground">
          {t('claudePoolPolicy.controllerRequired')}
        </p>
      ) : null}
      {error && manageable ? (
        <p
          role="alert"
          className={cn('break-words px-1 text-destructive', privacyMode && PRIVACY_BLUR_CLASS)}
        >
          {error}
        </p>
      ) : null}

      {detailsOpen ? (
        <div
          id={detailsId}
          className="space-y-2 rounded-lg border border-border/60 p-2 leading-relaxed"
        >
          <ol className="list-inside list-decimal text-muted-foreground">
            <li>{t('claudePoolPolicy.class.five-hour-only')}</li>
            <li>{t('claudePoolPolicy.class.five-hour-weekly')}</li>
            <li>{t('claudePoolPolicy.class.weekly-only')}</li>
            <li>{t('claudePoolPolicy.class.unknown')}</li>
          </ol>
          <p className="text-muted-foreground">{t('claudePoolPolicy.modelLimitsIgnored')}</p>
          <p className="text-muted-foreground">{t('claudePoolPolicy.conversations')}</p>
          <p className="text-muted-foreground">{t('claudePoolPolicy.retention')}</p>
          <p className="text-muted-foreground">{t('claudePoolPolicy.restore')}</p>
          {state?.lastReconciledAt !== undefined && state.lastReconciledAt !== null ? (
            <p className="text-muted-foreground">
              {t('claudePoolPolicy.checked', {
                age: observationAge(state.lastReconciledAt, i18n.language, now),
              })}
            </p>
          ) : null}
          {manageable && state?.accounts.length ? (
            <ul
              aria-label={t('claudePoolPolicy.accounts')}
              className="space-y-2 border-t border-border/60 pt-2"
            >
              {state.accounts.map((account) => (
                <PolicyAccountRow
                  key={account.accountId}
                  account={account}
                  metadata={accountsById.get(account.accountId)}
                  privacyMode={privacyMode}
                  now={now}
                />
              ))}
            </ul>
          ) : null}
          {accountsQuery.isError ? (
            <p role="status" className="text-muted-foreground">
              {t('claudePoolPolicy.accountNamesUnavailable')}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function PolicyAccountRow({
  account,
  metadata,
  privacyMode,
  now,
}: {
  account: ClaudePoolPolicyAccount;
  metadata?: OAuthAccount;
  privacyMode: boolean;
  now: number;
}) {
  const { t, i18n } = useTranslation();
  const identity = getAccountIdentityPresentation(
    account.accountId,
    metadata?.email,
    metadata?.tokenFile
  );
  const nickname = metadata?.nickname?.trim();
  const primary = nickname || identity.email || account.accountId;
  const secondary = nickname
    ? [identity.email, identity.inlineLabel].filter(Boolean).join(' · ')
    : identity.inlineLabel;

  return (
    <li className="min-w-0 space-y-0.5">
      <div className="flex flex-wrap items-start justify-between gap-1">
        <span
          className={cn('min-w-0 wrap-anywhere font-medium', privacyMode && PRIVACY_BLUR_CLASS)}
        >
          {primary}
        </span>
        <span className="text-muted-foreground">
          {t(`claudePoolPolicy.accountState.${account.state}`)}
        </span>
      </div>
      {secondary ? (
        <div
          className={cn('wrap-anywhere text-muted-foreground', privacyMode && PRIVACY_BLUR_CLASS)}
        >
          {secondary}
        </div>
      ) : null}
      <div className="text-muted-foreground">{t(`claudePoolPolicy.class.${account.class}`)}</div>
      <div className="text-muted-foreground">
        {account.confirmedAt === null
          ? t('claudePoolPolicy.neverConfirmed')
          : t('claudePoolPolicy.confirmed', {
              age: observationAge(account.confirmedAt, i18n.language, now),
            })}
      </div>
    </li>
  );
}
