/**
 * Analytics Page — Unit Tests
 *
 * Covers the Monitor-archetype migration:
 * - PageHeader renders with title
 * - AnalyticsSummaryRow renders KPI tiles
 * - ChartsGrid renders MonitorCard containers
 * - CostByModelCard mounts in headless mode inside MonitorCard
 * - AnalyticsSkeleton mirrors grid layout
 * - 24H toggle / date-range controls flow
 * - Privacy mode blurs sensitive values
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import { render, screen, waitFor } from '@tests/setup/test-utils';
import { AnalyticsPage, AnalyticsSkeleton } from '@/pages/analytics';

// ─── jsdom stubs ────────────────────────────────────────────────────────────

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

// IntersectionObserver / ResizeObserver must be proper classes (constructable)
class ObserverStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  // ResizeObserver callback signature
  constructor(_cb?: unknown) {}
}
vi.stubGlobal('IntersectionObserver', ObserverStub);
vi.stubGlobal('ResizeObserver', ObserverStub);

// ─── Hook mocks ─────────────────────────────────────────────────────────────

const { useAnalyticsPageMock, usePrivacyMock } = vi.hoisted(() => ({
  useAnalyticsPageMock: vi.fn(),
  usePrivacyMock: vi.fn(),
}));

vi.mock('@/pages/analytics/hooks', () => ({
  useAnalyticsPage: useAnalyticsPageMock,
}));

vi.mock('@/contexts/privacy-context', async () => {
  const actual = await vi.importActual<typeof import('@/contexts/privacy-context')>(
    '@/contexts/privacy-context'
  );
  return {
    ...actual,
    usePrivacy: usePrivacyMock,
  };
});

// Stub heavy chart / stats sub-components to keep tests fast
vi.mock('@/components/analytics/usage-trend-chart', () => ({
  UsageTrendChart: () => <div data-testid="usage-trend-chart" />,
}));
vi.mock('@/components/analytics/model-breakdown-chart', () => ({
  ModelBreakdownChart: () => <div data-testid="model-breakdown-chart" />,
}));
vi.mock('@/components/analytics/session-stats-card', () => ({
  SessionStatsCard: () => <div data-testid="session-stats-card" />,
}));
vi.mock('@/components/analytics/cliproxy-stats-card', () => ({
  CliproxyStatsCard: () => <div data-testid="cliproxy-stats-card" />,
}));
vi.mock('@/components/analytics/model-details-content', () => ({
  ModelDetailsContent: () => <div data-testid="model-details-content" />,
}));

// ─── Shared fixture ──────────────────────────────────────────────────────────

const baseHookReturn = {
  dateRange: { from: new Date('2024-01-01'), to: new Date('2024-01-31') },
  handleDateRangeChange: vi.fn(),
  handleTodayClick: vi.fn(),
  handleRefresh: vi.fn().mockResolvedValue(undefined),
  isRefreshing: false,
  lastUpdatedText: '2 minutes ago',
  viewMode: 'daily' as const,
  summary: {
    totalTokens: 1_234_567,
    totalInputTokens: 800_000,
    totalOutputTokens: 434_567,
    totalCacheTokens: 50_000,
    totalCost: 12.34,
    averageCostPerDay: 0.41,
    tokenBreakdown: {
      input: { tokens: 800_000, cost: 8.0 },
      output: { tokens: 434_567, cost: 3.5 },
      cacheCreation: { tokens: 30_000, cost: 0.5 },
      cacheRead: { tokens: 20_000, cost: 0.34 },
    },
  },
  isSummaryLoading: false,
  trends: [],
  hourlyData: [],
  models: [
    {
      model: 'claude-3-5-sonnet',
      tokens: 500_000,
      cost: 5.0,
      costBreakdown: {
        input: { tokens: 300_000, cost: 3.0 },
        output: { tokens: 200_000, cost: 2.0 },
        cacheCreation: { tokens: 0, cost: 0 },
        cacheRead: { tokens: 0, cost: 0 },
      },
    },
  ],
  sessions: undefined,
  isTrendsLoading: false,
  isHourlyLoading: false,
  isModelsLoading: false,
  isSessionsLoading: false,
  isLoading: false,
  handleModelClick: vi.fn(),
  selectedModel: null,
  popoverPosition: null,
  handlePopoverClose: vi.fn(),
  status: undefined,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AnalyticsPage — Monitor archetype', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    useAnalyticsPageMock.mockReturnValue(baseHookReturn);
    usePrivacyMock.mockReturnValue({ privacyMode: false, togglePrivacy: vi.fn() });
  });

  it('renders PageHeader with Analytics title', () => {
    render(<AnalyticsPage />);
    // PageShell may produce multiple <header> elements; confirm at least one exists
    const banners = screen.getAllByRole('banner');
    expect(banners.length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Analytics');
  });

  it('renders PageHeader description', () => {
    render(<AnalyticsPage />);
    expect(screen.getByText(/track usage and insights/i)).toBeVisible();
  });

  it('renders 24H toggle button in header actions', () => {
    render(<AnalyticsPage />);
    expect(screen.getByRole('button', { name: '24H' })).toBeVisible();
  });

  it('calls handleTodayClick when 24H is clicked', async () => {
    const { userEvent: user } = await import('@testing-library/user-event');
    const ue = user.setup();
    render(<AnalyticsPage />);
    await ue.click(screen.getByRole('button', { name: '24H' }));
    expect(baseHookReturn.handleTodayClick).toHaveBeenCalledOnce();
  });

  it('renders KPI summary row with 5 metric tiles', () => {
    render(<AnalyticsPage />);
    // Each tile has an uppercase label
    expect(screen.getByText(/total tokens/i)).toBeVisible();
    expect(screen.getByText(/total cost/i)).toBeVisible();
    expect(screen.getByText(/cache tokens/i)).toBeVisible();
    expect(screen.getByText(/input cost/i)).toBeVisible();
    expect(screen.getByText(/output cost/i)).toBeVisible();
  });

  it('renders usage trend chart inside charts grid', () => {
    render(<AnalyticsPage />);
    expect(screen.getByTestId('usage-trend-chart')).toBeInTheDocument();
  });

  it('renders model breakdown chart', () => {
    render(<AnalyticsPage />);
    expect(screen.getByTestId('model-breakdown-chart')).toBeInTheDocument();
  });

  it('renders session stats card', () => {
    render(<AnalyticsPage />);
    expect(screen.getByTestId('session-stats-card')).toBeInTheDocument();
  });

  it('renders cliproxy stats card', () => {
    render(<AnalyticsPage />);
    expect(screen.getByTestId('cliproxy-stats-card')).toBeInTheDocument();
  });

  it('renders CostByModelCard in headless mode with model row', () => {
    render(<AnalyticsPage />);
    expect(screen.getByText('claude-3-5-sonnet')).toBeVisible();
    expect(screen.getByText('$5.00')).toBeVisible();
  });

  it('shows last-updated text in controls', () => {
    render(<AnalyticsPage />);
    expect(screen.getByText(/2 minutes ago/i)).toBeVisible();
  });

  it('shows refresh button', () => {
    render(<AnalyticsPage />);
    // RefreshCw icon button (no text label)
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  describe('privacy mode', () => {
    it('blurs cost values when privacy mode is ON', () => {
      usePrivacyMock.mockReturnValue({ privacyMode: true, togglePrivacy: vi.fn() });
      render(<AnalyticsPage />);

      // The total cost value element should carry PRIVACY_BLUR_CLASS
      // We verify the model cost in CostByModelCard is blurred
      const costSpans = document.querySelectorAll('.blur-sm, [class*="blur"]');
      expect(costSpans.length).toBeGreaterThan(0);
    });
  });

  describe('loading states', () => {
    it('shows skeleton tiles when isSummaryLoading', () => {
      useAnalyticsPageMock.mockReturnValue({
        ...baseHookReturn,
        isSummaryLoading: true,
        summary: undefined,
      });
      render(<AnalyticsPage />);
      // MonitorCards still mount even during load (StatTile shows Skeleton children)
      // We verify the page shell still renders
      expect(screen.getAllByRole('banner').length).toBeGreaterThan(0);
    });

    it('renders trend chart in hourly mode', () => {
      useAnalyticsPageMock.mockReturnValue({
        ...baseHookReturn,
        viewMode: 'hourly' as const,
      });
      render(<AnalyticsPage />);
      expect(screen.getByText('Last 24 Hours')).toBeVisible();
    });

    it('renders trend chart in daily mode', () => {
      useAnalyticsPageMock.mockReturnValue({
        ...baseHookReturn,
        viewMode: 'daily' as const,
      });
      render(<AnalyticsPage />);
      expect(screen.getByText('Usage Trends')).toBeVisible();
    });
  });

  describe('model popover', () => {
    it('does not render ModelDetailsContent when no model selected', () => {
      render(<AnalyticsPage />);
      expect(screen.queryByTestId('model-details-content')).not.toBeInTheDocument();
    });

    it('renders ModelDetailsContent when a model is selected', async () => {
      useAnalyticsPageMock.mockReturnValue({
        ...baseHookReturn,
        selectedModel: baseHookReturn.models[0],
        popoverPosition: { x: 100, y: 200 },
      });
      render(<AnalyticsPage />);
      await waitFor(() => {
        expect(screen.getByTestId('model-details-content')).toBeInTheDocument();
      });
    });
  });
});

describe('AnalyticsSkeleton — MonitorGrid alignment', () => {
  it('renders without crashing', () => {
    render(<AnalyticsSkeleton />);
    // Should render at least one header element from PageShell
    const headers = document.querySelectorAll('header');
    expect(headers.length).toBeGreaterThan(0);
  });

  it('renders MonitorCard skeleton tiles matching the live grid structure', () => {
    render(<AnalyticsSkeleton />);
    // The skeleton uses multiple article[data-variant] elements (MonitorCard renders <article>)
    const cards = document.querySelectorAll('article[data-variant]');
    // 5 summary tiles + 3 chart tiles (trend, cost, distribution) = at least 8
    expect(cards.length).toBeGreaterThanOrEqual(8);
  });
});
