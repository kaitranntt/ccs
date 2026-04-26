/**
 * SharedItemViewer - Right content pane for the selected shared item.
 *
 * Renders: item metadata strip, markdown content area with loading / error states.
 * Uses SharedMarkdownViewer for content rendering.
 */

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { SharedMarkdownViewer } from './shared-markdown-viewer';
import type { SharedItem } from '@/hooks/use-shared';

interface SharedItemViewerProps {
  /** Currently selected item; null renders an empty-selection placeholder. */
  selectedItem: SharedItem | null;
  /** Resolved content path (may differ from selectedItem.path if symlinked). */
  contentPath?: string;
  /** Markdown content to render. */
  content: string;
  isContentLoading: boolean;
  isContentError: boolean;
  contentErrorMessage: string;
  /** Tab id string used in the select-one placeholder. */
  tabId: string;
  onRetryContent: () => void;
  className?: string;
}

/** Small metadata field used inside the path strip. */
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

export function SharedItemViewer({
  selectedItem,
  contentPath,
  content,
  isContentLoading,
  isContentError,
  contentErrorMessage,
  tabId,
  onRetryContent,
  className,
}: SharedItemViewerProps) {
  const { t } = useTranslation();

  if (!selectedItem) {
    return (
      <div
        className={cn(
          'min-h-[320px] flex items-center justify-center p-6 text-center text-muted-foreground bg-muted/20',
          className
        )}
      >
        {t('sharedPage.selectOne', { tab: tabId.slice(0, -1) })}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full bg-muted/20', className)}>
      {/* Item title + type badge */}
      <div className="px-4 py-3 border-b bg-background">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold truncate">{selectedItem.name}</h2>
          <Badge variant="outline" className="uppercase text-[10px]">
            {selectedItem.type}
          </Badge>
        </div>
      </div>

      {/* Metadata + content */}
      <div className="p-4 space-y-4 min-h-0 flex-1 flex flex-col">
        {/* Path metadata strip */}
        <div className="rounded-md border bg-muted/35 p-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <MetadataField label={t('sharedPage.pathLabel')} value={selectedItem.path} mono />
            {contentPath && contentPath !== selectedItem.path && (
              <MetadataField label={t('sharedPage.resolvedSource')} value={contentPath} mono />
            )}
          </div>
        </div>

        {/* Markdown card */}
        <Card className="min-h-0 flex-1">
          <CardContent className="p-0 h-full">
            <ScrollArea className="h-full px-5 py-4">
              {isContentLoading ? (
                <p className="text-sm text-muted-foreground">{t('sharedPage.loadingMarkdown')}</p>
              ) : isContentError ? (
                <Alert variant="destructive" className="max-w-2xl">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>{t('sharedPage.failedLoadContent')}</AlertTitle>
                  <AlertDescription>
                    <p>{contentErrorMessage}</p>
                    <div className="mt-3">
                      <Button size="sm" variant="outline" onClick={onRetryContent}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        {t('sharedPage.retryContent')}
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              ) : (
                <SharedMarkdownViewer content={content} />
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
