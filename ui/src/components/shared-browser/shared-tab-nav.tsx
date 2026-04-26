/**
 * SharedTabNav - Tab switcher (Commands / Skills / Agents) with per-tab item counts.
 *
 * Renders the <Tabs> control and a row of metric cards (total shared, active tab,
 * visible after filtering). Placed inside PageHeader as a compound header region.
 */

import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bot, FileText, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';

export type SharedTabType = 'commands' | 'skills' | 'agents';

export interface SharedTabMeta {
  id: SharedTabType;
  label: string;
  icon: LucideIcon;
  count: number;
}

interface SharedTabNavProps {
  tab: SharedTabType;
  summary: { commands: number; skills: number; agents: number } | undefined;
  allItemsCount: number;
  filteredItemsCount: number;
  activeQuery: string;
  onTabChange: (tab: SharedTabType) => void;
}

/** Single metric card — label + numeric value. */
function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold leading-tight mt-1">{value}</p>
    </div>
  );
}

export function SharedTabNav({
  tab,
  summary,
  allItemsCount,
  filteredItemsCount,
  activeQuery,
  onTabChange,
}: SharedTabNavProps) {
  const { t } = useTranslation();

  const tabLabels: Record<SharedTabType, string> = {
    commands: t('sharedPage.commands'),
    skills: t('sharedPage.skills'),
    agents: t('sharedPage.agents'),
  };

  const tabs: SharedTabMeta[] = [
    { id: 'commands', label: tabLabels.commands, icon: FileText, count: summary?.commands ?? 0 },
    { id: 'skills', label: tabLabels.skills, icon: Sparkles, count: summary?.skills ?? 0 },
    { id: 'agents', label: tabLabels.agents, icon: Bot, count: summary?.agents ?? 0 },
  ];

  const totalSharedItems = tabs.reduce((sum, t) => sum + t.count, 0);

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between w-full">
      {/* Left: tab switcher */}
      <Tabs value={tab} onValueChange={(next) => onTabChange(next as SharedTabType)}>
        <TabsList className="h-auto flex-wrap justify-start">
          {tabs.map((tabItem) => (
            <TabsTrigger key={tabItem.id} value={tabItem.id} className="flex items-center gap-2">
              <tabItem.icon className="w-4 h-4" />
              <span>{tabItem.label}</span>
              <span className="text-xs text-muted-foreground">({tabItem.count})</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Right: metric cards + active filter badge */}
      <div className="flex flex-col gap-2 lg:items-end">
        <div className="grid w-full gap-2 sm:w-auto sm:min-w-[340px] sm:grid-cols-3">
          <MetricCard label={t('sharedPage.totalShared')} value={totalSharedItems} />
          <MetricCard label={tabLabels[tab]} value={allItemsCount} />
          <MetricCard label={t('sharedPage.visible')} value={filteredItemsCount} />
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Badge variant="secondary">{t('sharedPage.markdownDetail')}</Badge>
          {activeQuery ? (
            <Badge variant="outline">
              {t('sharedPage.filterPrefix')} {activeQuery}
            </Badge>
          ) : null}
        </div>
      </div>
    </div>
  );
}
