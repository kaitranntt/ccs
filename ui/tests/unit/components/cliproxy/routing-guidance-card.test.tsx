import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '../../../setup/test-utils';
import { RoutingGuidanceCard } from '@/components/cliproxy/routing-guidance-card';

describe('RoutingGuidanceCard', () => {
  it('shows the current strategy and applies an explicit change', async () => {
    const onApply = vi.fn();
    const onApplyAffinity = vi.fn();

    render(
      <RoutingGuidanceCard
        state={{
          strategy: 'round-robin',
          source: 'live',
          target: 'local',
          reachable: true,
        }}
        sessionAffinityState={{
          enabled: true,
          ttl: '1h',
          source: 'config',
          target: 'local',
          reachable: true,
          manageable: true,
        }}
        isLoading={false}
        isSaving={false}
        onApply={onApply}
        onApplyAffinity={onApplyAffinity}
      />
    );

    expect(screen.getByText('Routing strategy')).toBeInTheDocument();
    expect(screen.getAllByText('round-robin').length).toBeGreaterThan(0);
    expect(screen.getByText('Session affinity')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1h')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /fill first/i }));
    fireEvent.click(screen.getByRole('button', { name: /use fill-first/i }));

    expect(onApply).toHaveBeenCalledWith('fill-first');

    fireEvent.click(screen.getByRole('button', { name: /disable session affinity/i }));
    expect(onApplyAffinity).toHaveBeenCalledWith({ enabled: false, ttl: '1h' });
  });

  it('shows the error state and disables apply', () => {
    render(
      <RoutingGuidanceCard
        isLoading={false}
        isSaving={false}
        error={new Error('Remote CLIProxy is not reachable')}
        onApply={() => undefined}
        onApplyAffinity={() => undefined}
      />
    );

    expect(screen.getByText('Remote CLIProxy is not reachable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /use round-robin/i })).toBeDisabled();
  });

  it('shows remote session-affinity guidance when the setting is not manageable', () => {
    render(
      <RoutingGuidanceCard
        state={{
          strategy: 'round-robin',
          source: 'live',
          target: 'remote',
          reachable: true,
        }}
        sessionAffinityState={{
          source: 'unsupported',
          target: 'remote',
          reachable: true,
          manageable: false,
          message: 'Remote session-affinity management is not supported from CCS yet.',
        }}
        isLoading={false}
        isSaving={false}
        onApply={() => undefined}
        onApplyAffinity={() => undefined}
      />
    );

    expect(
      screen.getByText('Remote session-affinity management is not supported from CCS yet.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /session affinity unavailable/i })).toBeDisabled();
  });

  it('compact: pool ON shows the drain-order pointer and an inline override warning', () => {
    render(
      <RoutingGuidanceCard
        compact
        state={{
          strategy: 'fill-first',
          source: 'live',
          target: 'local',
          reachable: true,
          poolRouting: { enabled: true, maxRetryCredentials: 3 },
        }}
        sessionAffinityState={{
          enabled: true,
          ttl: '1h',
          source: 'config',
          target: 'local',
          reachable: true,
          manageable: true,
        }}
        isLoading={false}
        isSaving={false}
        onApply={() => undefined}
        onApplyAffinity={() => undefined}
      />
    );

    // Drain-order CLI pointer is visible (not hidden behind a hover tooltip).
    expect(
      screen.getByText(/ccs cliproxy quota or ccs cliproxy accounts order/i)
    ).toBeInTheDocument();
    // Max retry stays visible in the badge.
    expect(screen.getByText(/On · Max retry 3/i)).toBeInTheDocument();
    // Static override warning is rendered before the user clicks anything.
    expect(
      screen.getByText(/will not take effect until you disable it: ccs cliproxy pool --disable/i)
    ).toBeInTheDocument();
  });

  it('compact: pool OFF surfaces the how-to-enable command as visible text', () => {
    render(
      <RoutingGuidanceCard
        compact
        state={{
          strategy: 'round-robin',
          source: 'live',
          target: 'local',
          reachable: true,
          poolRouting: { enabled: false },
        }}
        sessionAffinityState={{
          enabled: false,
          ttl: '1h',
          source: 'config',
          target: 'local',
          reachable: true,
          manageable: true,
        }}
        isLoading={false}
        isSaving={false}
        onApply={() => undefined}
        onApplyAffinity={() => undefined}
      />
    );

    // The enable command is visible, not buried in a hover-only tooltip.
    expect(screen.getByText(/ccs cliproxy pool --enable/i)).toBeInTheDocument();
    // No override warning when pool is off.
    expect(screen.queryByText(/ccs cliproxy pool --disable/i)).not.toBeInTheDocument();
  });

  it('compact: remote pool (manageable false) shows a local-only note, not a confident On/Off', () => {
    render(
      <RoutingGuidanceCard
        compact
        state={{
          strategy: 'round-robin',
          source: 'live',
          target: 'remote',
          reachable: true,
          poolRouting: {
            enabled: true,
            manageable: false,
            message: 'Pool routing is managed locally; this remote proxy may not reflect it.',
          },
        }}
        sessionAffinityState={{
          source: 'unsupported',
          target: 'remote',
          reachable: true,
          manageable: false,
        }}
        isLoading={false}
        isSaving={false}
        onApply={() => undefined}
        onApplyAffinity={() => undefined}
      />
    );

    expect(
      screen.getByText('Pool routing is managed locally; this remote proxy may not reflect it.')
    ).toBeInTheDocument();
    // No override warning for a remote proxy the local flag does not manage.
    expect(screen.queryByText(/ccs cliproxy pool --disable/i)).not.toBeInTheDocument();
  });
});
