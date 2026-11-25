import { useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  HeaderMetricCard,
  ResourcePoliciesPanel,
  SharedItemsSidebar,
  SharedMarkdownDetailPanel,
  SharedSettingsDetailPanel,
} from '@/components/shared-resources/shared-panels';
import {
  type SharedTabType,
  getPreferredInitialTab,
  getSharedErrorMessage,
} from '@/components/shared-resources/shared-utils';
import { useAccounts } from '@/hooks/use-accounts';
import { useSharedItemContent, useSharedItems, useSharedSummary } from '@/hooks/use-shared';
import '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Bot, Box, FileJson, FileText, RefreshCw, Sparkles } from 'lucide-react';

export function SharedPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<SharedTabType>('commands');
  const [hasUserSelectedTab, setHasUserSelectedTab] = useState(false);
  const tabLabels: Record<SharedTabType, string> = {
    commands: t('sharedPage.commands'),
    skills: t('sharedPage.skills'),
    agents: t('sharedPage.agents'),
    plugins: t('sharedPage.plugins'),
    settings: t('sharedPage.settings'),
  };

  const [query, setQuery] = useState('');
  const [selectedItemPath, setSelectedItemPath] = useState<string | null>(null);

  const {
    data: summary,
    isError: isSummaryError,
    error: summaryError,
    refetch: refetchSummary,
  } = useSharedSummary();

  const { data: accountsView } = useAccounts();
  const activeTab = summary && !hasUserSelectedTab ? getPreferredInitialTab(summary) : tab;
  const { data: items, isLoading, isFetching, isError, error, refetch } = useSharedItems(activeTab);
  const allItems = items?.items ?? [];
  const normalizedQuery = query.trim().toLowerCase();
  const activeQuery = query.trim();

  const filteredItems = useMemo(() => {
    const sourceItems = items?.items ?? [];
    if (!normalizedQuery) {
      return sourceItems;
    }

    return sourceItems.filter((item) =>
      [item.name, item.description, item.path].some((value) =>
        value.toLowerCase().includes(normalizedQuery)
      )
    );
  }, [items, normalizedQuery]);

  const selectedItem = useMemo(() => {
    if (filteredItems.length === 0) {
      return null;
    }

    if (!selectedItemPath) {
      return filteredItems[0];
    }

    return filteredItems.find((item) => item.path === selectedItemPath) ?? filteredItems[0];
  }, [filteredItems, selectedItemPath]);

  const contentPath =
    activeTab === 'settings' && summary?.settings ? 'settings.json' : (selectedItem?.path ?? null);
  const {
    data: selectedItemContent,
    isLoading: isContentLoading,
    isError: isContentError,
    error: contentError,
    refetch: refetchContent,
  } = useSharedItemContent(activeTab, contentPath);

  const tabs: {
    id: SharedTabType;
    label: string;
    icon: typeof FileText;
    count: number | string;
  }[] = [
    { id: 'commands', label: tabLabels.commands, icon: FileText, count: summary?.commands ?? 0 },
    { id: 'skills', label: tabLabels.skills, icon: Sparkles, count: summary?.skills ?? 0 },
    { id: 'agents', label: tabLabels.agents, icon: Bot, count: summary?.agents ?? 0 },
    { id: 'plugins', label: tabLabels.plugins, icon: Box, count: summary?.plugins ?? 0 },
    {
      id: 'settings',
      label: tabLabels.settings,
      icon: FileJson,
      count: summary?.settings ? 1 : 0,
    },
  ];
  const totalSharedItems = summary?.total ?? 0;
  const settingsCount = summary?.settings ? 1 : 0;
  const currentItemCount = activeTab === 'settings' ? settingsCount : allItems.length;
  const currentVisibleCount = activeTab === 'settings' ? settingsCount : filteredItems.length;
  const showListStatus = activeTab === 'settings' || (!isLoading && !isError);
  const detailModeLabel =
    activeTab === 'plugins'
      ? t('sharedPage.registryDetail')
      : activeTab === 'settings'
        ? t('sharedPage.maskedSettingsDetail')
        : t('sharedPage.markdownDetail');
  const emptyStateMessage =
    activeTab === 'plugins'
      ? t('sharedPage.noPluginsFound')
      : t('sharedPage.noSharedFound', { tab: activeTab });

  const hasNoItems = !isLoading && !isError && allItems.length === 0;
  const hasNoMatches = !isLoading && !isError && allItems.length > 0 && filteredItems.length === 0;
  const sharedResourceAccounts =
    accountsView?.accounts.filter(
      (account) => (account.shared_resource_mode || 'shared') === 'shared'
    ) ?? [];
  const profileLocalResourceAccounts =
    accountsView?.accounts.filter((account) => account.shared_resource_mode === 'profile-local') ??
    [];

  // TODO i18n: missing key for "Shared item totals could not be loaded. Listing still works."
  const summaryErrorMessage = getSharedErrorMessage(
    summaryError,
    'Shared item totals could not be loaded. Listing still works.'
  );
  const itemsErrorMessage = getSharedErrorMessage(
    error,
    `Unable to fetch shared ${activeTab}. Please try again.`
  );
  const contentErrorMessage = getSharedErrorMessage(
    contentError,
    `Unable to load content for ${selectedItem?.name ?? 'selected item'}.`
  );

  return (
    <div className="h-full overflow-auto lg:overflow-hidden flex flex-col">
      <div className="p-6 pb-4 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div>
              <h1 className="text-2xl font-bold">{t('sharedPage.title')}</h1>
              <p className="text-muted-foreground">{t('sharedPage.subtitle')}</p>
            </div>

            <Tabs
              value={activeTab}
              onValueChange={(nextTab) => {
                setHasUserSelectedTab(true);
                setTab(nextTab as SharedTabType);
                setQuery('');
                setSelectedItemPath(null);
              }}
            >
              <TabsList className="h-auto flex-wrap justify-start">
                {tabs.map((item) => (
                  <TabsTrigger key={item.id} value={item.id} className="flex items-center gap-2">
                    <item.icon className="w-4 h-4" />
                    <span>{item.label}</span>
                    <span className="text-xs text-muted-foreground">({item.count})</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <div className="flex flex-col gap-2 lg:items-end">
            <div className="grid w-full gap-2 sm:w-auto sm:min-w-[340px] sm:grid-cols-3">
              <HeaderMetricCard label={t('sharedPage.totalShared')} value={totalSharedItems} />
              <HeaderMetricCard label={tabLabels[activeTab]} value={currentItemCount} />
              <HeaderMetricCard label={t('sharedPage.visible')} value={currentVisibleCount} />
            </div>

            <div className="flex items-center gap-2 text-xs">
              <Badge variant="secondary">{detailModeLabel}</Badge>
              {activeQuery ? (
                <Badge variant="outline">
                  {t('sharedPage.filterPrefix')} {activeQuery}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        {summary && !summary.symlinkStatus.valid && (
          <Alert variant="warning">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{t('sharedPage.configurationRequired')}</AlertTitle>
            <AlertDescription>
              {/* TODO i18n: missing key for "Run `ccs sync` to configure." */}
              {summary.symlinkStatus.message}. Run `ccs sync` to configure.
            </AlertDescription>
          </Alert>
        )}

        {isSummaryError && (
          <Alert variant="info">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{t('sharedPage.countsUnavailable')}</AlertTitle>
            <AlertDescription>
              <p>{summaryErrorMessage}</p>
              <div className="mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void refetchSummary();
                  }}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  {t('sharedPage.retryCounts')}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {accountsView ? (
          <ResourcePoliciesPanel
            sharedCount={sharedResourceAccounts.length}
            profileLocalCount={profileLocalResourceAccounts.length}
            profileLocalNames={profileLocalResourceAccounts.map((account) => account.name)}
          />
        ) : null}
      </div>

      <div className="px-6 pb-6 lg:flex-1 lg:min-h-0">
        <div className="rounded-lg border overflow-hidden bg-background lg:h-full">
          <div className="grid lg:h-full lg:min-h-0 lg:grid-cols-[320px_minmax(0,1fr)]">
            <SharedItemsSidebar
              activeTab={activeTab}
              tabLabel={tabLabels[activeTab]}
              query={query}
              activeQuery={activeQuery}
              onQueryChange={setQuery}
              showListStatus={showListStatus}
              currentVisibleCount={currentVisibleCount}
              currentItemCount={currentItemCount}
              isFetching={isFetching}
              summarySettings={Boolean(summary?.settings)}
              isLoading={isLoading}
              isError={isError}
              itemsErrorMessage={itemsErrorMessage}
              hasNoItems={hasNoItems}
              hasNoMatches={hasNoMatches}
              emptyStateMessage={emptyStateMessage}
              filteredItems={filteredItems}
              selectedItem={selectedItem}
              onSelectItem={setSelectedItemPath}
              onRetry={() => {
                void refetch();
              }}
            />

            <div className="min-w-0 min-h-[360px] flex flex-col bg-muted/20 lg:min-h-0">
              {!selectedItem && activeTab !== 'settings' ? (
                <div className="min-h-[320px] flex items-center justify-center p-6 text-center text-muted-foreground">
                  {t('sharedPage.selectOne', { tab: activeTab.slice(0, -1) })}
                </div>
              ) : activeTab === 'settings' ? (
                <SharedSettingsDetailPanel
                  summarySettings={Boolean(summary?.settings)}
                  selectedItemContent={selectedItemContent}
                  isContentLoading={isContentLoading}
                  isContentError={isContentError}
                  contentErrorMessage={contentErrorMessage}
                  onRetryContent={() => {
                    void refetchContent();
                  }}
                />
              ) : selectedItem ? (
                <SharedMarkdownDetailPanel
                  selectedItem={selectedItem}
                  selectedItemContent={selectedItemContent}
                  isContentLoading={isContentLoading}
                  isContentError={isContentError}
                  contentErrorMessage={contentErrorMessage}
                  onRetryContent={() => {
                    void refetchContent();
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
