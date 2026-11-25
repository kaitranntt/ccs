import { Image as ImageIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ImageSectionPanel } from './image-section-panel';
import {
  type ImageProfile,
  currentTargetModeClass,
  currentTargetModeLabel,
  getCoverageRowClass,
  routeSourceLabel,
} from './utils';

export function CoveragePanel({ profiles }: { profiles: ImageProfile[] }) {
  const { t } = useTranslation();

  return (
    <ImageSectionPanel
      tone="slate"
      eyebrow="Audit view"
      title="Coverage"
      description="Read-only routing ledger for the current path."
      icon={<ImageIcon className="h-4 w-4" />}
      meta={<Badge variant="outline">{profiles.length} profiles</Badge>}
    >
      <div className="overflow-hidden rounded-[20px] border border-slate-400/15 bg-background/75 shadow-sm backdrop-blur-sm">
        {profiles.map((profile, index) => (
          <div
            key={`${profile.kind}-${profile.name}`}
            className={cn(
              'grid gap-2 px-3.5 py-2.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center',
              index > 0 && 'border-t border-slate-400/12',
              getCoverageRowClass(index, profile)
            )}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="truncate text-sm font-semibold text-foreground">{profile.name}</div>
                <Badge variant="outline" className="text-[10px]">
                  {profile.kind === 'variant' ? t('cliproxyPage.variant') : t('apiProfiles.title')}
                </Badge>
                <Badge variant="outline" className="font-mono text-[10px] uppercase">
                  {profile.target}
                </Badge>
                {profile.nativeReadPreference && (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/20 bg-emerald-500/10 text-[10px]"
                  >
                    Native
                  </Badge>
                )}
              </div>
              <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                {profile.backendDisplayName || profile.profileModel || 'Native file access'} ·{' '}
                {routeSourceLabel(profile.resolutionSource)}
              </div>
            </div>

            <div className="flex items-center gap-2 md:justify-end">
              {profile.profileModel && (
                <Badge variant="outline" className="font-mono text-[10px]">
                  {profile.profileModel}
                </Badge>
              )}
              <Badge className={cn('border', currentTargetModeClass(profile.currentTargetMode))}>
                {currentTargetModeLabel(profile.currentTargetMode)}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </ImageSectionPanel>
  );
}
