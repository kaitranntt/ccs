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
import { PageShell, PageHeader } from '@/components/page-shell';
import {
  KpiRow,
  KpiCard,
  MonitorLayout,
  MonitorGrid,
  MonitorCard,
} from '@/components/monitor-layout';

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
  const notices = [...getSupportNotices()].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt)
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

  const viewModes: { id: NoticeViewMode; label: string }[] = [
    { id: 'inbox', label: t('updates.actionRequired') },
    { id: 'done', label: t('updates.done') },
    { id: 'all', label: t('updates.all') },
  ];

  return (
    <PageShell>
      {/* 1c. PageHeader — title + description; pendingCount as status badge */}
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            {t('updates.inboxTitle')}
          </span>
        }
        description={t('updates.inboxSubtitle')}
      />

      {/* KpiRow — exactly 2 hero numbers, well within the ≤4 limit */}
      <div className="border-b bg-background/50 px-6 py-3">
        <KpiRow>
          <KpiCard
            label={t('updates.needsAction')}
            value={pendingCount}
            tone={pendingCount > 0 ? 'warning' : 'positive'}
          />
          <KpiCard label={t('updates.doneCount')} value={doneCount} />
        </KpiRow>
      </div>

      {/* Monitor body — inbox pane + detail pane as MonitorGrid cards */}
      <MonitorLayout>
        <MonitorGrid>
          {/* Inbox pane — span 4 on desktop, full on mobile */}
          <MonitorCard
            span={4}
            title={
              <div className="flex flex-col gap-2">
                {/* Filter buttons */}
                <div className="flex flex-wrap gap-1.5">
                  {viewModes.map((mode) => (
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
                {/* Search input */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t('updates.searchPlaceholder')}
                    className="h-9 pl-8"
                  />
                </div>
              </div>
            }
          >
            <ScrollArea className="h-full max-h-[calc(100vh-22rem)]">
              <div className="space-y-2">
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
          </MonitorCard>

          {/* Detail pane — span 8 on desktop, full on mobile */}
          <MonitorCard span={8} className="min-h-0 p-0">
            <UpdatesDetailsPanel
              notice={selectedNotice}
              progress={selectedNotice ? getNoticeProgress(selectedNotice, progressMap) : null}
              relatedEntries={selectedNotice ? getSupportEntriesForNotice(selectedNotice) : []}
              onUpdateProgress={(nextState) => {
                if (!selectedNotice) return;
                setProgressMap((previous) => ({ ...previous, [selectedNotice.id]: nextState }));
              }}
            />
          </MonitorCard>
        </MonitorGrid>
      </MonitorLayout>
    </PageShell>
  );
}
