import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthMonitorData } from '@/components/monitoring/auth-monitor/hooks';

const { useCliproxyAuthMock, useCliproxyStatsMock, useCliproxyStatusMock } = vi.hoisted(() => ({
  useCliproxyAuthMock: vi.fn(),
  useCliproxyStatsMock: vi.fn(),
  useCliproxyStatusMock: vi.fn(),
}));

vi.mock('@/hooks/use-cliproxy', () => ({
  useCliproxyAuth: useCliproxyAuthMock,
}));

vi.mock('@/hooks/use-cliproxy-stats', () => ({
  useCliproxyStats: useCliproxyStatsMock,
  useCliproxyStatus: useCliproxyStatusMock,
}));

const authStatus = [
  {
    provider: 'codex',
    displayName: 'OpenAI Codex',
    accounts: [
      {
        id: 'codex-account',
        email: 'codex@example.com',
        tokenFile: '/tmp/codex.json',
        provider: 'codex',
        isDefault: true,
      },
    ],
  },
];

describe('useAuthMonitorData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCliproxyAuthMock.mockReturnValue({
      data: { authStatus },
      isLoading: false,
      error: null,
    });
    useCliproxyStatsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      dataUpdatedAt: 0,
    });
  });

  it('keeps account data visible without polling stats when CLIProxy is unavailable', () => {
    useCliproxyStatusMock.mockReturnValue({
      data: { running: false },
      isLoading: false,
    });

    const { result } = renderHook(() => useAuthMonitorData());

    expect(useCliproxyStatsMock).toHaveBeenCalledWith(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.accounts).toHaveLength(1);
    expect(result.current.totalRequests).toBe(0);
    expect(result.current.providerStats[0]).toMatchObject({
      provider: 'codex',
      accountCount: 1,
      totalRequests: 0,
    });
  });

  it('enables live stats only after CLIProxy is running', () => {
    useCliproxyStatusMock.mockReturnValue({
      data: { running: true },
      isLoading: false,
    });
    useCliproxyStatsMock.mockReturnValue({
      data: {
        accountStats: {
          'codex:codex@example.com': {
            source: 'codex@example.com',
            successCount: 8,
            failureCount: 2,
            totalTokens: 100,
            provider: 'codex',
          },
        },
      },
      isLoading: false,
      dataUpdatedAt: Date.now(),
    });

    const { result } = renderHook(() => useAuthMonitorData());

    expect(useCliproxyStatsMock).toHaveBeenCalledWith(true);
    expect(result.current.totalSuccess).toBe(8);
    expect(result.current.totalFailure).toBe(2);
    expect(result.current.totalRequests).toBe(10);
  });
});
