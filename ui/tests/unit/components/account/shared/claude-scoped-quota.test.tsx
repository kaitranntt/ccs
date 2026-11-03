import { render, screen } from '@tests/setup/test-utils';
import { describe, expect, it } from 'vitest';
import { AccountQuotaPanel } from '@/components/account/shared/account-quota-panel';
import { QuotaTooltipContent } from '@/components/shared/quota-tooltip-content';
import { getProviderMinQuota, getProviderResetTime } from '@/lib/utils';
import type { ClaudeQuotaResult, ClaudeQuotaWindow } from '@/lib/api-client';

function quota(mask: number): ClaudeQuotaResult {
  const windows: ClaudeQuotaWindow[] = [
    ...(mask & 1
      ? [
          {
            rateLimitType: 'five_hour',
            scope: 'account' as const,
            cadence: '5h' as const,
            label: 'Session limit',
            status: 'allowed',
            utilization: 0.2,
            usedPercent: 20,
            remainingPercent: 80,
            resetAt: null,
          },
        ]
      : []),
    ...(mask & 2
      ? [
          {
            rateLimitType: 'seven_day',
            scope: 'account' as const,
            cadence: 'weekly' as const,
            label: 'Weekly limit',
            status: 'allowed',
            utilization: 0.3,
            usedPercent: 30,
            remainingPercent: 70,
            resetAt: null,
          },
        ]
      : []),
    ...(mask & 4
      ? [
          {
            rateLimitType: 'weekly_scoped:fable',
            scope: 'model' as const,
            cadence: 'weekly' as const,
            modelLabel: 'Fable',
            label: 'Fable weekly limit',
            status: 'unknown',
            utilization: 1,
            usedPercent: 100,
            remainingPercent: 0,
            resetAt: '2026-11-01T00:00:00Z',
          },
        ]
      : []),
  ];
  return { success: true, windows, lastUpdated: 1 };
}

describe('independent Claude quota rows', () => {
  for (let mask = 0; mask < 8; mask++) {
    for (const mode of ['compact', 'detailed'] as const) {
      it(`renders H/W/F subset ${mask} in ${mode} mode`, () => {
        const data = quota(mask);
        const { unmount } = render(
          <AccountQuotaPanel provider="claude" quota={data} mode={mode} />
        );
        expect(screen.queryAllByRole('progressbar')).toHaveLength(
          Number(!!(mask & 1)) + Number(!!(mask & 2)) + Number(!!(mask & 4))
        );
        if (mask & 4)
          expect(
            screen.getByRole('progressbar', {
              name: mode === 'compact' ? 'Fable quota' : 'Fable weekly limit quota',
            })
          ).toHaveAttribute('aria-valuenow', '0');
        expect(getProviderMinQuota('claude', data)).toBe(mask & 2 ? 70 : mask & 1 ? 80 : null);
        expect(getProviderResetTime('claude', data)).toBeNull();
        unmount();
      });
    }
  }
  it('ignores collapsed core and metadata-free model windows for health', () => {
    const data = quota(4);
    delete data.windows[0].scope;
    data.windows[0].rateLimitType = 'seven_day_fable';
    data.coreUsage = { fiveHour: null, weekly: { ...data.windows[0] } };
    expect(getProviderMinQuota('claude', data)).toBeNull();
    expect(getProviderResetTime('claude', data)).toBeNull();
  });
  it('renders model-only tooltip rows without general resets', () => {
    render(<QuotaTooltipContent quota={quota(4)} resetTime={null} />);
    expect(screen.getByText('Fable weekly limit')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.queryByText('Weekly reset')).not.toBeInTheDocument();
  });
  it('keeps no limits distinct from a failed query', () => {
    const data = quota(0);
    const { unmount } = render(
      <AccountQuotaPanel provider="claude" quota={data} mode="detailed" />
    );
    expect(screen.getByText('Quota limits unavailable')).toBeInTheDocument();
    unmount();
    render(
      <AccountQuotaPanel
        provider="claude"
        quota={{
          ...data,
          success: false,
          error: 'Claude usage status temporarily unavailable',
          errorCode: 'usage_probe_unavailable',
          httpStatus: 429,
        }}
        mode="detailed"
      />
    );
    expect(screen.queryByText('Quota limits unavailable')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
  });
});
