import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '../../../setup/test-utils';
import type { ClaudePoolPolicyStatus } from '@shared/claude-pool-policy';
import { ClaudePoolPolicyControl } from '@/components/cliproxy/claude-pool-policy-control';

const NOW = Date.parse('2026-11-02T12:00:00Z');
const POLICY_PATH = '/api/cliproxy/routing/claude-quota';
const ACCOUNTS_PATH = '/api/cliproxy/auth/accounts/claude';

function makeStatus(overrides: Partial<ClaudePoolPolicyStatus> = {}): ClaudePoolPolicyStatus {
  return {
    enabled: false,
    status: 'inactive',
    controllerActive: true,
    lastReconciledAt: NOW - 60_000,
    accounts: [],
    ...overrides,
  };
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockApi(initial: ClaudePoolPolicyStatus) {
  let status = initial;
  const updates: boolean[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === POLICY_PATH) {
      if (init?.method === 'PUT') {
        const enabled = JSON.parse(String(init.body)).enabled as boolean;
        updates.push(enabled);
        status = { ...status, enabled, status: enabled ? 'active' : 'inactive' };
      }
      return json(status);
    }
    if (url === ACCOUNTS_PATH) {
      return json({
        provider: 'claude',
        accounts: [
          { id: 'person@example.test#team', email: 'person@example.test', nickname: 'My team' },
          {
            id: 'person@example.test#personal',
            email: 'person@example.test',
            nickname: 'Personal',
          },
        ],
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, updates };
}

describe('ClaudePoolPolicyControl', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    vi.mocked(window.localStorage.getItem).mockReturnValue(null);
  });

  it('requires an explicit switch and restores the prior order when switched off', async () => {
    const { updates } = mockApi(makeStatus());
    render(<ClaudePoolPolicyControl poolEnabled manageable />);
    const toggle = screen.getByRole('switch', { name: 'Claude quota priority' });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).not.toBeChecked();
    expect(updates).toEqual([]);

    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    expect(updates).toEqual([true]);
    expect(screen.getByText('Applied')).toBeInTheDocument();

    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(updates).toEqual([true, false]);
    expect(screen.getByText('Off')).toBeInTheDocument();
  });

  it('does not optimistically enable a policy rejected by the server', async () => {
    let finishUpdate: (response: Response) => void = () => undefined;
    const updateResult = new Promise<Response>((resolve) => {
      finishUpdate = resolve;
    });
    const { fetchMock } = mockApi(makeStatus());
    fetchMock.mockImplementation(async (_input, init) =>
      init?.method === 'PUT' ? updateResult : json(makeStatus())
    );
    render(<ClaudePoolPolicyControl poolEnabled manageable />);
    const toggle = screen.getByRole('switch', { name: 'Claude quota priority' });
    await waitFor(() => expect(toggle).toBeEnabled());
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeDisabled());
    expect(toggle).not.toBeChecked();

    finishUpdate(json({ error: 'This proxy does not support priority-aware affinity.' }, 409));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'does not support priority-aware affinity'
    );
    expect(toggle).not.toBeChecked();
    expect(toggle).toBeEnabled();
  });

  it('does not allow enabling without pool routing but permits turning an existing policy off', async () => {
    mockApi(makeStatus());
    const { rerender } = render(<ClaudePoolPolicyControl poolEnabled={false} manageable />);
    await screen.findByText('Off');
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.getByText(/Enable pool routing before/)).toBeInTheDocument();

    mockApi(makeStatus({ enabled: true, status: 'degraded' }));
    rerender(<ClaudePoolPolicyControl poolEnabled={false} manageable key="enabled" />);
    await waitFor(() => expect(screen.getByRole('switch')).toBeChecked());
    expect(screen.getByRole('switch')).toBeEnabled();
  });

  it('does not query or claim an effective policy on a remote target', () => {
    const { fetchMock } = mockApi(makeStatus());
    render(<ClaudePoolPolicyControl poolEnabled manageable={false} />);
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(
      screen.getByText('Manage this policy on the server that owns the accounts.')
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps a failed restoration visible after the automatic policy is off', async () => {
    mockApi(
      makeStatus({
        enabled: false,
        status: 'degraded',
        error: 'Some account priorities could not be restored.',
      })
    );
    render(<ClaudePoolPolicyControl poolEnabled manageable />);
    expect(await screen.findByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('could not be restored');
    expect(screen.queryByText('Off')).not.toBeInTheDocument();
    expect(screen.getByRole('switch')).not.toBeChecked();
  });

  it.each([
    ['pending', true, 'Pending'],
    ['degraded', true, 'Needs attention'],
    ['active', false, 'Pending'],
  ] as const)(
    'shows %s with controller=%s without claiming applied',
    async (status, controllerActive, label) => {
      mockApi(makeStatus({ enabled: true, status, controllerActive }));
      render(<ClaudePoolPolicyControl poolEnabled manageable />);
      expect(await screen.findByText(label)).toBeInTheDocument();
      expect(screen.queryByText('Applied')).not.toBeInTheDocument();
      if (!controllerActive)
        expect(screen.getByRole('status')).toHaveTextContent(
          'Waiting for a running CCS controller'
        );
    }
  );

  it('shows the full order and explains model exclusion, failover and stale retention', async () => {
    mockApi(makeStatus());
    render(<ClaudePoolPolicyControl poolEnabled manageable compact />);
    fireEvent.click(screen.getByRole('button', { name: 'Quota priority details' }));
    expect(screen.getByRole('button', { name: 'Hide quota priority details' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '5-hour quota only',
      '5-hour and weekly quotas',
      'Weekly quota only',
      'Unknown general quotas (last resort)',
    ]);
    expect(
      screen.getByText(/Fable and other model-specific limits do not affect/)
    ).toBeInTheDocument();
    expect(screen.getByText(/the next request moves there/)).toBeInTheDocument();
    expect(screen.getByText(/up to six hours/)).toBeInTheDocument();
    expect(
      screen.getByText(/Setting a manual order turns automatic priority off/)
    ).toBeInTheDocument();
    expect(await screen.findByText('Last update 1 minute ago')).toBeInTheDocument();
  });

  it('uses saved nicknames for same-email accounts and shows confirmation ages separately', async () => {
    mockApi(
      makeStatus({
        enabled: true,
        status: 'active',
        accounts: [
          {
            accountId: 'person@example.test#team',
            class: 'five-hour-only',
            confirmedAt: NOW - 120_000,
            desiredPriority: 4,
            effectivePriority: 4,
            state: 'applied',
          },
          {
            accountId: 'person@example.test#personal',
            class: 'weekly-only',
            confirmedAt: null,
            desiredPriority: 2,
            effectivePriority: null,
            state: 'pending',
          },
        ],
      })
    );
    render(<ClaudePoolPolicyControl poolEnabled manageable />);
    await screen.findByText('Applied');
    fireEvent.click(screen.getByRole('button', { name: 'Quota priority details' }));
    const list = await screen.findByRole('list', { name: 'Claude account quota groups' });
    expect(await within(list).findByText('My team')).toBeInTheDocument();
    expect(within(list).getByText('Personal')).toBeInTheDocument();
    expect(within(list).getByText('Confirmed 2 minutes ago')).toBeInTheDocument();
    expect(within(list).getByText('No confirmed general quota data')).toBeInTheDocument();
    expect(within(list).getByText('Pending')).toBeInTheDocument();
    expect(within(list).getAllByText(/person@example.test/)).toHaveLength(2);
  });

  it('masks nicknames, secondary identities and backend messages in privacy mode without hover titles', async () => {
    vi.mocked(window.localStorage.getItem).mockReturnValue('true');
    mockApi(
      makeStatus({
        enabled: true,
        status: 'degraded',
        error: 'Order for person@example.test#team changed externally.',
        accounts: [
          {
            accountId: 'person@example.test#team',
            class: 'five-hour-only',
            confirmedAt: NOW,
            desiredPriority: 4,
            effectivePriority: 9,
            state: 'drift',
          },
        ],
      })
    );
    render(<ClaudePoolPolicyControl poolEnabled manageable />);
    fireEvent.click(screen.getByRole('button', { name: 'Quota priority details' }));
    const name = await screen.findByText('My team');
    expect(name).toHaveClass('blur-[4px]');
    expect(name).not.toHaveAttribute('title');
    const list = screen.getByRole('list', { name: 'Claude account quota groups' });
    const identity = within(list).getByText(/person@example.test/);
    expect(identity).toHaveClass('blur-[4px]');
    expect(identity).not.toHaveAttribute('title');
    expect(screen.getByRole('alert')).toHaveClass('blur-[4px]');
    expect(within(list).getByText('Order changed externally')).toBeInTheDocument();
  });

  it('advances displayed age on status refresh without renewing the confirmation timestamp', async () => {
    mockApi(
      makeStatus({
        enabled: true,
        status: 'active',
        accounts: [
          {
            accountId: 'person@example.test#team',
            class: 'five-hour-only',
            confirmedAt: NOW - 120_000,
            desiredPriority: 4,
            effectivePriority: 4,
            state: 'applied',
          },
        ],
      })
    );
    const { queryClient } = render(<ClaudePoolPolicyControl poolEnabled manageable />);
    await screen.findByText('Applied');
    fireEvent.click(screen.getByRole('button', { name: 'Quota priority details' }));
    expect(await screen.findByText('Confirmed 2 minutes ago')).toBeInTheDocument();

    vi.mocked(Date.now).mockReturnValue(NOW + 60_000);
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['cliproxy-claude-pool-policy'] });
    });
    expect(screen.getByText('Confirmed 3 minutes ago')).toBeInTheDocument();
  });
});
