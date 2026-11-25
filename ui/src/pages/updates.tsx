import { useEffect, useMemo, useState } from 'react';
import { Megaphone, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { UpdatesDetailsPanel } from '@/components/updates/updates-details-panel';
import { UpdatesInboxItem } from '@/components/updates/updates-inbox-item';
import {
  getSupportNotices,
  getSupportEntriesForNotice,
  type SupportNotice,
} from '@/lib/support-updates-catalog';
import {
  getNoticeProgress,
  isActionableNoticeState,
  readNoticeProgressMap,
  writeNoticeProgressMap,
  type NoticeProgressMap,
} from '@/lib/updates-notice-state';
import { useTranslation } from 'react-i18next';

type NoticeViewMode = 'inbox' | 'done' | 'all';

function noticeMatchesQuery(notice: SupportNotice, queryValue: string): boolean {
  if (!queryValue) {
    return true;
  }

  const haystack = [
    notice.title,
    notice.summary,
    notice.primaryAction,
    ...notice.highlights,
    ...notice.commands,
    ...notice.actions.map(
      (action) => `${action.label} ${action.description} ${action.command || ''}`
    ),
    ...notice.routes.map((route) => route.label),
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(queryValue);
}

export function UpdatesPage() {
  const { t } = useTranslation();
  const notices = useMemo(
    () => [...getSupportNotices()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
    []
  );
  const [viewMode, setViewMode] = useState<NoticeViewMode>('inbox');
  const [query, setQuery] = useState('');
  const [progressMap, setProgressMap] = useState<NoticeProgressMap>(() => readNoticeProgressMap());
  const [selectedNoticeId, setSelectedNoticeId] = useState<string | null>(null);

  useEffect(() => {
    writeNoticeProgressMap(progressMap);
  }, [progressMap]);

  const visibleNotices = useMemo(() => {
    const queryValue = query.trim().toLowerCase();

    return notices.filter((notice) => {
      const progress = getNoticeProgress(notice, progressMap);
      const matchesQuery = noticeMatchesQuery(notice, queryValue);
      if (!matchesQuery) return false;
      if (viewMode === 'done') return progress === 'done';
      if (viewMode === 'inbox') return isActionableNoticeState(progress);
      return true;
    });
  }, [notices, progressMap, query, viewMode]);

  const selectedNotice = useMemo(() => {
    const selectionPool = viewMode === 'all' ? notices : visibleNotices;
    return (
      selectionPool.find((notice) => notice.id === selectedNoticeId) ?? selectionPool[0] ?? null
    );
  }, [notices, selectedNoticeId, viewMode, visibleNotices]);

  const handleSelectNotice = (notice: SupportNotice) => {
    setSelectedNoticeId(notice.id);
    setProgressMap((previous) => {
      const progress = getNoticeProgress(notice, previous);
      if (progress !== 'new') {
        return previous;
      }

      return { ...previous, [notice.id]: 'seen' };
    });
  };

  const pendingCount = useMemo(
    () =>
      notices.filter((notice) => isActionableNoticeState(getNoticeProgress(notice, progressMap)))
        .length,
    [notices, progressMap]
  );
  const doneCount = useMemo(
    () => notices.filter((notice) => getNoticeProgress(notice, progressMap) === 'done').length,
    [notices, progressMap]
  );

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className="w-80 border-r bg-muted/30 flex flex-col overflow-hidden">
        <div className="p-4 border-b bg-background space-y-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-primary" />
              <h1 className="font-semibold">{t('updates.inboxTitle')}</h1>
            </div>
            <p className="text-xs text-muted-foreground">{t('updates.inboxSubtitle')}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border bg-background px-2 py-1.5">
              <p className="text-muted-foreground">{t('updates.needsAction')}</p>
              <p className="text-base font-semibold">{pendingCount}</p>
            </div>
            <div className="rounded-md border bg-background px-2 py-1.5">
              <p className="text-muted-foreground">{t('updates.doneCount')}</p>
              <p className="text-base font-semibold">{doneCount}</p>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('updates.searchPlaceholder')}
              className="h-9 pl-8"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'inbox' as const, label: t('updates.actionRequired') },
              { id: 'done' as const, label: t('updates.done') },
              { id: 'all' as const, label: t('updates.all') },
            ].map((mode) => (
              <Button
                key={mode.id}
                size="sm"
                variant={viewMode === mode.id ? 'default' : 'outline'}
                onClick={() => setViewMode(mode.id)}
              >
                {mode.label}
              </Button>
            ))}
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-2 p-2">
            {visibleNotices.length === 0 ? (
              <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                {t('updates.noNotices')}
              </div>
            ) : (
              visibleNotices.map((notice) => (
                <UpdatesInboxItem
                  key={notice.id}
                  notice={notice}
                  progress={getNoticeProgress(notice, progressMap)}
                  selected={selectedNotice?.id === notice.id}
                  onSelect={() => handleSelectNotice(notice)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      <UpdatesDetailsPanel
        notice={selectedNotice}
        progress={selectedNotice ? getNoticeProgress(selectedNotice, progressMap) : null}
        relatedEntries={selectedNotice ? getSupportEntriesForNotice(selectedNotice) : []}
        onUpdateProgress={(nextState) => {
          if (!selectedNotice) return;
          setProgressMap((previous) => ({ ...previous, [selectedNotice.id]: nextState }));
        }}
      />
    </div>
  );
}
