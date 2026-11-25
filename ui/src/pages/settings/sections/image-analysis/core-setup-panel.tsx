import { SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { ImageSectionPanel } from './image-section-panel';
import { NO_BACKEND, getInsetPanelClass } from './utils';

export function CoreSetupPanel({
  enabled,
  timeout,
  fallbackBackend,
  configuredBackendIds,
  completeMappingCount,
  nativeReadCount,
  saving,
  onEnabledChange,
  onTimeoutChange,
  onCommitTimeout,
  onCommitFallbackBackend,
}: {
  enabled: boolean;
  timeout: string;
  fallbackBackend: string;
  configuredBackendIds: string[];
  completeMappingCount: number;
  nativeReadCount: number;
  saving: boolean;
  onEnabledChange: (nextEnabled: boolean) => Promise<void>;
  onTimeoutChange: (nextTimeout: string) => void;
  onCommitTimeout: (nextTimeout: string) => Promise<void>;
  onCommitFallbackBackend: (nextFallback: string) => Promise<void>;
}) {
  const { t } = useTranslation();

  return (
    <ImageSectionPanel
      tone="amber"
      eyebrow="Control deck"
      title="Core setup"
      description={t('settingsPage.imageAnalysisSection.description')}
      icon={<SlidersHorizontal className="h-4 w-4" />}
      meta={
        <Badge variant="outline" className="border-amber-500/25 bg-amber-500/10 text-[10px]">
          {configuredBackendIds.length} configured
        </Badge>
      }
    >
      <div className="grid gap-2 lg:grid-cols-3">
        <div
          className={cn('rounded-[18px] border px-3.5 py-3 shadow-sm', getInsetPanelClass('amber'))}
        >
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700/75 dark:text-amber-300/75">
            Enabled
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="text-sm font-semibold text-foreground">
                {enabled ? 'Transformer on' : 'Transformer off'}
              </div>
              <p className="text-[11px] leading-4 text-muted-foreground">
                Profile flags stay untouched.
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={(checked) => {
                void onEnabledChange(checked);
              }}
              disabled={saving}
            />
          </div>
        </div>

        <div
          className={cn('rounded-[18px] border px-3.5 py-3 shadow-sm', getInsetPanelClass('amber'))}
        >
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700/75 dark:text-amber-300/75">
            Timeout
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <Input
              value={timeout}
              onChange={(event) => onTimeoutChange(event.target.value)}
              inputMode="numeric"
              className="h-10 border-amber-500/15 bg-background/90 text-base"
              disabled={saving}
              onBlur={(event) => {
                void onCommitTimeout(event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur();
                }
              }}
            />
            <span className="text-xs font-medium text-muted-foreground">sec</span>
          </div>
          <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
            Keeps large reads from hanging.
          </p>
        </div>

        <div
          className={cn('rounded-[18px] border px-3.5 py-3 shadow-sm', getInsetPanelClass('amber'))}
        >
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700/75 dark:text-amber-300/75">
            Fallback backend
          </div>
          <div className="mt-2.5">
            <Select
              value={fallbackBackend || NO_BACKEND}
              onValueChange={(value) => {
                void onCommitFallbackBackend(value === NO_BACKEND ? '' : value);
              }}
              disabled={saving}
            >
              <SelectTrigger className="h-10 border-amber-500/15 bg-background/90">
                <SelectValue placeholder={t('settingsPage.thinkingSection.configureModelFirst')} />
              </SelectTrigger>
              <SelectContent>
                {configuredBackendIds.length === 0 ? (
                  <SelectItem value={NO_BACKEND}>
                    {t('settingsPage.thinkingSection.configureModelFirst')}
                  </SelectItem>
                ) : (
                  configuredBackendIds.map((backendId) => (
                    <SelectItem key={backendId} value={backendId}>
                      {backendId}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
            Used when no direct route exists.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <div className="rounded-full border border-amber-500/15 bg-background/80 px-2.5 py-1 text-[11px] text-muted-foreground">
          {completeMappingCount} overrides
        </div>
        <div className="rounded-full border border-amber-500/15 bg-background/80 px-2.5 py-1 text-[11px] text-muted-foreground">
          {nativeReadCount} native
        </div>
        <div className="rounded-full border border-amber-500/15 bg-background/80 px-2.5 py-1 text-[11px] text-muted-foreground">
          {fallbackBackend || 'No fallback'} fallback
        </div>
      </div>
    </ImageSectionPanel>
  );
}
