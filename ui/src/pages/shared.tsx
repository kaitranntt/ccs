import { type ReactNode, lazy, Suspense, useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAccounts } from '@/hooks/use-accounts';
import {
  type SharedSummary,
  useSharedItemContent,
  useSharedItems,
  useSharedSummary,
} from '@/hooks/use-shared';
import { cn } from '@/lib/utils';
import '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  AlertTriangle,
  Bot,
  Box,
  FileJson,
  FileText,
  FolderOpen,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react';

type TabType = 'commands' | 'skills' | 'agents' | 'plugins' | 'settings';

const CodeEditor = lazy(() =>
  import('@/components/shared/code-editor').then((m) => ({ default: m.CodeEditor }))
);

export function SharedPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabType>('commands');
  const [hasUserSelectedTab, setHasUserSelectedTab] = useState(false);
  const tabLabels: Record<TabType, string> = {
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

  const tabs: { id: TabType; label: string; icon: typeof FileText; count: number | string }[] = [
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
                setTab(nextTab as TabType);
                setQuery('');
                setSelectedItemPath(null);
              }}
            >
              <TabsList className="h-auto flex-wrap justify-start">
                {tabs.map((t) => (
                  <TabsTrigger key={t.id} value={t.id} className="flex items-center gap-2">
                    <t.icon className="w-4 h-4" />
                    <span>{t.label}</span>
                    <span className="text-xs text-muted-foreground">({t.count})</span>
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
            <div className="border-b lg:border-b-0 lg:border-r flex flex-col bg-muted/30 lg:min-h-0">
              <div className="p-4 border-b bg-background space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FolderOpen className="w-4 h-4 text-primary shrink-0" />
                    <h2 className="font-semibold truncate">{tabLabels[activeTab]}</h2>
                  </div>
                  {showListStatus && (
                    <Badge variant="outline" className="text-[10px] h-5">
                      {currentVisibleCount}/{currentItemCount}
                    </Badge>
                  )}
                </div>

                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t('sharedPage.filterPlaceholder', { tab: activeTab })}
                    aria-label={t('sharedPage.filterPlaceholder', { tab: activeTab })}
                    className="pl-8 h-9"
                  />
                </div>

                {showListStatus && (
                  <p className="text-xs text-muted-foreground">
                    {t('sharedPage.showing', {
                      visible: currentVisibleCount,
                      total: currentItemCount,
                      tab: activeTab,
                    })}
                    {activeQuery ? t('sharedPage.showingQuery', { query: activeQuery }) : ''}
                    {isFetching ? t('sharedPage.refreshing') : ''}
                  </p>
                )}
              </div>

              <ScrollArea className="max-h-[360px] lg:max-h-none lg:flex-1 lg:min-h-0">
                {activeTab === 'settings' ? (
                  <div className="p-2 space-y-1">
                    <button
                      type="button"
                      onClick={() => setSelectedItemPath('settings.json')}
                      className={cn(
                        'w-full text-left p-3 rounded-md border transition-colors',
                        summary?.settings
                          ? 'bg-primary/10 border-primary/30'
                          : 'bg-background hover:bg-muted border-transparent opacity-50'
                      )}
                      disabled={!summary?.settings}
                    >
                      <p className="text-sm font-medium truncate">settings.json</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {t('sharedPage.settingsDescription')}
                      </p>
                      <Badge
                        variant={summary?.settings ? 'default' : 'secondary'}
                        className="mt-2 text-[10px]"
                      >
                        {summary?.settings
                          ? t('sharedPage.settingsActive')
                          : t('sharedPage.settingsInactive')}
                      </Badge>
                    </button>
                  </div>
                ) : isLoading ? (
                  <div className="p-4 text-sm text-muted-foreground">
                    {t('sharedPage.loadingShared', { tab: activeTab })}
                  </div>
                ) : isError ? (
                  <div className="p-4 text-center">
                    <div className="space-y-3 py-8">
                      <AlertCircle className="w-10 h-10 mx-auto text-destructive/50" />
                      <div>
                        <p className="text-sm font-medium">
                          {t('sharedPage.failedLoadShared', { tab: activeTab })}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">{itemsErrorMessage}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          void refetch();
                        }}
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        {t('sharedPage.retry')}
                      </Button>
                    </div>
                  </div>
                ) : hasNoItems ? (
                  <div className="p-4 text-sm text-muted-foreground leading-relaxed">
                    {emptyStateMessage}
                  </div>
                ) : hasNoMatches ? (
                  <div className="p-4 text-sm text-muted-foreground">
                    {t('sharedPage.noMatch', { tab: activeTab, query: activeQuery })}
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {filteredItems.map((item) => (
                      <button
                        key={`${item.type}:${item.path}`}
                        type="button"
                        onClick={() => setSelectedItemPath(item.path)}
                        className={cn(
                          'w-full text-left p-3 rounded-md border transition-colors',
                          selectedItem?.path === item.path
                            ? 'bg-primary/10 border-primary/30'
                            : 'bg-background hover:bg-muted border-transparent'
                        )}
                      >
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {item.description}
                        </p>
                        <p className="text-[11px] text-muted-foreground/90 mt-2 font-mono truncate">
                          {formatSharedItemPath(item.path)}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            <div className="min-w-0 min-h-[360px] flex flex-col bg-muted/20 lg:min-h-0">
              {!selectedItem && activeTab !== 'settings' ? (
                <div className="min-h-[320px] flex items-center justify-center p-6 text-center text-muted-foreground">
                  {t('sharedPage.selectOne', { tab: activeTab.slice(0, -1) })}
                </div>
              ) : activeTab === 'settings' ? (
                <>
                  <div className="px-4 py-3 border-b bg-background">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold truncate">settings.json</h2>
                      <Badge variant="outline" className="uppercase text-[10px]">
                        {t('sharedPage.settings')}
                      </Badge>
                    </div>
                  </div>

                  <div className="p-4 space-y-4 min-h-0 flex-1 flex flex-col">
                    <div className="rounded-md border bg-muted/35 p-3">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        <MetadataField
                          label={t('sharedPage.settingsTitle')}
                          value={t('sharedPage.settingsDescription')}
                        />
                        {selectedItemContent?.contentPath ? (
                          <MetadataField
                            label={t('sharedPage.resolvedSource')}
                            value={selectedItemContent.contentPath}
                            mono
                          />
                        ) : null}
                      </div>
                    </div>

                    <Card className="min-h-0 flex-1">
                      <CardContent className="p-0 h-full">
                        <ScrollArea className="h-full px-5 py-4">
                          {!summary?.settings ? (
                            <div className="min-h-[260px] flex flex-col items-center justify-center text-center">
                              <FileJson className="w-12 h-12 text-muted-foreground/40 mb-4" />
                              <h3 className="text-lg font-semibold">
                                {t('sharedPage.settingsTitle')}
                              </h3>
                              <p className="text-sm text-muted-foreground max-w-md mt-2">
                                {t('sharedPage.settingsDescription')}
                              </p>
                              <div className="mt-6 p-3 rounded-md bg-muted/50 border font-mono text-xs">
                                {t('sharedPage.settingsInactive')}
                              </div>
                            </div>
                          ) : isContentLoading ? (
                            <p className="text-sm text-muted-foreground">
                              {t('sharedPage.loadingSettings')}
                            </p>
                          ) : isContentError ? (
                            <Alert variant="destructive" className="max-w-2xl">
                              <AlertTriangle className="h-4 w-4" />
                              <AlertTitle>{t('sharedPage.failedLoadContent')}</AlertTitle>
                              <AlertDescription>
                                <p>{contentErrorMessage}</p>
                                <div className="mt-3">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      void refetchContent();
                                    }}
                                  >
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                    {t('sharedPage.retryContent')}
                                  </Button>
                                </div>
                              </AlertDescription>
                            </Alert>
                          ) : (
                            <Suspense
                              fallback={
                                <div className="flex h-[320px] items-center justify-center text-muted-foreground">
                                  <RefreshCw className="w-5 h-5 animate-spin" />
                                </div>
                              }
                            >
                              <CodeEditor
                                value={selectedItemContent?.content ?? ''}
                                onChange={() => {}}
                                language="json"
                                readonly
                                minHeight="320px"
                              />
                            </Suspense>
                          )}
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  </div>
                </>
              ) : selectedItem ? (
                <>
                  <div className="px-4 py-3 border-b bg-background">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold truncate">{selectedItem.name}</h2>
                      <Badge variant="outline" className="uppercase text-[10px]">
                        {selectedItem.type}
                      </Badge>
                    </div>
                  </div>

                  <div className="p-4 space-y-4 min-h-0 flex-1 flex flex-col">
                    <div className="rounded-md border bg-muted/35 p-3">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        <MetadataField
                          label={t('sharedPage.pathLabel')}
                          value={formatSharedItemPath(selectedItem.path)}
                          mono
                        />
                        {selectedItemContent?.contentPath &&
                          selectedItemContent.contentPath !== selectedItem.path && (
                            <MetadataField
                              label={t('sharedPage.resolvedSource')}
                              value={selectedItemContent.contentPath}
                              mono
                            />
                          )}
                      </div>
                    </div>

                    <Card className="min-h-0 flex-1">
                      <CardContent className="p-0 h-full">
                        <ScrollArea className="h-full px-5 py-4">
                          {isContentLoading ? (
                            <p className="text-sm text-muted-foreground">
                              {t('sharedPage.loadingMarkdown')}
                            </p>
                          ) : isContentError ? (
                            <Alert variant="destructive" className="max-w-2xl">
                              <AlertTriangle className="h-4 w-4" />
                              <AlertTitle>{t('sharedPage.failedLoadContent')}</AlertTitle>
                              <AlertDescription>
                                <p>{contentErrorMessage}</p>
                                <div className="mt-3">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      void refetchContent();
                                    }}
                                  >
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                    {t('sharedPage.retryContent')}
                                  </Button>
                                </div>
                              </AlertDescription>
                            </Alert>
                          ) : (
                            <MarkdownViewer content={selectedItemContent?.content ?? ''} />
                          )}
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getPreferredInitialTab(summary: SharedSummary): TabType {
  if (summary.commands > 0) {
    return 'commands';
  }
  if (summary.skills > 0) {
    return 'skills';
  }
  if (summary.agents > 0) {
    return 'agents';
  }
  if (summary.plugins > 0) {
    return 'plugins';
  }
  if (summary.settings) {
    return 'settings';
  }

  return 'commands';
}

function ResourcePoliciesPanel({
  sharedCount,
  profileLocalCount,
  profileLocalNames,
}: {
  sharedCount: number;
  profileLocalCount: number;
  profileLocalNames: string[];
}) {
  const { t } = useTranslation();
  const displayedProfileLocalNames = profileLocalNames.slice(0, 4);
  const hiddenProfileLocalCount = Math.max(
    profileLocalNames.length - displayedProfileLocalNames.length,
    0
  );

  return (
    <div className="rounded-md border bg-muted/25 px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t('sharedPage.resourcePolicies')}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t('sharedPage.resourcePoliciesDescription')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="border-emerald-300/60 bg-emerald-50/50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300"
          >
            {t('sharedPage.sharedAccounts', { count: sharedCount })}
          </Badge>
          <Badge variant="secondary">
            {t('sharedPage.profileLocalAccounts', { count: profileLocalCount })}
          </Badge>
          {displayedProfileLocalNames.map((name) => (
            <Badge key={name} variant="outline" className="font-mono text-[10px]">
              {name}
            </Badge>
          ))}
          {hiddenProfileLocalCount > 0 ? (
            <Badge variant="outline" className="text-[10px]">
              {t('sharedPage.moreProfileLocalAccounts', { count: hiddenProfileLocalCount })}
            </Badge>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function HeaderMetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold leading-tight mt-1">{value}</p>
    </div>
  );
}

function MetadataField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('text-xs mt-1 break-words', mono ? 'font-mono' : 'text-sm')}>{value}</p>
    </div>
  );
}

function getSharedErrorMessage(error: unknown, fallbackMessage: string): string {
  if (!(error instanceof Error)) {
    return fallbackMessage;
  }

  const normalized = error.message.toLowerCase();
  if (normalized.includes('failed to fetch') || normalized.includes('network')) {
    // TODO i18n: missing key for connection lost message
    return 'Connection to dashboard server lost or restarting. Keep `ccs config` running, then retry.';
  }

  return error.message || fallbackMessage;
}

function formatSharedItemPath(itemPath: string): string {
  return itemPath.startsWith('plugin-registry:') ? 'installed_plugins.json' : itemPath;
}

interface MarkdownBlockHeading {
  type: 'heading';
  level: number;
  text: string;
}

interface MarkdownBlockParagraph {
  type: 'paragraph';
  text: string;
}

interface MarkdownBlockUnorderedList {
  type: 'unordered-list';
  items: string[];
}

interface MarkdownBlockOrderedList {
  type: 'ordered-list';
  items: string[];
}

interface MarkdownBlockCode {
  type: 'code';
  language: string;
  content: string;
}

type MarkdownBlock =
  | MarkdownBlockHeading
  | MarkdownBlockParagraph
  | MarkdownBlockUnorderedList
  | MarkdownBlockOrderedList
  | MarkdownBlockCode;

interface MarkdownFrontmatterEntry {
  key: string;
  value: string;
}

interface ParsedMarkdownDocument {
  blocks: MarkdownBlock[];
  frontmatter: MarkdownFrontmatterEntry[];
}

function MarkdownViewer({ content }: { content: string }) {
  const { t } = useTranslation();
  const parsedDocument = useMemo(() => parseMarkdownDocument(content), [content]);

  if (parsedDocument.blocks.length === 0 && parsedDocument.frontmatter.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('sharedPage.noMarkdown')}</p>;
  }

  return (
    <div className="space-y-5">
      {parsedDocument.frontmatter.length > 0 ? (
        <div className="rounded-md border bg-muted/35 p-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {parsedDocument.frontmatter.map((entry) => (
              <div key={`${entry.key}:${entry.value}`} className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {formatFrontmatterLabel(entry.key)}
                </p>
                <p className="text-xs mt-1 break-words">{entry.value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {parsedDocument.blocks.map((block, index) => {
        if (block.type === 'heading') {
          const headingClass =
            block.level <= 1
              ? 'text-xl font-semibold'
              : block.level === 2
                ? 'text-lg font-semibold'
                : 'text-base font-semibold';

          return (
            <h3 key={`heading-${index}`} className={headingClass}>
              {renderInlineMarkdown(block.text, `heading-${index}`)}
            </h3>
          );
        }

        if (block.type === 'paragraph') {
          return (
            <p key={`paragraph-${index}`} className="text-sm leading-6 whitespace-pre-wrap">
              {renderInlineMarkdown(block.text, `paragraph-${index}`)}
            </p>
          );
        }

        if (block.type === 'unordered-list') {
          return (
            <ul key={`ul-${index}`} className="list-disc pl-5 space-y-1 text-sm leading-6">
              {block.items.map((item, itemIndex) => (
                <li key={`ul-item-${index}-${itemIndex}`}>
                  {renderInlineMarkdown(item, `ul-item-${index}-${itemIndex}`)}
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === 'ordered-list') {
          return (
            <ol key={`ol-${index}`} className="list-decimal pl-5 space-y-1 text-sm leading-6">
              {block.items.map((item, itemIndex) => (
                <li key={`ol-item-${index}-${itemIndex}`}>
                  {renderInlineMarkdown(item, `ol-item-${index}-${itemIndex}`)}
                </li>
              ))}
            </ol>
          );
        }

        return (
          <div
            key={`code-${index}`}
            className="rounded-md border bg-muted/60 p-3 font-mono text-xs leading-5 overflow-x-auto"
          >
            {block.language && (
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
                {block.language}
              </div>
            )}
            <pre className="whitespace-pre-wrap break-words m-0">{block.content}</pre>
          </div>
        );
      })}
    </div>
  );
}

function formatFrontmatterLabel(key: string): string {
  return key.replace(/[-_]/g, ' ');
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const inlinePattern = /(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\))/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let tokenIndex = 0;

  for (const match of text.matchAll(inlinePattern)) {
    const fullMatch = match[0];
    const offset = match.index ?? 0;

    if (offset > cursor) {
      nodes.push(text.slice(cursor, offset));
    }

    if (match[2]) {
      nodes.push(
        <strong key={`${keyPrefix}-strong-${tokenIndex}`} className="font-semibold">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      nodes.push(
        <code
          key={`${keyPrefix}-code-${tokenIndex}`}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.82em]"
        >
          {match[3]}
        </code>
      );
    } else if (match[4]) {
      nodes.push(
        <em key={`${keyPrefix}-em-${tokenIndex}`} className="italic">
          {match[4]}
        </em>
      );
    } else if (match[5] && match[6]) {
      const href = match[6].trim();
      if (/^(https?:\/\/|mailto:)/i.test(href)) {
        nodes.push(
          <a
            key={`${keyPrefix}-link-${tokenIndex}`}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2 hover:opacity-90"
          >
            {match[5]}
          </a>
        );
      } else {
        nodes.push(match[5]);
      }
    } else {
      nodes.push(fullMatch);
    }

    cursor = offset + fullMatch.length;
    tokenIndex += 1;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  if (nodes.length === 0) {
    return [text];
  }

  return nodes;
}

function parseMarkdownDocument(content: string): ParsedMarkdownDocument {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return { blocks: [], frontmatter: [] };
  }

  let markdownBody = normalized;
  const frontmatter: MarkdownFrontmatterEntry[] = [];

  if (markdownBody.startsWith('---\n')) {
    const frontmatterEndIndex = markdownBody.indexOf('\n---\n', 4);
    if (frontmatterEndIndex !== -1) {
      const rawFrontmatter = markdownBody.slice(4, frontmatterEndIndex).trim();
      for (const line of rawFrontmatter.split('\n')) {
        const entryMatch = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.+)$/);
        if (!entryMatch) {
          continue;
        }

        frontmatter.push({
          key: entryMatch[1],
          value: entryMatch[2].trim().replace(/^['"]|['"]$/g, ''),
        });
      }

      markdownBody = markdownBody.slice(frontmatterEndIndex + 5).trim();
    }
  }

  return {
    blocks: parseMarkdownBlocks(markdownBody),
    frontmatter,
  };
}

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  if (!content.trim()) {
    return [];
  }

  const lines = content.split('\n');
  const blocks: MarkdownBlock[] = [];
  let paragraphLines: string[] = [];
  let unorderedItems: string[] = [];
  let orderedItems: string[] = [];
  let codeLanguage = '';
  let codeLines: string[] | null = null;

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }
    blocks.push({
      type: 'paragraph',
      text: paragraphLines.join(' '),
    });
    paragraphLines = [];
  };

  const flushUnorderedList = () => {
    if (unorderedItems.length === 0) {
      return;
    }
    blocks.push({
      type: 'unordered-list',
      items: unorderedItems,
    });
    unorderedItems = [];
  };

  const flushOrderedList = () => {
    if (orderedItems.length === 0) {
      return;
    }
    blocks.push({
      type: 'ordered-list',
      items: orderedItems,
    });
    orderedItems = [];
  };

  const flushCodeBlock = () => {
    if (!codeLines) {
      return;
    }
    blocks.push({
      type: 'code',
      language: codeLanguage,
      content: codeLines.join('\n'),
    });
    codeLanguage = '';
    codeLines = null;
  };

  for (const line of lines) {
    if (codeLines) {
      if (line.trim().startsWith('```')) {
        flushCodeBlock();
      } else {
        codeLines.push(line);
      }
      continue;
    }

    if (line.trim().startsWith('```')) {
      flushParagraph();
      flushUnorderedList();
      flushOrderedList();
      codeLanguage = line.trim().replace(/^```/, '').trim();
      codeLines = [];
      continue;
    }

    if (line.trim().length === 0) {
      flushParagraph();
      flushUnorderedList();
      flushOrderedList();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushUnorderedList();
      flushOrderedList();
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      continue;
    }

    const unorderedMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (unorderedMatch) {
      flushParagraph();
      flushOrderedList();
      unorderedItems.push(unorderedMatch[1].trim());
      continue;
    }

    const orderedMatch = line.match(/^\s*\d+\.\s+(.*)$/);
    if (orderedMatch) {
      flushParagraph();
      flushUnorderedList();
      orderedItems.push(orderedMatch[1].trim());
      continue;
    }

    flushUnorderedList();
    flushOrderedList();
    paragraphLines.push(line.trim());
  }

  flushParagraph();
  flushUnorderedList();
  flushOrderedList();
  flushCodeBlock();
  return blocks;
}
