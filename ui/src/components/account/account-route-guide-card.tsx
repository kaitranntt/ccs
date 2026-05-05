import { Link2, Settings2, ShieldCheck, Terminal, UserRoundCheck, Waves } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';

interface AccountRouteGuideCardProps {
  totalAccounts: number;
  isolatedCount: number;
  sharedPeerGroups: string[];
  deeperReadyGroups: string[];
}

type RouteStatus = 'empty' | 'isolated' | 'shared' | 'deeper' | 'mixed';

export function AccountRouteGuideCard({
  totalAccounts,
  isolatedCount,
  sharedPeerGroups,
  deeperReadyGroups,
}: AccountRouteGuideCardProps) {
  const { t } = useTranslation();
  const recommendedGroup = deeperReadyGroups[0] || sharedPeerGroups[0] || 'daily';
  const status: RouteStatus =
    totalAccounts < 2
      ? 'empty'
      : deeperReadyGroups.length > 0
        ? 'deeper'
        : sharedPeerGroups.length > 0
          ? 'shared'
          : totalAccounts >= 2 && isolatedCount === totalAccounts
            ? 'isolated'
            : totalAccounts === 0
              ? 'empty'
              : 'mixed';
  const syncCommand = `ccs auth create work2 --share-context --context-group ${recommendedGroup} --deeper-continuity`;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-lg">{t('accountRouteGuide.title')}</CardTitle>
            <CardDescription>{t('accountRouteGuide.description')}</CardDescription>
          </div>
          <Badge variant={status === 'deeper' ? 'default' : 'secondary'}>
            {t(`accountRouteGuide.status.${status}`)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <section className="rounded-md border bg-blue-50/50 p-3 text-sm dark:bg-blue-900/10">
            <div className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              {t('accountRouteGuide.cards.isolated.title')}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {t('accountRouteGuide.cards.isolated.desc')}
            </p>
          </section>
          <section className="rounded-md border bg-emerald-50/50 p-3 text-sm dark:bg-emerald-900/10">
            <div className="flex items-center gap-2 font-semibold">
              <UserRoundCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              {t('accountRouteGuide.cards.select.title')}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {t('accountRouteGuide.cards.select.desc')}
            </p>
          </section>
          <section className="rounded-md border bg-sky-50/50 p-3 text-sm dark:bg-sky-900/10">
            <div className="flex items-center gap-2 font-semibold">
              <Settings2 className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              {t('accountRouteGuide.cards.settings.title')}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {t('accountRouteGuide.cards.settings.desc')}
            </p>
          </section>
          <section className="rounded-md border bg-indigo-50/50 p-3 text-sm dark:bg-indigo-900/10">
            <div className="flex items-center gap-2 font-semibold">
              <Link2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              {t('accountRouteGuide.cards.sync.title')}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {t('accountRouteGuide.cards.sync.desc')}
            </p>
          </section>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-md border bg-background p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Terminal className="h-3.5 w-3.5" />
              {t('accountRouteGuide.commands.isolated')}
            </div>
            {['ccs auth create work', 'ccs auth create personal', 'ccs work', 'ccs personal'].map(
              (command) => (
                <div
                  key={command}
                  className="mt-2 flex items-start gap-2 rounded-md bg-muted px-2 py-2 font-mono text-[11px]"
                >
                  <span className="flex-1 break-all">{command}</span>
                  <CopyButton value={command} size="icon" />
                </div>
              )
            )}
          </div>
          <div className="rounded-md border bg-background p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Waves className="h-3.5 w-3.5" />
              {t('accountRouteGuide.commands.sync')}
            </div>
            <div className="flex items-start gap-2 rounded-md bg-muted px-2 py-2 font-mono text-[11px]">
              <span className="flex-1 break-all">{syncCommand}</span>
              <CopyButton value={syncCommand} size="icon" />
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {t('accountRouteGuide.commands.syncDesc', { group: recommendedGroup })}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
