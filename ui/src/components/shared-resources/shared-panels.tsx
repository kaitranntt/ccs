import { lazy, Suspense } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { SharedItem } from '@/hooks/use-shared';

interface SharedItemContent {
  content: string;
  contentPath: string;
}
import { cn } from '@/lib/utils';
import { AlertCircle, AlertTriangle, FileJson, FolderOpen, RefreshCw, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MarkdownViewer } from './markdown-viewer';
import { type SharedTabType, formatSharedItemPath, getSharedItemSourceMeta } from './shared-utils';

const CodeEditor = lazy(() =>
  import('@/components/shared/code-editor').then((m) => ({ default: m.CodeEditor }))
);

export function ResourcePoliciesPanel({
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

export function HeaderMetricCard({ label, value }: { label: string; value: number }) {
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

export function SharedItemsSidebar({
  activeTab,
  tabLabel,
  query,
  activeQuery,
  onQueryChange,
  showListStatus,
  currentVisibleCount,
  currentItemCount,
  isFetching,
  summarySettings,
  isLoading,
  isError,
  itemsErrorMessage,
  hasNoItems,
  hasNoMatches,
  emptyStateMessage,
  filteredItems,
  selectedItem,
  onSelectItem,
  onRetry,
}: {
  activeTab: SharedTabType;
  tabLabel: string;
  query: string;
  activeQuery: string;
  onQueryChange: (value: string) => void;
  showListStatus: boolean;
  currentVisibleCount: number;
  currentItemCount: number;
  isFetching: boolean;
  summarySettings: boolean;
  isLoading: boolean;
  isError: boolean;
  itemsErrorMessage: string;
  hasNoItems: boolean;
  hasNoMatches: boolean;
  emptyStateMessage: string;
  filteredItems: SharedItem[];
  selectedItem: SharedItem | null;
  onSelectItem: (path: string) => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="border-b lg:border-b-0 lg:border-r flex flex-col bg-muted/30 lg:min-h-0">
      <div className="p-4 border-b bg-background space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FolderOpen className="w-4 h-4 text-primary shrink-0" />
            <h2 className="font-semibold truncate">{tabLabel}</h2>
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
            onChange={(event) => onQueryChange(event.target.value)}
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
              onClick={() => onSelectItem('settings.json')}
              className={cn(
                'w-full text-left p-3 rounded-md border transition-colors',
                summarySettings
                  ? 'bg-primary/10 border-primary/30'
                  : 'bg-background hover:bg-muted border-transparent opacity-50'
              )}
              disabled={!summarySettings}
            >
              <p className="text-sm font-medium truncate">settings.json</p>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {t('sharedPage.settingsDescription')}
              </p>
              <Badge
                variant={summarySettings ? 'default' : 'secondary'}
                className="mt-2 text-[10px]"
              >
                {summarySettings
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
              <Button size="sm" variant="outline" onClick={onRetry}>
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
            {filteredItems.map((item) => {
              const sourceMeta = getSharedItemSourceMeta(item.source, t);

              return (
                <button
                  key={`${item.type}:${item.path}`}
                  type="button"
                  onClick={() => onSelectItem(item.path)}
                  className={cn(
                    'w-full text-left p-3 rounded-md border transition-colors',
                    selectedItem?.path === item.path
                      ? 'bg-primary/10 border-primary/30'
                      : 'bg-background hover:bg-muted border-transparent'
                  )}
                >
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <p className="text-sm font-medium truncate min-w-0">{item.name}</p>
                    {sourceMeta ? (
                      <Badge
                        variant="outline"
                        className={cn('shrink-0 text-[10px] px-1.5 py-0', sourceMeta.className)}
                      >
                        {sourceMeta.label}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {item.description}
                  </p>
                  <p className="text-[11px] text-muted-foreground/90 mt-2 font-mono truncate">
                    {formatSharedItemPath(item.path)}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function ContentErrorAlert({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation();

  return (
    <Alert variant="destructive" className="max-w-2xl">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{t('sharedPage.failedLoadContent')}</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        <div className="mt-3">
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw className="w-4 h-4 mr-2" />
            {t('sharedPage.retryContent')}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

export function SharedSettingsDetailPanel({
  summarySettings,
  selectedItemContent,
  isContentLoading,
  isContentError,
  contentErrorMessage,
  onRetryContent,
}: {
  summarySettings: boolean;
  selectedItemContent?: SharedItemContent;
  isContentLoading: boolean;
  isContentError: boolean;
  contentErrorMessage: string;
  onRetryContent: () => void;
}) {
  const { t } = useTranslation();

  return (
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
              {!summarySettings ? (
                <div className="min-h-[260px] flex flex-col items-center justify-center text-center">
                  <FileJson className="w-12 h-12 text-muted-foreground/40 mb-4" />
                  <h3 className="text-lg font-semibold">{t('sharedPage.settingsTitle')}</h3>
                  <p className="text-sm text-muted-foreground max-w-md mt-2">
                    {t('sharedPage.settingsDescription')}
                  </p>
                  <div className="mt-6 p-3 rounded-md bg-muted/50 border font-mono text-xs">
                    {t('sharedPage.settingsInactive')}
                  </div>
                </div>
              ) : isContentLoading ? (
                <p className="text-sm text-muted-foreground">{t('sharedPage.loadingSettings')}</p>
              ) : isContentError ? (
                <ContentErrorAlert message={contentErrorMessage} onRetry={onRetryContent} />
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
  );
}

export function SharedMarkdownDetailPanel({
  selectedItem,
  selectedItemContent,
  isContentLoading,
  isContentError,
  contentErrorMessage,
  onRetryContent,
}: {
  selectedItem: SharedItem;
  selectedItemContent?: SharedItemContent;
  isContentLoading: boolean;
  isContentError: boolean;
  contentErrorMessage: string;
  onRetryContent: () => void;
}) {
  const { t } = useTranslation();
  const sourceMeta = getSharedItemSourceMeta(selectedItem.source, t);

  return (
    <>
      <div className="px-4 py-3 border-b bg-background">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-base font-semibold truncate">{selectedItem.name}</h2>
          <Badge variant="outline" className="uppercase text-[10px] shrink-0">
            {selectedItem.type}
          </Badge>
          {sourceMeta ? (
            <Badge variant="outline" className={cn('text-[10px] shrink-0', sourceMeta.className)}>
              {sourceMeta.label}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="p-4 space-y-4 min-h-0 flex-1 flex flex-col">
        <div className="rounded-md border bg-muted/35 p-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sourceMeta ? (
              <MetadataField label={t('sharedPage.sourceLabel')} value={sourceMeta.label} />
            ) : null}
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
                <p className="text-sm text-muted-foreground">{t('sharedPage.loadingMarkdown')}</p>
              ) : isContentError ? (
                <ContentErrorAlert message={contentErrorMessage} onRetry={onRetryContent} />
              ) : (
                <MarkdownViewer content={selectedItemContent?.content ?? ''} />
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
