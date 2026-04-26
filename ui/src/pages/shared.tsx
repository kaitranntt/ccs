/**
 * SharedPage - Browser for Claude Code shared items (commands / skills / agents).
 *
 * Archetype: Browser (left list pane + right content viewer)
 * Layout: PageShell > PageHeader (tab nav + metrics) > ConfigLayout (list | viewer)
 *
 * All business logic, parsing, and sub-components are extracted into:
 *   src/components/shared-browser/
 */

import { useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useSharedItemContent, useSharedItems, useSharedSummary } from '@/hooks/use-shared';
import '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { PageShell } from '@/components/page-shell/page-shell';
import { PageHeader } from '@/components/page-shell/page-header';
import { ConfigLayout } from '@/components/config-layout/config-layout';
import {
  SharedTabNav,
  SharedItemList,
  SharedItemViewer,
  type SharedTabType,
} from '@/components/shared-browser';

// ---------------------------------------------------------------------------
// Error message helper
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export function SharedPage() {
  const { t } = useTranslation();

  // --- Tab + filter state ---
  const [tab, setTab] = useState<SharedTabType>('commands');
  const [query, setQuery] = useState('');
  const [selectedItemPath, setSelectedItemPath] = useState<string | null>(null);

  const handleTabChange = (nextTab: SharedTabType) => {
    setTab(nextTab);
    setQuery('');
    setSelectedItemPath(null);
  };

  // --- Data fetching ---
  const {
    data: summary,
    isError: isSummaryError,
    error: summaryError,
    refetch: refetchSummary,
  } = useSharedSummary();

  const { data: items, isLoading, isFetching, isError, error, refetch } = useSharedItems(tab);

  const allItems = items?.items ?? [];
  const normalizedQuery = query.trim().toLowerCase();
  const activeQuery = query.trim();

  // --- Derived filtered list ---
  const filteredItems = useMemo(() => {
    const sourceItems = items?.items ?? [];
    if (!normalizedQuery) return sourceItems;
    return sourceItems.filter((item) =>
      [item.name, item.description, item.path].some((v) =>
        v.toLowerCase().includes(normalizedQuery)
      )
    );
  }, [items, normalizedQuery]);

  // --- Selected item (auto-selects first when path is stale) ---
  const selectedItem = useMemo(() => {
    if (filteredItems.length === 0) return null;
    if (!selectedItemPath) return filteredItems[0];
    return filteredItems.find((item) => item.path === selectedItemPath) ?? filteredItems[0];
  }, [filteredItems, selectedItemPath]);

  // --- Item content ---
  const {
    data: selectedItemContent,
    isLoading: isContentLoading,
    isError: isContentError,
    error: contentError,
    refetch: refetchContent,
  } = useSharedItemContent(tab, selectedItem?.path ?? null);

  // --- Error messages ---
  const summaryErrorMessage = getSharedErrorMessage(
    summaryError,
    'Shared item totals could not be loaded. Listing still works.'
  );
  const itemsErrorMessage = getSharedErrorMessage(
    error,
    `Unable to fetch shared ${tab}. Please try again.`
  );
  const contentErrorMessage = getSharedErrorMessage(
    contentError,
    `Unable to load content for ${selectedItem?.name ?? 'selected item'}.`
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <PageShell>
      {/* ── Header ── */}
      <PageHeader
        title={t('sharedPage.title')}
        description={
          <div className="mt-2 space-y-2">
            <p className="text-sm text-muted-foreground">{t('sharedPage.subtitle')}</p>

            {/* Tab nav + metrics */}
            <SharedTabNav
              tab={tab}
              summary={summary}
              allItemsCount={allItems.length}
              filteredItemsCount={filteredItems.length}
              activeQuery={activeQuery}
              onTabChange={handleTabChange}
            />

            {/* Symlink warning */}
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

            {/* Summary error (non-blocking) */}
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
          </div>
        }
      />

      {/* ── Body: left list + right viewer ── */}
      <ConfigLayout
        left={
          <SharedItemList
            tabLabel={t(`sharedPage.${tab}`)}
            tabId={tab}
            items={allItems}
            filteredItems={filteredItems}
            selectedItem={selectedItem}
            query={query}
            isLoading={isLoading}
            isFetching={isFetching}
            isError={isError}
            errorMessage={itemsErrorMessage}
            onQueryChange={setQuery}
            onSelectItem={setSelectedItemPath}
            onRetry={() => {
              void refetch();
            }}
          />
        }
        form={
          <SharedItemViewer
            selectedItem={selectedItem}
            contentPath={selectedItemContent?.contentPath}
            content={selectedItemContent?.content ?? ''}
            isContentLoading={isContentLoading}
            isContentError={isContentError}
            contentErrorMessage={contentErrorMessage}
            tabId={tab}
            onRetryContent={() => {
              void refetchContent();
            }}
          />
        }
      />
    </PageShell>
  );
}
