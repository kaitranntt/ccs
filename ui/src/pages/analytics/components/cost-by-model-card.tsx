/**
 * Cost By Model Card Component
 *
 * Displays a list of models sorted by cost with breakdown bars.
 *
 * Supports two rendering modes:
 * - default: renders its own Card shell (legacy, standalone use)
 * - headless (prop): renders content only — for use inside a MonitorCard
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DollarSign, ChevronRight } from 'lucide-react';
import { getModelColor, cn } from '@/lib/utils';
import { PRIVACY_BLUR_CLASS } from '@/contexts/privacy-context';
import { formatTokens } from '../utils';
import type { ModelUsage } from '@/hooks/use-usage';
import { useTranslation } from 'react-i18next';

interface CostByModelCardProps {
  models: ModelUsage[] | undefined;
  isLoading: boolean;
  onModelClick: (model: ModelUsage, event: React.MouseEvent) => void;
  privacyMode: boolean;
  /**
   * When true, suppresses the outer Card shell.
   * Use when this component is already nested inside a MonitorCard.
   */
  headless?: boolean;
}

export function CostByModelCard({
  models,
  isLoading,
  onModelClick,
  privacyMode,
  headless = false,
}: CostByModelCardProps) {
  const { t } = useTranslation();

  /** Scrollable model list — shared between headless and card modes. */
  const listContent = (
    <div className="space-y-0.5">
      {[...(models ?? [])]
        .sort((a, b) => b.cost - a.cost)
        .map((model) => (
          <button
            key={model.model}
            className="group flex items-center text-xs w-full hover:bg-muted/50 rounded px-2 py-1.5 transition-colors cursor-pointer gap-3"
            onClick={(e) => onModelClick(model, e)}
            title="Click for details"
          >
            {/* Model name */}
            <div className="flex items-center gap-2 min-w-0 w-[180px] shrink-0">
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: getModelColor(model.model) }}
              />
              <span className="font-medium truncate group-hover:underline underline-offset-2">
                {model.model}
              </span>
            </div>
            {/* Cost breakdown mini-bar */}
            <CostBreakdownBar model={model} />
            {/* Token count */}
            <span
              className={cn(
                'text-[10px] text-muted-foreground w-14 text-right shrink-0',
                privacyMode && PRIVACY_BLUR_CLASS
              )}
            >
              {formatTokens(model.tokens)}
            </span>
            {/* Total cost */}
            <span
              className={cn(
                'font-mono font-medium w-16 text-right shrink-0',
                privacyMode && PRIVACY_BLUR_CLASS
              )}
            >
              ${model.cost.toFixed(2)}
            </span>
            <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity shrink-0" />
          </button>
        ))}
      {/* Legend */}
      <CostLegend />
    </div>
  );

  // Headless: plain div to avoid CardContent slot-padding bleeding through MonitorCard.
  if (headless) {
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        {isLoading ? (
          <Skeleton className="h-full w-full min-h-[120px]" />
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto">{listContent}</div>
        )}
      </div>
    );
  }

  const content = (
    <>
      <CardHeader className="px-3 py-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <DollarSign className="w-4 h-4" />
          {t('analyticsPages.costByModel')}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-2 pt-0 flex-1 min-h-0 overflow-y-auto">
        {isLoading ? <Skeleton className="h-full w-full min-h-[120px]" /> : listContent}
      </CardContent>
    </>
  );

  return (
    <Card className="flex flex-col h-full min-h-0 overflow-hidden gap-0 py-0 shadow-sm lg:col-span-4">
      {content}
    </Card>
  );
}

function CostBreakdownBar({ model }: { model: ModelUsage }) {
  const colors = {
    input: '#335c67',
    output: '#fff3b0',
    cacheWrite: '#e09f3e',
    cacheRead: '#9e2a2b',
  };

  const getWidth = (cost: number) => (model.cost > 0 ? (cost / model.cost) * 100 : 0);

  return (
    <div className="flex-1 flex items-center gap-1 min-w-0">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden flex">
        <div
          className="h-full"
          style={{
            backgroundColor: colors.input,
            width: `${getWidth(model.costBreakdown.input.cost)}%`,
          }}
          title={`Input: $${model.costBreakdown.input.cost.toFixed(2)}`}
        />
        <div
          className="h-full"
          style={{
            backgroundColor: colors.output,
            width: `${getWidth(model.costBreakdown.output.cost)}%`,
          }}
          title={`Output: $${model.costBreakdown.output.cost.toFixed(2)}`}
        />
        <div
          className="h-full"
          style={{
            backgroundColor: colors.cacheWrite,
            width: `${getWidth(model.costBreakdown.cacheCreation.cost)}%`,
          }}
          title={`Cache Write: $${model.costBreakdown.cacheCreation.cost.toFixed(2)}`}
        />
        <div
          className="h-full"
          style={{
            backgroundColor: colors.cacheRead,
            width: `${getWidth(model.costBreakdown.cacheRead.cost)}%`,
          }}
          title={`Cache Read: $${model.costBreakdown.cacheRead.cost.toFixed(2)}`}
        />
      </div>
    </div>
  );
}

function CostLegend() {
  const items = [
    { color: '#335c67', label: 'Input' },
    { color: '#fff3b0', label: 'Output', hasBorder: true },
    { color: '#e09f3e', label: 'Cache Write' },
    { color: '#9e2a2b', label: 'Cache Read' },
  ];

  return (
    <div className="flex items-center gap-3 pt-2 px-2 text-[10px] text-muted-foreground border-t mt-2">
      {items.map(({ color, label, hasBorder }) => (
        <span key={label} className="flex items-center gap-1">
          <div
            className={cn('w-2 h-2 rounded-full', hasBorder && 'border border-muted-foreground/30')}
            style={{ backgroundColor: color }}
          />
          {label}
        </span>
      ))}
    </div>
  );
}
