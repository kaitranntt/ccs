import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SyncStatusCard } from '@/components/cliproxy/sync/sync-status-card';

const mocks = vi.hoisted(() => ({
  useSyncStatus: vi.fn(),
  useExecuteSync: vi.fn(),
}));

vi.mock('@/hooks/use-cliproxy-sync', () => ({
  useSyncStatus: mocks.useSyncStatus,
  useExecuteSync: mocks.useExecuteSync,
}));

vi.mock('@/components/cliproxy/sync/sync-dialog', () => ({
  SyncDialog: () => null,
}));

describe('SyncStatusCard', () => {
  beforeEach(() => {
    mocks.useExecuteSync.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
  });

  it('renders the doctor hint with an inline code element when unconfigured', () => {
    mocks.useSyncStatus.mockReturnValue({
      data: { configured: false },
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<SyncStatusCard />);

    const codeEl = screen.getByText('ccs doctor --fix');
    expect(codeEl.tagName).toBe('CODE');
    expect(codeEl.parentElement?.textContent).toBe('Run ccs doctor --fix to generate config.');
  });
});
