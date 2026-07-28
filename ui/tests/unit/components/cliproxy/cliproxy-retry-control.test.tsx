import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '../../../setup/test-utils';
import { CliproxyRetryControl } from '@/components/cliproxy/cliproxy-retry-control';

const hookState = vi.hoisted(() => ({
  query: {
    data: {
      request_retry: 2,
      max_retry_interval: 20,
      source: 'live' as const,
      target: 'local' as const,
      reachable: true,
      manageable: true,
      message: undefined as string | undefined,
    },
    isLoading: false,
    isError: false,
    error: null as Error | null,
  },
  mutation: {
    isPending: false,
    mutate: vi.fn(),
  },
}));

vi.mock('@/hooks/use-cliproxy', () => ({
  useCliproxyRetryConfig: () => hookState.query,
  useUpdateCliproxyRetryConfig: () => hookState.mutation,
}));

describe('CliproxyRetryControl', () => {
  beforeEach(() => {
    hookState.query.data = {
      request_retry: 2,
      max_retry_interval: 20,
      source: 'live',
      target: 'local',
      reachable: true,
      manageable: true,
      message: undefined,
    };
    hookState.query.isLoading = false;
    hookState.query.isError = false;
    hookState.query.error = null;
    hookState.mutation.isPending = false;
    hookState.mutation.mutate.mockReset();
  });

  it('updates the pair through the dedicated retry mutation', () => {
    render(<CliproxyRetryControl />);
    const requestRetry = screen.getByRole('textbox', { name: 'Request retry count' });
    fireEvent.change(requestRetry, { target: { value: '4' } });
    fireEvent.blur(requestRetry);

    expect(hookState.mutation.mutate).toHaveBeenCalledWith({
      request_retry: 4,
      max_retry_interval: 20,
    });
    expect(screen.getByText(/live · local/i)).toBeInTheDocument();
  });

  it('rejects values outside the safe non-negative integer range', () => {
    render(<CliproxyRetryControl />);
    const requestRetry = screen.getByRole('textbox', { name: 'Request retry count' });
    fireEvent.change(requestRetry, { target: { value: String(Number.MAX_SAFE_INTEGER + 1) } });
    fireEvent.blur(requestRetry);

    expect(hookState.mutation.mutate).not.toHaveBeenCalled();
    expect(screen.getByText('Must be a whole number, 0 or greater.')).toBeInTheDocument();
  });

  it('disables editing on query errors, unmanageable state, or a pending update', () => {
    hookState.query.isError = true;
    hookState.query.error = new Error('Retry management unavailable');
    const { rerender } = render(<CliproxyRetryControl />);
    expect(screen.getByRole('textbox', { name: 'Request retry count' })).toBeDisabled();
    expect(screen.getByText('Retry management unavailable')).toBeInTheDocument();

    hookState.query.isError = false;
    hookState.query.error = null;
    hookState.query.data = { ...hookState.query.data, manageable: false };
    rerender(<CliproxyRetryControl />);
    expect(screen.getByRole('textbox', { name: 'Request retry count' })).toBeDisabled();

    hookState.query.data = { ...hookState.query.data, manageable: true };
    hookState.mutation.isPending = true;
    rerender(<CliproxyRetryControl />);
    expect(screen.getByRole('textbox', { name: 'Request retry count' })).toBeDisabled();
  });
});
