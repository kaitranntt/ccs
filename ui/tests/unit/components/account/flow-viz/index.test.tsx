import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent } from '@tests/setup/test-utils';
import { AccountFlowViz } from '@/components/account-flow-viz';
import type { ProviderData } from '@/components/account/flow-viz/types';
import type { RecentRequest } from '@/hooks/use-cliproxy-stats';

vi.mock(import('react-i18next'), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: { count?: number }) => {
        const translations: Record<string, string> = {
          'flowViz.showDetails': 'Show Details',
          'flowViz.hideDetails': 'Hide Details',
          'flowViz.backToProviders': 'Back to providers',
          'flowViz.resetLayout': 'Reset layout',
          'flowViz.provider': 'Provider',
          'flowViz.totalRequests': 'Total Requests',
          'flowViz.accounts': 'Accounts',
          'flowViz.visibleTotalRequests': 'Visible Requests',
          'flowViz.visibleAccounts': 'Visible Accounts',
        };

        if (key === 'flowViz.showPausedAccounts') {
          return `Show Paused (${options?.count ?? 0})`;
        }

        if (key === 'flowViz.hidePausedAccounts') {
          return `Hide Paused (${options?.count ?? 0})`;
        }

        if (key === 'flowViz.excludingPausedAccounts') {
          return `Excluding ${options?.count ?? 0} paused`;
        }

        return translations[key] ?? key;
      },
    }),
  };
});

vi.mock('@/components/account/flow-viz/account-card', () => ({
  AccountCard: ({
    account,
    originalIndex,
    zone,
  }: {
    account: { email: string; paused?: boolean };
    originalIndex: number;
    zone: string;
  }) => (
    <div data-account-index={originalIndex} data-zone={zone}>
      {account.email}
      {account.paused ? ' (paused)' : ' (active)'}
    </div>
  ),
}));

vi.mock('@/components/shared/provider-icon', () => ({
  ProviderIcon: ({ provider }: { provider: string }) => <div>{provider}</div>,
}));

vi.mock('@/components/account/flow-viz/connection-timeline', () => ({
  ConnectionTimeline: ({ events }: { events: Array<{ id: string }> }) => (
    <div>{events.length} timeline events</div>
  ),
}));

vi.mock('@/components/account/flow-viz/flow-paths', () => ({
  FlowPaths: ({ accounts }: { accounts: Array<{ id: string }> }) => (
    <div>paths:{accounts.map((account) => account.id).join(',')}</div>
  ),
}));

vi.mock('@/components/account/flow-viz/path-utils', () => ({
  calculateBezierPaths: () => [],
}));

const recentRequests: RecentRequest[] = [
  ...Array.from({ length: 4 }, (_, index) => ({
    accountKey: 'codex:paused-account',
    timestamp: `2026-03-26T10:0${index}:00.000Z`,
    failed: false,
  })),
  ...Array.from({ length: 3 }, (_, index) => ({
    accountKey: 'codex:active@company.com',
    timestamp: `2026-03-26T09:0${index}:00.000Z`,
    failed: index === 0,
  })),
];

const providerData: ProviderData = {
  provider: 'codex',
  displayName: 'OpenAI Codex',
  totalRequests: 7,
  accounts: [
    {
      id: 'paused-account',
      email: 'paused@company.com',
      provider: 'codex',
      successCount: 4,
      failureCount: 0,
      color: '#f59e0b',
      paused: true,
    },
    {
      id: 'active-account',
      email: 'active@company.com',
      provider: 'codex',
      successCount: 2,
      failureCount: 1,
      color: '#10a37f',
    },
  ],
};

describe('AccountFlowViz paused account visibility', () => {
  beforeEach(() => {
    vi.mocked(window.localStorage.getItem).mockReturnValue(null);
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 0)
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hides and restores paused accounts from the provider detail visualization', async () => {
    render(<AccountFlowViz providerData={providerData} recentRequests={recentRequests} />);

    expect(screen.getByRole('button', { name: 'Show Details' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide Paused (1)' })).toBeInTheDocument();
    expect(screen.getByText('active@company.com (active)')).toBeInTheDocument();
    expect(screen.getByText('paused@company.com (paused)')).toBeInTheDocument();
    expect(screen.getByText('Total Requests')).toBeInTheDocument();
    expect(screen.getByText('Accounts')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('7 timeline events')).toBeInTheDocument();
    expect(screen.getByText('paths:paused-account,active-account')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Hide Paused (1)' }));

    expect(screen.getByRole('button', { name: 'Show Paused (1)' })).toBeInTheDocument();
    expect(screen.getByText('active@company.com (active)')).toBeInTheDocument();
    expect(screen.queryByText('paused@company.com (paused)')).not.toBeInTheDocument();
    expect(screen.getByText('Visible Requests')).toBeInTheDocument();
    expect(screen.getByText('Visible Accounts')).toBeInTheDocument();
    expect(screen.getByText('Excluding 1 paused')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('3 timeline events')).toBeInTheDocument();
    expect(screen.getByText('paths:active-account')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Show Paused (1)' }));

    expect(screen.getByRole('button', { name: 'Hide Paused (1)' })).toBeInTheDocument();
    expect(screen.getByText('paused@company.com (paused)')).toBeInTheDocument();
    expect(screen.queryByText('Excluding 1 paused')).not.toBeInTheDocument();
  });

  it('ignores hidden paused-account drag offsets when deciding whether reset layout should stay visible', async () => {
    vi.mocked(window.localStorage.getItem).mockImplementation((key: string) =>
      key === 'ccs-flow-positions-codex'
        ? JSON.stringify({
            'paused-account': { x: 0, y: 160 },
          })
        : null
    );

    render(<AccountFlowViz providerData={providerData} recentRequests={recentRequests} />);

    expect(screen.getByRole('button', { name: 'Reset layout' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Hide Paused (1)' }));

    expect(screen.queryByRole('button', { name: 'Reset layout' })).not.toBeInTheDocument();
  });
});
