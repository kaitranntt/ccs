/**
 * SharedItemList - Left browser pane for shared items (commands / skills / agents).
 *
 * Renders: search input, item count badge, scroll-able list of selectable items,
 * and loading / error / empty states.
 */

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertCircle, FolderOpen, RefreshCw, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { SharedItem } from '@/hooks/use-shared';

interface SharedItemListProps {
  tabLabel: string;
  tabId: string;
  items: SharedItem[];
  filteredItems: SharedItem[];
  selectedItem: SharedItem | null;
  query: string;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  errorMessage: string;
  onQueryChange: (q: string) => void;
  onSelectItem: (path: string) => void;
  onRetry: () => void;
}

export function SharedItemList({
  tabLabel,
  tabId,
  items,
  filteredItems,
  selectedItem,
  query,
  isLoading,
  isFetching,
  isError,
  errorMessage,
  onQueryChange,
  onSelectItem,
  onRetry,
}: SharedItemListProps) {
  const { t } = useTranslation();
  const activeQuery = query.trim();
  const hasNoItems = !isLoading && !isError && items.length === 0;
  const hasNoMatches = !isLoading && !isError && items.length > 0 && filteredItems.length === 0;

  return (
    <div className="flex h-full flex-col bg-muted/30">
      {/* Pane header */}
      <div className="border-b bg-background p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FolderOpen className="w-4 h-4 text-primary shrink-0" />
            <h2 className="font-semibold truncate">{tabLabel}</h2>
          </div>
          {!isLoading && !isError && (
            <Badge variant="outline" className="text-[10px] h-5">
              {filteredItems.length}/{items.length}
            </Badge>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t('sharedPage.filterPlaceholder', { tab: tabId })}
            aria-label={t('sharedPage.filterPlaceholder', { tab: tabId })}
            className="pl-8 h-9"
          />
        </div>

        {!isLoading && !isError && (
          <p className="text-xs text-muted-foreground">
            {t('sharedPage.showing', {
              visible: filteredItems.length,
              total: items.length,
              tab: tabId,
            })}
            {activeQuery ? t('sharedPage.showingQuery', { query: activeQuery }) : ''}
            {isFetching ? t('sharedPage.refreshing') : ''}
          </p>
        )}
      </div>

      {/* Scrollable item list */}
      <ScrollArea className="flex-1 min-h-0">
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">
            {t('sharedPage.loadingShared', { tab: tabId })}
          </div>
        ) : isError ? (
          <div className="p-4 text-center">
            <div className="space-y-3 py-8">
              <AlertCircle className="w-10 h-10 mx-auto text-destructive/50" />
              <div>
                <p className="text-sm font-medium">
                  {t('sharedPage.failedLoadShared', { tab: tabId })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{errorMessage}</p>
              </div>
              <Button size="sm" variant="outline" onClick={onRetry}>
                <RefreshCw className="w-4 h-4 mr-2" />
                {t('sharedPage.retry')}
              </Button>
            </div>
          </div>
        ) : hasNoItems ? (
          <div className="p-4 text-sm text-muted-foreground">
            {t('sharedPage.noSharedFound', { tab: tabId })}
          </div>
        ) : hasNoMatches ? (
          <div className="p-4 text-sm text-muted-foreground">
            {t('sharedPage.noMatch', { tab: tabId, query: activeQuery })}
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filteredItems.map((item) => (
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
                <p className="text-sm font-medium truncate">{item.name}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {item.description}
                </p>
                <p className="text-[11px] text-muted-foreground/90 mt-2 font-mono truncate">
                  {item.path}
                </p>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
