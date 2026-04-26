import { render, screen, userEvent, waitFor } from '@tests/setup/test-utils';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogsPage } from '@/pages/logs';

const fetchMock = vi.fn<typeof fetch>();

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }

  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => undefined;
  }

  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }

  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }
});

function jsonResponse(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

function buildEntries(source: string) {
  if (source === 'agent-runner') {
    return [
      {
        id: 'entry-2',
        timestamp: '2026-04-07T11:10:00.000Z',
        level: 'warn',
        source: 'agent-runner',
        event: 'task.retry',
        message: 'Worker retry scheduled',
        processId: 4121,
        runId: 'run-2',
        context: { attempt: 2, reason: 'network jitter' },
      },
    ];
  }

  return [
    {
      id: 'entry-1',
      timestamp: '2026-04-07T11:00:00.000Z',
      level: 'error',
      source: 'dashboard',
      event: 'logs.bootstrap',
      message: 'Boot sequence failed for dashboard logging',
      processId: 25582,
      runId: 'run-1',
      context: { component: 'dashboard', stage: 'bootstrap' },
    },
    {
      id: 'entry-2',
      timestamp: '2026-04-07T11:10:00.000Z',
      level: 'warn',
      source: 'agent-runner',
      event: 'task.retry',
      message: 'Worker retry scheduled',
      processId: 4121,
      runId: 'run-2',
      context: { attempt: 2, reason: 'network jitter' },
    },
  ];
}

function installFetchMock() {
  fetchMock.mockImplementation((input) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const parsed = new URL(url, 'http://localhost');

    if (parsed.pathname === '/api/logs/config') {
      return jsonResponse({
        logging: {
          enabled: true,
          level: 'info',
          rotate_mb: 10,
          retain_days: 7,
          redact: true,
          live_buffer_size: 250,
        },
      });
    }

    if (parsed.pathname === '/api/logs/sources') {
      return jsonResponse({
        sources: [
          {
            source: 'dashboard',
            label: 'Dashboard UI',
            kind: 'native',
            count: 18,
            lastTimestamp: '2026-04-07T11:00:00.000Z',
          },
          {
            source: 'agent-runner',
            label: 'Agent Runner',
            kind: 'legacy',
            count: 9,
            lastTimestamp: '2026-04-07T11:10:00.000Z',
          },
        ],
      });
    }

    if (parsed.pathname === '/api/logs/entries') {
      const source = parsed.searchParams.get('source') ?? 'all';
      const search = parsed.searchParams.get('search');
      const entries = buildEntries(source).filter((entry) =>
        search ? entry.message.toLowerCase().includes(search.toLowerCase()) : true
      );
      return jsonResponse({ entries });
    }

    return Promise.reject(new Error(`Unhandled request: ${url}`));
  });
}

describe('LogsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = fetchMock;
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 900,
    });
  });

  it('shows the loading skeleton while the initial queries are pending', () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));

    render(<LogsPage />);

    expect(screen.getByLabelText('Loading logs...')).toBeInTheDocument();
  });

  // Design system: PageHeader
  it('renders PageHeader with correct title', async () => {
    installFetchMock();
    render(<LogsPage />);
    // PageHeader h1 contains the page title
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Log Operations Center');
  });

  // Design system: KpiRow cards
  it('renders KpiRow with all four KPI cards', async () => {
    installFetchMock();
    render(<LogsPage />);
    // Wait for data to load
    await screen.findByRole('heading', { level: 1 });
    // Four KPI labels (use getAllByText since label text may appear in multiple elements)
    expect(screen.getAllByText('Pipeline').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Retention').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sources').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Entries').length).toBeGreaterThan(0);
  });

  it('KpiRow shows pipeline enabled state from config', async () => {
    installFetchMock();
    render(<LogsPage />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByText('Enabled')).toBeInTheDocument();
  });

  it('KpiRow shows retention days from config', async () => {
    installFetchMock();
    render(<LogsPage />);
    await screen.findByRole('heading', { level: 1 });
    // retain_days=7 → "7d"
    expect(screen.getByText('7d')).toBeInTheDocument();
  });

  // Design system: log stream MonitorCard mounts (tab content)
  it('renders Telemetry Stream tab content with log entry list', async () => {
    installFetchMock();
    render(<LogsPage />);
    // Stream tab is active by default
    expect(await screen.findByRole('tab', { name: /Telemetry Stream/i })).toBeInTheDocument();
    // Entry list renders
    expect(
      (await screen.findAllByText('Boot sequence failed for dashboard logging')).length
    ).toBeGreaterThan(0);
  });

  // Design system: Legacy Errors tab renders
  it('renders Legacy Errors tab and switches to it', async () => {
    installFetchMock();
    render(<LogsPage />);
    await screen.findByRole('heading', { level: 1 });
    const legacyTab = screen.getByRole('tab', { name: /Legacy Errors/i });
    await userEvent.click(legacyTab);
    expect(screen.getByText(/CLIProxy Failure Analysis/i)).toBeInTheDocument();
  });

  it('filters by source and search query', async () => {
    installFetchMock();

    render(<LogsPage />);

    expect(
      (await screen.findAllByText('Boot sequence failed for dashboard logging')).length
    ).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: 'Agent Runner' }));

    expect((await screen.findAllByText('Worker retry scheduled')).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(screen.queryAllByText('Boot sequence failed for dashboard logging')).toHaveLength(0);
    });

    await userEvent.clear(screen.getByLabelText('Search'));
    await userEvent.type(screen.getByLabelText('Search'), 'retry');

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some((call) =>
          String(call[0]).includes('/api/logs/entries?source=agent-runner')
        )
      ).toBe(true);
      expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('search=retry'))).toBe(
        true
      );
    });
  });

  it('shows the selected entry detail and raw context', async () => {
    installFetchMock();

    render(<LogsPage />);

    expect(
      (await screen.findAllByText('Boot sequence failed for dashboard logging')).length
    ).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: /Worker retry scheduled/i }));

    expect((await screen.findAllByText('task.retry')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('4121').length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('tab', { name: /Raw context/i }));

    expect(await screen.findByText(/network jitter/)).toBeInTheDocument();
    expect(screen.getByText(/run-2/)).toBeInTheDocument();
  });
});
