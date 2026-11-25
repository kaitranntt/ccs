import { Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ImageSectionPanel } from './image-section-panel';
import {
  type ImageBackend,
  backendStateClass,
  backendStateLabel,
  backendStatusNote,
  getBackendRailClass,
  getBackendRowClass,
} from './utils';

export function BackendRoutesPanel({
  orderedBackendIds,
  backends,
  providerModels,
  saving,
  onProviderModelChange,
  onCommitProviderModel,
}: {
  orderedBackendIds: string[];
  backends: ImageBackend[];
  providerModels: Record<string, string>;
  saving: boolean;
  onProviderModelChange: (backendId: string, value: string) => void;
  onCommitProviderModel: (backendId: string, value: string) => Promise<void>;
}) {
  const { t } = useTranslation();

  return (
    <ImageSectionPanel
      tone="cyan"
      eyebrow="Route inventory"
      title="Backend routes"
      description="Model entry plus route health."
      icon={<Activity className="h-4 w-4" />}
      meta={
        <Badge variant="outline" className="border-cyan-500/25 bg-cyan-500/10 text-[10px]">
          {orderedBackendIds.length} backends
        </Badge>
      }
    >
      <div className="overflow-hidden rounded-[20px] border border-cyan-500/12 bg-background/65 shadow-sm backdrop-blur-sm">
        {orderedBackendIds.map((backendId, index) => {
          const backendStatus = backends.find((item) => item.backendId === backendId);
          const displayName = backendStatus?.displayName || backendId;
          const currentModel = providerModels[backendId] ?? '';
          const statusNote = backendStatusNote(backendStatus);
          const usageLine = currentModel
            ? [
                `${backendStatus?.profilesUsing ?? 0} active`,
                backendStatus?.authReadiness === 'missing'
                  ? 'auth missing'
                  : backendStatus?.proxyReadiness === 'stopped'
                    ? 'starts on launch'
                    : null,
              ]
                .filter(Boolean)
                .join(' · ')
            : 'No model configured.';

          return (
            <div
              key={backendId}
              className={cn(
                'relative px-3 py-3 md:px-4',
                index > 0 && 'border-t border-cyan-500/10',
                getBackendRowClass(backendStatus?.state)
              )}
            >
              <div
                className={cn(
                  'absolute bottom-3 left-0 top-3 w-1 rounded-r-full bg-gradient-to-b',
                  getBackendRailClass(backendStatus?.state)
                )}
              />

              <div className="pl-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-semibold text-foreground">{displayName}</h4>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {backendId}
                      </Badge>
                      {backendStatus?.profilesUsing ? (
                        <Badge
                          variant="outline"
                          className="border-cyan-500/20 bg-cyan-500/10 text-[10px]"
                        >
                          {backendStatus.profilesUsing} active
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                      {usageLine}
                    </p>
                  </div>
                  <Badge
                    className={cn(
                      'border',
                      backendStatus
                        ? backendStateClass(backendStatus.state)
                        : 'border-border/80 bg-background/85 text-muted-foreground'
                    )}
                  >
                    {backendStatus ? backendStateLabel(backendStatus.state) : 'Inactive'}
                  </Badge>
                </div>

                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <Input
                    className="h-10 flex-1 border-cyan-500/15 bg-background/88 text-base"
                    placeholder={t('imageAnalysisSection.setModel', {
                      defaultValue: 'Set model',
                    })}
                    value={currentModel}
                    disabled={saving}
                    onChange={(event) => onProviderModelChange(backendId, event.target.value)}
                    onBlur={(event) => {
                      void onCommitProviderModel(backendId, event.currentTarget.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.currentTarget.blur();
                      }
                    }}
                  />
                  {currentModel.trim().length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-10 sm:self-stretch"
                      disabled={saving}
                      onClick={() => {
                        void onCommitProviderModel(backendId, '');
                      }}
                    >
                      {t('common.clear', { defaultValue: 'Clear' })}
                    </Button>
                  )}
                </div>

                {statusNote && (
                  <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">{statusNote}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </ImageSectionPanel>
  );
}
