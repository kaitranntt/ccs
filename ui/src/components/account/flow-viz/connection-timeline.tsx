/**
 * Connection Timeline Component - right sidebar panel
 */

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { STATUS_COLORS } from '@/lib/utils';
import { PRIVACY_BLUR_CLASS } from '@/contexts/privacy-context';
import { Activity } from 'lucide-react';

import type { ConnectionEvent } from './types';
import { cleanEmail, formatTimelineTime } from './utils';

interface ConnectionTimelineProps {
  events: ConnectionEvent[];
  privacyMode: boolean;
}

export function ConnectionTimeline({ events, privacyMode }: ConnectionTimelineProps) {
  const { t } = useTranslation();
  if (events.length === 0) {
    return (
      <div className="h-full flex items-center justify-center rounded-xl bg-muted/20 dark:bg-zinc-900/40 border border-border/30 dark:border-white/[0.05]">
        <div className="text-xs text-muted-foreground font-mono">
          {t('flowViz.noRecentConnections')}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 px-2">
        <Activity className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
          {t('flowViz.connectionTimeline')}
        </span>
      </div>

      {/* Timeline container */}
      <div
        className={cn(
          'flex-1 rounded-xl p-4 overflow-y-auto',
          'bg-muted/20 dark:bg-zinc-900/40 backdrop-blur-sm',
          'border border-border/30 dark:border-white/[0.05]'
        )}
      >
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border/50 dark:bg-white/[0.08]" />

          {/* Events */}
          <div className="space-y-3">
            {events.map((event) => {
              const statusColor =
                event.status === 'success'
                  ? STATUS_COLORS.success
                  : event.status === 'failed'
                    ? STATUS_COLORS.failed
                    : STATUS_COLORS.degraded;

              return (
                <div key={event.id} className="relative flex items-start gap-3 pl-1">
                  {/* Timeline dot */}
                  <div
                    className={cn(
                      'relative z-10 w-3.5 h-3.5 rounded-full flex-shrink-0 mt-0.5',
                      'ring-2 ring-background dark:ring-zinc-950'
                    )}
                    style={{ backgroundColor: statusColor }}
                  />

                  {/* Event content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          'text-[10px] font-mono text-foreground truncate',
                          privacyMode && PRIVACY_BLUR_CLASS
                        )}
                      >
                        {event.accountNickname?.trim() || cleanEmail(event.accountEmail)}
                      </span>
                      <span className="text-[9px] text-muted-foreground font-mono flex-shrink-0">
                        {formatTimelineTime(event.timestamp)}
                      </span>
                    </div>
                    {event.accountNickname?.trim() && (
                      <div
                        className={cn(
                          'text-[9px] text-muted-foreground truncate',
                          privacyMode && PRIVACY_BLUR_CLASS
                        )}
                      >
                        {event.accountEmail}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className="text-[9px] font-medium uppercase"
                        style={{ color: statusColor }}
                      >
                        {event.status}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
