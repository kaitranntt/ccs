import { render, screen, userEvent } from '@tests/setup/test-utils';
import { describe, expect, it } from 'vitest';
import { AccountQuotaPanel } from '@/components/account/shared/account-quota-panel';
import type { ClaudeQuotaResult, CodexQuotaResult, GeminiCliQuotaResult } from '@/lib/api-client';

const NOISY_WEEKLY_REMAINING_PERCENT = 45 - 1e-14;
const NOISY_WEEKLY_USED_PERCENT = 100 - NOISY_WEEKLY_REMAINING_PERCENT;

function createGeminiFailureQuota(): GeminiCliQuotaResult {
  return {
    success: false,
    buckets: [],
    projectId: 'test-project',
    lastUpdated: Date.now(),
    error: 'Request had invalid authentication credentials.',
    httpStatus: 401,
    errorCode: 'UNAUTHENTICATED',
    errorDetail:
      '{"error":{"code":401,"message":"Request had invalid authentication credentials.","status":"UNAUTHENTICATED"}}',
    actionHint: 'Run ccs gemini --auth to reconnect this account.',
    needsReauth: true,
  };
}

function createClaudeQuota(): ClaudeQuotaResult {
  return {
    success: true,
    lastUpdated: Date.now(),
    windows: [
      {
        rateLimitType: 'five_hour',
        label: '5-hour usage',
        status: 'allowed',
        utilization: 0.57,
        usedPercent: 57,
        remainingPercent: 43,
        resetAt: '2026-05-01T01:00:00.000Z',
      },
      {
        rateLimitType: 'seven_day',
        label: 'Weekly usage',
        status: 'allowed',
        utilization: NOISY_WEEKLY_USED_PERCENT / 100,
        usedPercent: NOISY_WEEKLY_USED_PERCENT,
        remainingPercent: NOISY_WEEKLY_REMAINING_PERCENT,
        resetAt: '2026-05-07T01:00:00.000Z',
      },
    ],
    coreUsage: {
      fiveHour: {
        rateLimitType: 'five_hour',
        label: '5-hour usage',
        remainingPercent: 43,
        resetAt: '2026-05-01T01:00:00.000Z',
        status: 'allowed',
      },
      weekly: {
        rateLimitType: 'seven_day',
        label: 'Weekly usage',
        remainingPercent: NOISY_WEEKLY_REMAINING_PERCENT,
        resetAt: '2026-05-07T01:00:00.000Z',
        status: 'allowed',
      },
    },
  };
}

function createCodexQuota(): CodexQuotaResult {
  return {
    success: true,
    planType: 'pro',
    lastUpdated: Date.now(),
    windows: [
      {
        label: 'Primary',
        category: 'usage',
        cadence: '5h',
        usedPercent: 38,
        remainingPercent: 62,
        resetAfterSeconds: 60 * 60,
        resetAt: '2026-05-01T01:00:00.000Z',
      },
      {
        label: 'Secondary',
        category: 'usage',
        cadence: 'weekly',
        usedPercent: 61,
        remainingPercent: 39,
        resetAfterSeconds: 7 * 24 * 60 * 60,
        resetAt: '2026-05-07T01:00:00.000Z',
      },
    ],
    coreUsage: {
      fiveHour: {
        label: 'Primary',
        remainingPercent: 62,
        resetAfterSeconds: 60 * 60,
        resetAt: '2026-05-01T01:00:00.000Z',
      },
      weekly: {
        label: 'Secondary',
        remainingPercent: 39,
        resetAfterSeconds: 7 * 24 * 60 * 60,
        resetAt: '2026-05-07T01:00:00.000Z',
      },
    },
  };
}

function createGeminiSuccessQuota(): GeminiCliQuotaResult {
  return {
    success: true,
    buckets: [
      {
        id: 'flash::input',
        label: 'Gemini Flash',
        tokenType: 'input',
        remainingFraction: 0.6,
        remainingPercent: 60,
        resetTime: '2026-05-01T01:00:00.000Z',
        modelIds: ['gemini-2.5-flash'],
      },
    ],
    projectId: 'test-project',
    lastUpdated: Date.now(),
  };
}

describe('AccountQuotaPanel quota bars', () => {
  it('shows separate compact Claude 5h and weekly quota bars', () => {
    render(
      <AccountQuotaPanel
        provider="claude"
        quota={createClaudeQuota()}
        quotaLoading={false}
        mode="compact"
      />
    );

    expect(screen.getByText('5h')).toBeInTheDocument();
    expect(screen.getByText('Week')).toBeInTheDocument();
    expect(screen.getByText('43%')).toBeInTheDocument();
    expect(screen.getAllByText('45%').length).toBeGreaterThan(0);
    expect(screen.getByRole('progressbar', { name: '5h quota' })).toHaveAttribute(
      'aria-valuenow',
      '43'
    );
    expect(screen.getByRole('progressbar', { name: 'Week quota' })).toHaveAttribute(
      'aria-valuenow',
      '45'
    );
  });

  it('shows separate compact Codex 5h and weekly quota bars', () => {
    render(
      <AccountQuotaPanel
        provider="codex"
        quota={createCodexQuota()}
        quotaLoading={false}
        mode="compact"
      />
    );

    expect(screen.getByRole('progressbar', { name: '5h quota' })).toHaveAttribute(
      'aria-valuenow',
      '62'
    );
    expect(screen.getByRole('progressbar', { name: 'Week quota' })).toHaveAttribute(
      'aria-valuenow',
      '39'
    );
  });

  it('keeps the compact single-bar fallback for providers without split quota rows', () => {
    render(
      <AccountQuotaPanel
        provider="gemini"
        quota={createGeminiSuccessQuota()}
        quotaLoading={false}
        mode="compact"
      />
    );

    expect(screen.getByRole('progressbar', { name: 'Quota' })).toBeInTheDocument();
    expect(screen.queryByRole('progressbar', { name: '5h quota' })).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar', { name: 'Week quota' })).not.toBeInTheDocument();
  });

  it('shows explicit detailed Claude quota labels', () => {
    render(
      <AccountQuotaPanel
        provider="claude"
        quota={createClaudeQuota()}
        quotaLoading={false}
        mode="detailed"
      />
    );

    expect(screen.getByText('5h usage limit')).toBeInTheDocument();
    expect(screen.getByText('Weekly usage limit')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '5h usage limit quota' })).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'Weekly usage limit quota' })
    ).toBeInTheDocument();
  });
});

describe('AccountQuotaPanel failure tooltip', () => {
  it('renders the shared failure tooltip content with viewport-safe shell classes', async () => {
    render(
      <AccountQuotaPanel
        provider="gemini"
        quota={createGeminiFailureQuota()}
        quotaLoading={false}
        mode="detailed"
      />
    );

    await userEvent.hover(screen.getByText('Reauth'));

    const summary = (
      await screen.findAllByText('Request had invalid authentication credentials.')
    ).find((node) => node.closest('[data-slot="tooltip-content"]'));
    expect(summary).toBeInTheDocument();
    const tooltipContent = summary.closest('[data-slot="tooltip-content"]');
    const actionHint = screen
      .getAllByText('Run ccs gemini --auth to reconnect this account.')
      .find((node) => node.closest('[data-slot="tooltip-content"]') === tooltipContent);
    const technicalDetail = screen
      .getAllByText('HTTP 401 | UNAUTHENTICATED')
      .find((node) => node.closest('[data-slot="tooltip-content"]') === tooltipContent);
    expect(actionHint).toBeInTheDocument();
    expect(technicalDetail).toBeInTheDocument();
    expect(tooltipContent?.className).toContain('max-w-[calc(100vw-2rem)]');
    expect(tooltipContent?.className).toContain('bg-popover');
    expect(tooltipContent?.className).toContain('text-popover-foreground');
  });
});
