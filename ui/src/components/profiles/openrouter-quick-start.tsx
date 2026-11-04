import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useOpenRouterReady } from '@/hooks/use-openrouter-models';
import { useLocalRuntimeReadiness } from '@/hooks/use-local-runtime-readiness';
import { cn } from '@/lib/utils';
import {
  ArrowRight,
  BrainCircuit,
  CloudCog,
  ExternalLink,
  HardDriveDownload,
  KeyRound,
  Laptop,
  SlidersHorizontal,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface OpenRouterQuickStartProps {
  hasProfiles: boolean;
  profileCount: number;
  onOpenRouterClick: () => void;
  onAlibabaCodingPlanClick: () => void;
  onCliproxyClick: () => void;
  onCustomClick: () => void;
  onOllamaClick: () => void;
  onLlamacppClick: () => void;
}

interface QuickStartCardProps {
  badge: string;
  badgeClassName?: string;
  className?: string;
  title: string;
  description: string;
  visual: ReactNode;
  highlights: Array<{ icon: ReactNode; label: string }>;
  actionLabel: string;
  actionClassName: string;
  onAction: () => void;
  footer?: ReactNode;
}

type LocalRuntimeStatus = 'ready' | 'missing-model' | 'offline';

type LocalRuntimeView = {
  id: 'ollama' | 'llamacpp';
  endpoint: string;
  status: LocalRuntimeStatus;
  commandHint: string;
  detectedModelCount: number;
};

type LocalRuntimeCardState = {
  badge: string;
  badgeClassName: string;
  actionLabel: string;
  description: string;
  footer: string;
};

function QuickStartCard({
  badge,
  badgeClassName,
  className,
  title,
  description,
  visual,
  highlights,
  actionLabel,
  actionClassName,
  onAction,
  footer,
}: QuickStartCardProps) {
  return (
    <Card className={cn('flex h-full flex-col border shadow-sm', className)}>
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-center gap-3">
          {visual}
          <Badge variant="secondary" className={badgeClassName}>
            {badge}
          </Badge>
        </div>
        <div className="space-y-1.5">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription className="text-sm leading-6">{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="mt-auto flex flex-1 flex-col gap-4 pt-0">
        <div className="space-y-2 text-xs text-muted-foreground">
          {highlights.map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              {item.icon}
              <span>{item.label}</span>
            </div>
          ))}
        </div>
        <Button onClick={onAction} className={actionClassName}>
          {actionLabel}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        {footer ? <div className="text-xs text-muted-foreground">{footer}</div> : null}
      </CardContent>
    </Card>
  );
}

function getLocalRuntimeCardState(
  runtime: LocalRuntimeView | undefined,
  label: string,
  t: (key: string, options?: Record<string, unknown>) => string
): LocalRuntimeCardState {
  if (!runtime) {
    return {
      badge: t('openrouterQuickStart.localRuntimeCheckingBadge'),
      badgeClassName: 'bg-muted text-muted-foreground',
      actionLabel: t('openrouterQuickStart.localRuntimeSetupAction', { label }),
      description: t('openrouterQuickStart.localRuntimeCheckingDescription'),
      footer: t('openrouterQuickStart.localRuntimeCheckingFooter'),
    };
  }

  if (runtime.status === 'ready') {
    return {
      badge: t('openrouterQuickStart.localRuntimeReadyBadge'),
      badgeClassName:
        'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200',
      actionLabel: t('openrouterQuickStart.localRuntimeUseAction', { label }),
      description: t('openrouterQuickStart.localRuntimeReadyDescription'),
      footer: t('openrouterQuickStart.localRuntimeReadyFooter', { endpoint: runtime.endpoint }),
    };
  }

  if (runtime.status === 'missing-model') {
    return {
      badge: t('openrouterQuickStart.localRuntimeNeedsModelBadge'),
      badgeClassName: 'bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200',
      actionLabel: t('openrouterQuickStart.localRuntimeFinishAction', { label }),
      description: t('openrouterQuickStart.localRuntimeNeedsModelDescription'),
      footer: t('openrouterQuickStart.localRuntimeMissingModelFooter', {
        command: runtime.commandHint,
      }),
    };
  }

  return {
    badge: t('openrouterQuickStart.localRuntimeOfflineBadge'),
    badgeClassName: 'bg-muted text-muted-foreground',
    actionLabel: t('openrouterQuickStart.localRuntimeSetupAction', { label }),
    description: t('openrouterQuickStart.localRuntimeOfflineDescription'),
    footer: t('openrouterQuickStart.localRuntimeOfflineFooter', {
      command: runtime.commandHint,
    }),
  };
}

export function OpenRouterQuickStart({
  hasProfiles,
  profileCount,
  onOpenRouterClick,
  onAlibabaCodingPlanClick,
  onCliproxyClick,
  onCustomClick,
  onOllamaClick,
  onLlamacppClick,
}: OpenRouterQuickStartProps) {
  const { t } = useTranslation();
  const { modelCount, isLoading } = useOpenRouterReady();
  const { data: localRuntimeData } = useLocalRuntimeReadiness();
  const modelCountLabel = isLoading ? '300+' : `${modelCount}+`;
  const profileSummaryLabel = hasProfiles
    ? t('openrouterQuickStart.profileSummaryCount', { count: profileCount })
    : t('openrouterQuickStart.profileSummaryEmpty');
  const summaryTitle = hasProfiles
    ? t('openrouterQuickStart.summaryExistingTitle')
    : t('openrouterQuickStart.summaryEmptyTitle');
  const summaryDescription = hasProfiles
    ? t('openrouterQuickStart.summaryExistingDescription', { count: profileCount })
    : t('openrouterQuickStart.summaryEmptyDescription');
  const ollamaRuntime = localRuntimeData?.runtimes.find((runtime) => runtime.id === 'ollama');
  const llamacppRuntime = localRuntimeData?.runtimes.find((runtime) => runtime.id === 'llamacpp');
  const ollamaCardState = getLocalRuntimeCardState(
    ollamaRuntime,
    t('openrouterQuickStart.localOllamaLabel'),
    t
  );
  const llamacppCardState = getLocalRuntimeCardState(
    llamacppRuntime,
    t('openrouterQuickStart.localLlamacppLabel'),
    t
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-muted/20 p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <Card className="border-dashed bg-background/90 shadow-sm">
          <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{profileSummaryLabel}</Badge>
                <Badge variant="outline">
                  {t('openrouterQuickStart.summaryBadgeDefaultQuality')}
                </Badge>
                <Badge variant="outline">{t('openrouterQuickStart.summaryBadgeLocalLane')}</Badge>
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold">{summaryTitle}</h2>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  {summaryDescription}
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={onCustomClick} className="shrink-0">
              {t('openrouterQuickStart.createCustomProfile')}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-foreground/70">
              {t('openrouterQuickStart.qualityLanesTitle')}
            </h3>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <QuickStartCard
              badge={t('openrouterQuickStart.recommended')}
              title={t('openrouterQuickStart.title')}
              description={t('openrouterQuickStart.description', { modelCountLabel })}
              visual={
                <div className="rounded-lg bg-accent/10 p-2">
                  <img src="/icons/openrouter.svg" alt="OpenRouter" className="h-5 w-5" />
                </div>
              }
              highlights={[
                {
                  icon: <Zap className="h-3.5 w-3.5 text-accent" />,
                  label: t('openrouterQuickStart.featureOneApi'),
                },
                {
                  icon: <Sparkles className="h-3.5 w-3.5 text-accent" />,
                  label: t('openrouterQuickStart.qualityLaneHighlightDefaultQuality'),
                },
              ]}
              actionLabel={t('openrouterQuickStart.createOpenRouterProfile')}
              actionClassName="w-full bg-accent text-white hover:bg-accent/90"
              onAction={onOpenRouterClick}
              footer={
                <>
                  {t('openrouterQuickStart.getApiKeyAt')}{' '}
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-accent hover:underline"
                  >
                    openrouter.ai/keys
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </>
              }
            />

            <QuickStartCard
              badge={t('alibabaCodingPlanQuickStart.recommended')}
              badgeClassName="bg-orange-500/10 text-orange-700 dark:bg-orange-500/20 dark:text-orange-200"
              title={t('alibabaCodingPlanQuickStart.title')}
              description={t('openrouterQuickStart.alibabaLaneDescription')}
              visual={
                <div className="rounded-lg bg-orange-500/10 p-2">
                  <img
                    src="/assets/providers/alibabacloud-color.svg"
                    alt="QwenCloud Coding Plan"
                    className="h-5 w-5"
                  />
                </div>
              }
              highlights={[
                {
                  icon: <CloudCog className="h-3.5 w-3.5 text-orange-600" />,
                  label: t('alibabaCodingPlanQuickStart.featureEndpoint'),
                },
                {
                  icon: <KeyRound className="h-3.5 w-3.5 text-orange-600" />,
                  label: t('openrouterQuickStart.alibabaLaneHighlightQuality'),
                },
              ]}
              actionLabel={t('alibabaCodingPlanQuickStart.createAlibabaProfile')}
              actionClassName="w-full bg-orange-600 text-white hover:bg-orange-600/90"
              onAction={onAlibabaCodingPlanClick}
              footer={
                <>
                  {t('alibabaCodingPlanQuickStart.readGuideAt')}{' '}
                  <a
                    href="https://docs.qwencloud.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-orange-700 hover:underline dark:text-orange-400"
                  >
                    docs.qwencloud.com
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </>
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Laptop className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-foreground/70">
              {t('openrouterQuickStart.localRuntimesTitle')}
            </h3>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <QuickStartCard
              badge={ollamaCardState.badge}
              badgeClassName={ollamaCardState.badgeClassName}
              title={t('openrouterQuickStart.localOllamaTitle')}
              description={ollamaCardState.description}
              visual={
                <div className="rounded-lg bg-emerald-500/10 p-2">
                  <img src="/icons/ollama.svg" alt="Ollama" className="h-5 w-5" />
                </div>
              }
              highlights={[
                {
                  icon: <HardDriveDownload className="h-3.5 w-3.5 text-emerald-600" />,
                  label: t('openrouterQuickStart.localOllamaHighlight'),
                },
                {
                  icon: <Sparkles className="h-3.5 w-3.5 text-emerald-600" />,
                  label:
                    ollamaRuntime?.detectedModelCount && ollamaRuntime.detectedModelCount > 0
                      ? t('openrouterQuickStart.localDetectedModels', {
                          count: ollamaRuntime.detectedModelCount,
                        })
                      : t('openrouterQuickStart.localNoModelsDetected'),
                },
              ]}
              actionLabel={ollamaCardState.actionLabel}
              actionClassName="w-full bg-emerald-600 text-white hover:bg-emerald-600/90"
              onAction={onOllamaClick}
              footer={<span>{ollamaCardState.footer}</span>}
            />

            <QuickStartCard
              badge={llamacppCardState.badge}
              badgeClassName={llamacppCardState.badgeClassName}
              title={t('openrouterQuickStart.localLlamacppTitle')}
              description={llamacppCardState.description}
              visual={
                <div className="rounded-lg bg-sky-500/10 p-2">
                  <img src="/assets/providers/llama-cpp.svg" alt="llama.cpp" className="h-5 w-5" />
                </div>
              }
              highlights={[
                {
                  icon: <SlidersHorizontal className="h-3.5 w-3.5 text-sky-600" />,
                  label: t('openrouterQuickStart.localLlamacppHighlight'),
                },
                {
                  icon: <Laptop className="h-3.5 w-3.5 text-sky-600" />,
                  label:
                    llamacppRuntime?.detectedModelCount && llamacppRuntime.detectedModelCount > 0
                      ? t('openrouterQuickStart.localDetectedModels', {
                          count: llamacppRuntime.detectedModelCount,
                        })
                      : t('openrouterQuickStart.localWaitingServer'),
                },
              ]}
              actionLabel={llamacppCardState.actionLabel}
              actionClassName="w-full bg-sky-600 text-white hover:bg-sky-600/90"
              onAction={onLlamacppClick}
              footer={<span>{llamacppCardState.footer}</span>}
            />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <QuickStartCard
            badge={t('openrouterQuickStart.runtimeProviderBadge')}
            badgeClassName="bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200"
            title={t('openrouterQuickStart.runtimeProviderTitle')}
            description={t('openrouterQuickStart.runtimeProviderManagedDescription')}
            visual={
              <div className="rounded-lg bg-emerald-500/10 p-2">
                <SlidersHorizontal className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
              </div>
            }
            highlights={[
              {
                icon: <SlidersHorizontal className="h-3.5 w-3.5 text-emerald-600" />,
                label: t('openrouterQuickStart.runtimeProviderFeatureConnectors'),
              },
              {
                icon: <KeyRound className="h-3.5 w-3.5 text-emerald-600" />,
                label: t('openrouterQuickStart.runtimeProviderFeatureSecrets'),
              },
            ]}
            actionLabel={t('openrouterQuickStart.runtimeProviderTitle')}
            actionClassName="w-full bg-emerald-600 text-white hover:bg-emerald-600/90"
            onAction={onCliproxyClick}
            footer={<span>{t('openrouterQuickStart.runtimeProviderFooter')}</span>}
          />
        </div>
      </div>
    </div>
  );
}
