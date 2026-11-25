/**
 * Model Breakdown Chart Component
 *
 * Displays usage distribution by model using pie chart.
 * Shows tokens, cost, and percentage breakdown. Respects privacy mode.
 */

import { useCallback, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import type { ModelUsage } from '@/hooks/use-usage';
import { cn, getModelColor } from '@/lib/utils';
import { usePrivacy, PRIVACY_BLUR_CLASS } from '@/contexts/privacy-context';
import { useTranslation } from 'react-i18next';

interface ModelBreakdownChartProps {
  data: ModelUsage[];
  isLoading?: boolean;
  className?: string;
}

interface ModelBreakdownTooltipProps {
  active?: boolean;
  payload?: unknown;
  privacyMode: boolean;
}

function ModelBreakdownTooltip({ active, payload, privacyMode }: ModelBreakdownTooltipProps) {
  if (!active || !payload) return null;

  const payloadArray = payload as Array<{
    payload: { name: string; value: number; cost: number; percentage: number };
  }>;
  if (!payloadArray.length) return null;

  const item = payloadArray[0].payload;
  return (
    <div className="rounded-lg border bg-background p-2 shadow-lg text-xs">
      <p className="font-medium mb-1">{item.name}</p>
      <p className={cn('text-muted-foreground', privacyMode && PRIVACY_BLUR_CLASS)}>
        {formatNumber(item.value)} ({item.percentage.toFixed(1)}%)
      </p>
      <p className={cn('text-muted-foreground', privacyMode && PRIVACY_BLUR_CLASS)}>
        ${item.cost.toFixed(4)}
      </p>
    </div>
  );
}

function renderPieLabel(entry: { percentage: number }) {
  return entry.percentage > 5 ? `${entry.percentage.toFixed(1)}%` : '';
}

export function ModelBreakdownChart({ data, isLoading, className }: ModelBreakdownChartProps) {
  const { privacyMode } = usePrivacy();
  const { t } = useTranslation();

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    return data.map((item) => ({
      name: item.model,
      value: item.tokens,
      cost: item.cost,
      percentage: item.percentage,
      fill: getModelColor(item.model),
    }));
  }, [data]);

  const renderTooltip = useCallback(
    (props: { active?: boolean; payload?: unknown }) => (
      <ModelBreakdownTooltip {...props} privacyMode={privacyMode} />
    ),
    [privacyMode]
  );

  if (isLoading) {
    return <Skeleton className={cn('h-full min-h-[100px] w-full', className)} />;
  }

  if (!data || data.length === 0) {
    return (
      <div className={cn('h-full min-h-[100px] flex items-center justify-center', className)}>
        <p className="text-muted-foreground">{t('analyticsCards.noModelData')}</p>
      </div>
    );
  }

  return (
    <div className={cn('w-full h-full min-h-[100px]', className)}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={renderPieLabel}
            innerRadius={50}
            outerRadius={70}
            paddingAngle={2}
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} strokeWidth={1} />
            ))}
          </Pie>
          <Tooltip content={renderTooltip} />
          {/* Legend removed from here, moved to AnalyticsPage for better layout control */}
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// Helper function to format large numbers
function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toLocaleString();
}
