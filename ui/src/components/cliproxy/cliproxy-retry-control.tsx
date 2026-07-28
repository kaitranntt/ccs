import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCliproxyRetryConfig, useUpdateCliproxyRetryConfig } from '@/hooks/use-cliproxy';

function parseRetryValue(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function CliproxyRetryControl() {
  const { t } = useTranslation();
  const retryQuery = useCliproxyRetryConfig();
  const updateRetry = useUpdateCliproxyRetryConfig();
  const requestRetry = retryQuery.data?.request_retry ?? 0;
  const maxRetryInterval = retryQuery.data?.max_retry_interval ?? 0;
  const manageable = retryQuery.data?.manageable !== false;
  const disabled =
    retryQuery.isLoading || retryQuery.isError || updateRetry.isPending || !manageable;
  const statusMessage = retryQuery.error?.message ?? retryQuery.data?.message;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-2 py-1.5">
        <div className="min-w-0">
          <div className="text-[10px] font-medium text-foreground">
            {t('routingGuidance.retryTitle')}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {t('routingGuidance.retryHint')}
            {retryQuery.data ? ` · ${retryQuery.data.source} · ${retryQuery.data.target}` : ''}
          </div>
        </div>
        <RetryInputs
          key={`${requestRetry}:${maxRetryInterval}`}
          requestRetry={requestRetry}
          maxRetryInterval={maxRetryInterval}
          disabled={disabled}
          onUpdate={(nextRequestRetry, nextMaxRetryInterval) =>
            updateRetry.mutate({
              request_retry: nextRequestRetry,
              max_retry_interval: nextMaxRetryInterval,
            })
          }
        />
      </div>
      {statusMessage ? (
        <div className="rounded-lg border border-border/60 bg-muted/20 px-2 py-1.5 text-[10px] text-muted-foreground">
          {statusMessage}
        </div>
      ) : null}
    </div>
  );
}

interface RetryInputsProps {
  requestRetry: number;
  maxRetryInterval: number;
  disabled: boolean;
  onUpdate: (requestRetry: number, maxRetryInterval: number) => void;
}

function RetryInputs({ requestRetry, maxRetryInterval, disabled, onUpdate }: RetryInputsProps) {
  const { t } = useTranslation();
  const [requestRetryInput, setRequestRetryInput] = useState(String(requestRetry));
  const [maxRetryIntervalInput, setMaxRetryIntervalInput] = useState(String(maxRetryInterval));
  const [fieldError, setFieldError] = useState<string | null>(null);

  const handleBlur = () => {
    if (disabled) return;
    const nextRequestRetry = parseRetryValue(requestRetryInput.trim());
    const nextMaxRetryInterval = parseRetryValue(maxRetryIntervalInput.trim());
    if (nextRequestRetry === null || nextMaxRetryInterval === null) {
      setFieldError(t('routingGuidance.retryRangeError'));
      setRequestRetryInput(String(requestRetry));
      setMaxRetryIntervalInput(String(maxRetryInterval));
      return;
    }

    setFieldError(null);
    if (nextRequestRetry !== requestRetry || nextMaxRetryInterval !== maxRetryInterval) {
      onUpdate(nextRequestRetry, nextMaxRetryInterval);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <input
          aria-label={t('routingGuidance.requestRetryLabel')}
          inputMode="numeric"
          className="h-6 w-10 rounded border border-border/70 bg-background px-1.5 text-[10px] text-foreground"
          value={requestRetryInput}
          onChange={(event) => setRequestRetryInput(event.target.value)}
          onBlur={handleBlur}
          disabled={disabled}
        />
        <span className="text-[10px] text-muted-foreground">/</span>
        <input
          aria-label={t('routingGuidance.maxRetryIntervalLabel')}
          inputMode="numeric"
          className="h-6 w-10 rounded border border-border/70 bg-background px-1.5 text-[10px] text-foreground"
          value={maxRetryIntervalInput}
          onChange={(event) => setMaxRetryIntervalInput(event.target.value)}
          onBlur={handleBlur}
          disabled={disabled}
        />
      </div>
      {fieldError ? <div className="text-[10px] text-destructive">{fieldError}</div> : null}
    </div>
  );
}
