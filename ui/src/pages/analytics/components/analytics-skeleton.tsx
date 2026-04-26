/**
 * Analytics Skeleton Component
 *
 * Loading skeleton aligned to the MonitorGrid layout used by the live page.
 * Structure mirrors: 5 summary tiles + trend card (full-width) + 4 bottom cards.
 */

import { Skeleton } from '@/components/ui/skeleton';
import { MonitorLayout } from '@/components/monitor-layout/monitor-layout';
import { MonitorGrid, MonitorCard } from '@/components/monitor-layout/monitor-grid';
import { PageShell } from '@/components/page-shell/page-shell';
import { PageHeader } from '@/components/page-shell/page-header';

export function AnalyticsSkeleton() {
  return (
    <PageShell>
      {/* Header skeleton */}
      <PageHeader
        title={<Skeleton className="h-5 w-24" />}
        description={<Skeleton className="h-3 w-40 mt-1" />}
        actions={<Skeleton className="h-8 w-48" />}
      />

      <MonitorLayout>
        {/* Summary row — 5 stat tiles */}
        <MonitorGrid>
          {[...Array(5)].map((_, i) => (
            <MonitorCard key={i} span={2}>
              <div className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-2.5 w-24" />
              </div>
            </MonitorCard>
          ))}
        </MonitorGrid>

        {/* Charts grid */}
        <MonitorGrid>
          {/* Usage Trend — full width */}
          <MonitorCard span={12} className="min-h-[260px]">
            <Skeleton className="h-3 w-28 mb-3" />
            <Skeleton className="h-48 w-full" />
          </MonitorCard>

          {/* Cost by Model */}
          <MonitorCard span={5} className="min-h-[220px]">
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-2 py-1.5">
                  <div className="flex items-center gap-2 w-[180px] shrink-0">
                    <Skeleton className="w-2 h-2 rounded-full" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="flex-1 h-2 rounded-full" />
                  <Skeleton className="h-3 w-14 shrink-0" />
                  <Skeleton className="h-3 w-16 shrink-0" />
                </div>
              ))}
            </div>
          </MonitorCard>

          {/* Model Distribution */}
          <MonitorCard span={3} className="min-h-[220px]">
            <Skeleton className="h-3 w-24 mb-3" />
            <div className="flex items-center gap-4">
              <Skeleton className="h-[140px] w-[140px] rounded-full" />
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Skeleton className="w-2 h-2 rounded-full" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                ))}
              </div>
            </div>
          </MonitorCard>

          {/* Session Stats */}
          <MonitorCard span={2} className="min-h-[220px]">
            <Skeleton className="h-full w-full" />
          </MonitorCard>

          {/* CLIProxy Stats */}
          <MonitorCard span={2} className="min-h-[220px]">
            <Skeleton className="h-full w-full" />
          </MonitorCard>
        </MonitorGrid>
      </MonitorLayout>
    </PageShell>
  );
}
