import { render, screen, userEvent, within } from '@tests/setup/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthMonitor } from '@/components/monitoring/auth-monitor';
import type { AuthMonitorData } from '@/components/monitoring/auth-monitor/hooks';

vi.mock('@/components/account-flow-viz', () => ({
  AccountFlowViz: ({
    providerData,
    onBack,
  }: {
    providerData: { displayName: string };
    onBack: () => void;
  }) => (
    <div>
      <button type="button" onClick={onBack}>
        Back to providers
      </button>
      <div data-testid="provider-detail">{providerData.displayName}</div>
    </div>
  ),
}));

vi.mock(import('react-i18next'), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: { count?: number }) => {
        const translations: Record<string, string> = {
          'authMonitor.accounts': 'Accounts',
          'authMonitor.success': 'Success',
          'authMonitor.failed': 'Failed',
          'authMonitor.successRate': 'Success Rate',
          'authMonitorLive.live': 'LIVE',
          'authMonitorLive.accountMonitor': 'Account Monitor',
          'authMonitorLive.requestsLabel': 'req',
        };

        if (key === 'authMonitor.accountsCount') {
          return `${options?.count ?? 0} accounts`;
        }

        if (key === 'authMonitorLive.updated') {
          return `Updated ${options && 'time' in options ? String((options as { time?: string }).time ?? '') : ''}`.trim();
        }

        if (key === 'authMonitorLive.updatedNow') {
          return 'Updated now';
        }

        return translations[key] ?? key;
      },
    }),
  };
});

const { useAuthMonitorDataMock } = vi.hoisted(() => ({
  useAuthMonitorDataMock: vi.fn<() => AuthMonitorData>(),
}));

vi.mock('@/components/monitoring/auth-monitor/hooks', () => ({
  useAuthMonitorData: useAuthMonitorDataMock,
}));

function getSummaryRow() {
  const accountsLabel = screen.getByText('Accounts');
  const summaryRow = accountsLabel.parentElement?.parentElement?.parentElement;

  if (!summaryRow) {
    throw new Error('Unable to locate the auth monitor summary row.');
  }

  return summaryRow;
}

function getSummaryCard(label: string) {
  const labelNode = within(getSummaryRow()).getByText(label);
  const card = labelNode.closest('div')?.parentElement;

  if (!card) {
    throw new Error(`Unable to locate summary card for label "${label}".`);
  }

  return card;
}

const providerStats = [
  {
    provider: 'gemini',
    displayName: 'Google Gemini',
    totalRequests: 15,
    successCount: 12,
    failureCount: 3,
    accountCount: 2,
    accounts: [
      {
        id: 'gemini-primary',
        email: 'gemini-primary@example.com',
        tokenFile: '/tmp/gemini-primary.json',
        provider: 'gemini',
        displayName: 'Google Gemini',
        isDefault: true,
        successCount: 10,
        failureCount: 2,
        color: '#4285F4',
      },
      {
        id: 'gemini-secondary',
        email: 'gemini-secondary@example.com',
        tokenFile: '/tmp/gemini-secondary.json',
        provider: 'gemini',
        displayName: 'Google Gemini',
        isDefault: false,
        successCount: 2,
        failureCount: 1,
        color: '#34A853',
      },
    ],
  },
  {
    provider: 'codex',
    displayName: 'OpenAI Codex',
    totalRequests: 27,
    successCount: 23,
    failureCount: 4,
    accountCount: 2,
    accounts: [
      {
        id: 'codex-primary',
        email: 'codex-primary@example.com',
        tokenFile: '/tmp/codex-primary.json',
        provider: 'codex',
        displayName: 'OpenAI Codex',
        isDefault: true,
        successCount: 15,
        failureCount: 2,
        color: '#10a37f',
      },
      {
        id: 'codex-secondary',
        email: 'codex-secondary@example.com',
        tokenFile: '/tmp/codex-secondary.json',
        provider: 'codex',
        displayName: 'OpenAI Codex',
        isDefault: false,
        successCount: 8,
        failureCount: 2,
        color: '#0f766e',
      },
    ],
  },
] satisfies AuthMonitorData['providerStats'];

const authMonitorData: AuthMonitorData = {
  accounts: providerStats.flatMap((provider) => provider.accounts),
  totalSuccess: 35,
  totalFailure: 7,
  totalRequests: 42,
  providerStats,
  overallSuccessRate: 83,
  isLoading: false,
  error: null,
  timeSinceUpdate: '2s ago',
};

describe('AuthMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(window.localStorage.getItem).mockReturnValue(null);
    useAuthMonitorDataMock.mockReturnValue(authMonitorData);
  });

  it('scopes header and summary metrics to the selected provider detail view', async () => {
    render(<AuthMonitor />);

    expect(screen.getByText('4 accounts')).toBeInTheDocument();
    expect(screen.getByText('42 req')).toBeInTheDocument();
    expect(within(getSummaryCard('Accounts')).getByText('4')).toBeInTheDocument();
    expect(within(getSummaryCard('Success')).getByText('35')).toBeInTheDocument();
    expect(within(getSummaryCard('Failed')).getByText('7')).toBeInTheDocument();
    expect(within(getSummaryCard('Success Rate')).getByText('83%')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Google Gemini/i }));

    expect(screen.getByTestId('provider-detail')).toHaveTextContent('Google Gemini');
    expect(screen.getByText('2 accounts')).toBeInTheDocument();
    expect(screen.getByText('15 req')).toBeInTheDocument();
    expect(within(getSummaryCard('Accounts')).getByText('2')).toBeInTheDocument();
    expect(within(getSummaryCard('Success')).getByText('12')).toBeInTheDocument();
    expect(within(getSummaryCard('Failed')).getByText('3')).toBeInTheDocument();
    expect(within(getSummaryCard('Success Rate')).getByText('80%')).toBeInTheDocument();
  });

  it('shows CLIProxy guidance when a large account pool has a high failure rate', () => {
    useAuthMonitorDataMock.mockReturnValue({
      ...authMonitorData,
      accounts: Array.from({ length: 5 }, (_, index) => ({
        id: `codex-${index}`,
        email: `codex-${index}@example.com`,
        tokenFile: `/tmp/codex-${index}.json`,
        provider: 'codex',
        displayName: 'OpenAI Codex',
        isDefault: index === 0,
        successCount: index === 0 ? 1 : 0,
        failureCount: 5,
        color: '#10a37f',
      })),
      totalSuccess: 1,
      totalFailure: 25,
      totalRequests: 26,
      providerStats: [
        {
          provider: 'codex',
          displayName: 'OpenAI Codex',
          totalRequests: 26,
          successCount: 1,
          failureCount: 25,
          accountCount: 5,
          accounts: [],
        },
      ],
      overallSuccessRate: 4,
    });

    render(<AuthMonitor />);

    expect(screen.getByText('High CLIProxy failure rate detected')).toBeInTheDocument();
    expect(screen.getByText(/ccs cliproxy routing/)).toBeInTheDocument();
  });
});
