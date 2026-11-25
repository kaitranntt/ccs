import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ImageSectionPanel } from './image-section-panel';
import {
  type ImageProfile,
  currentTargetModeClass,
  currentTargetModeLabel,
  getInsetPanelClass,
} from './utils';

export function NativeReadingPanel({ nativeReadProfiles }: { nativeReadProfiles: ImageProfile[] }) {
  const { t } = useTranslation();

  return (
    <ImageSectionPanel
      tone="emerald"
      eyebrow="Native path"
      title="Native reading"
      description="Profiles that skip the transformer."
      icon={<Sparkles className="h-4 w-4" />}
      meta={<Badge variant="outline">{nativeReadProfiles.length} profiles</Badge>}
    >
      {nativeReadProfiles.length === 0 ? (
        <div
          className={cn(
            'rounded-[18px] border border-dashed px-3.5 py-3.5 text-sm text-muted-foreground',
            getInsetPanelClass('emerald')
          )}
        >
          {t('imageAnalysisSection.noProfilesPreferNative', {
            defaultValue: 'No profiles prefer native reading yet.',
          })}
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {nativeReadProfiles.map((profile) => (
            <div
              key={`native-${profile.kind}-${profile.name}`}
              className={cn(
                'rounded-[18px] border px-3.5 py-3 shadow-sm',
                getInsetPanelClass('emerald')
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {profile.name}
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {profile.kind === 'variant'
                        ? t('cliproxyPage.variant')
                        : t('apiProfiles.title')}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {profile.nativeImageCapable
                        ? t('imageAnalysisStatus.capabilityVerified')
                        : t('imageAnalysisSection.review', {
                            defaultValue: 'Review',
                          })}
                    </Badge>
                  </div>
                  <div className="mt-1 text-[11px] leading-4 text-muted-foreground">
                    {profile.profileModel ||
                      t('imageAnalysisSection.modelNotDetected', {
                        defaultValue: 'Model not detected',
                      })}{' '}
                    ·{' '}
                    {profile.nativeImageReason ||
                      t('imageAnalysisSection.nativeReadPreferred', {
                        defaultValue: 'Native read preferred.',
                      })}
                  </div>
                </div>
                <Badge className={cn('border', currentTargetModeClass(profile.currentTargetMode))}>
                  {currentTargetModeLabel(profile.currentTargetMode)}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </ImageSectionPanel>
  );
}
