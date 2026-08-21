import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '../../../setup/test-utils';

const COLLAPSED_STORAGE_KEY = 'cliproxy-status-widget-collapsed';

const mocks = vi.hoisted(() => ({
  noopMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/use-cliproxy', () => ({
  useProxyStatus: () => ({
    data: { running: true, port: 8317, sessionCount: 1 },
    isLoading: false,
  }),
  useCliproxyUpdateCheck: () => ({ data: { backendLabel: 'CLIProxy', currentVersion: '7.2.137' } }),
  useCliproxyVersions: () => ({ data: undefined, isLoading: false }),
  useCliproxyRoutingStrategy: () => ({ data: undefined, isLoading: false, error: null }),
  useCliproxySessionAffinity: () => ({ data: undefined, isLoading: false, error: null }),
  useUpdateCliproxyRoutingStrategy: mocks.noopMutation,
  useUpdateCliproxySessionAffinity: mocks.noopMutation,
  useStartProxy: mocks.noopMutation,
  useStopProxy: mocks.noopMutation,
  useRestartProxy: mocks.noopMutation,
  useInstallVersion: mocks.noopMutation,
}));

vi.mock('@/hooks/use-cliproxy-sync', () => ({
  useSyncStatus: () => ({ data: { configured: true } }),
  useExecuteSync: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/lib/api-client', () => ({
  api: {
    cliproxyServer: {
      get: () => Promise.resolve({ remote: { enabled: false, host: '' } }),
    },
  },
}));

vi.mock('@/components/cliproxy/routing-guidance-card', () => ({
  RoutingGuidanceCard: () => <div data-testid="routing-guidance-card" />,
}));

import { ProxyStatusWidget } from '@/components/monitoring/proxy-status-widget';

describe('ProxyStatusWidget collapse', () => {
  beforeEach(() => {
    vi.mocked(window.localStorage.getItem).mockReturnValue(null);
    vi.mocked(window.localStorage.setItem).mockClear();
  });

  it('shows the routing and status detail by default', () => {
    render(<ProxyStatusWidget />);

    expect(screen.getByTestId('routing-guidance-card')).toBeInTheDocument();
    expect(screen.getByText('v7.2.137')).toBeInTheDocument();
  });

  it('hides the detail and persists the preference when collapsed', () => {
    render(<ProxyStatusWidget />);

    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));

    expect(screen.queryByTestId('routing-guidance-card')).toBeNull();
    expect(window.localStorage.setItem).toHaveBeenCalledWith(COLLAPSED_STORAGE_KEY, 'true');
  });

  it('keeps the status row and version visible while collapsed', () => {
    render(<ProxyStatusWidget />);

    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));

    expect(screen.getByText('CLIProxy')).toBeInTheDocument();
    expect(screen.getByText('v7.2.137')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument();
  });

  it('starts collapsed when the stored preference says so', () => {
    vi.mocked(window.localStorage.getItem).mockReturnValue('true');

    render(<ProxyStatusWidget />);

    expect(screen.queryByTestId('routing-guidance-card')).toBeNull();
    expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument();
  });

  it('reveals the detail again when version settings are opened while collapsed', () => {
    vi.mocked(window.localStorage.getItem).mockReturnValue('true');

    render(<ProxyStatusWidget />);

    fireEvent.click(screen.getByRole('button', { name: 'Version settings' }));

    expect(screen.getByTestId('routing-guidance-card')).toBeInTheDocument();
    expect(window.localStorage.setItem).toHaveBeenCalledWith(COLLAPSED_STORAGE_KEY, 'false');
  });
});
