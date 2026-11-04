import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent, within } from '@tests/setup/test-utils';
import { AccountsSection } from '@/components/cliproxy/provider-editor/accounts-section';
import { CliproxyDialog } from '@/components/cliproxy/cliproxy-dialog';
import { ProviderCard } from '@/components/monitoring/auth-monitor/components/provider-card';
import { AccountStep } from '@/components/setup/wizard/steps/account-step';
import { VariantStep } from '@/components/setup/wizard/steps/variant-step';
import type { OAuthAccount } from '@/lib/api-client';

const { createVariant } = vi.hoisted(() => ({ createVariant: vi.fn() }));

const accounts: OAuthAccount[] = [
  {
    id: 'user@example.com#team',
    email: 'user@example.com',
    nickname: 'Work',
    provider: 'codex',
    isDefault: false,
    tokenFile: 'codex-user@example.com-team.json',
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'user@example.com#free',
    email: 'user@example.com',
    nickname: 'Personal',
    provider: 'codex',
    isDefault: true,
    tokenFile: 'codex-user@example.com-free.json',
    createdAt: '2026-01-01T00:00:00Z',
  },
];

vi.mock('@/hooks/use-cliproxy', () => ({
  useCreateVariant: () => ({ mutateAsync: createVariant, isPending: false }),
  useCliproxyAuth: () => ({ data: { authStatus: [{ provider: 'codex', accounts }] } }),
}));

vi.mock('@/hooks/use-cliproxy-stats', () => ({
  useCliproxyStats: () => ({ data: undefined }),
  useAccountQuota: () => ({ data: undefined, isLoading: false }),
}));

describe('saved account nickname surfaces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(window.localStorage.getItem).mockReturnValue(null);
  });

  it('keeps same-email accounts distinct in detailed cards and bulk selection uses exact IDs', async () => {
    const pause = vi.fn();
    const reauth = vi.fn();
    render(
      <AccountsSection
        accounts={accounts}
        onAddAccount={vi.fn()}
        onSetDefault={vi.fn()}
        onRemoveAccount={vi.fn()}
        onReauthAccount={reauth}
        onBulkPause={pause}
        onBulkResume={vi.fn()}
      />
    );
    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getByText('Personal')).toBeInTheDocument();
    expect(screen.getByText('user@example.com (Business)')).toBeInTheDocument();
    expect(screen.getByText('user@example.com (Free)')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Select account' })[0]);
    await userEvent.click(screen.getByRole('button', { name: /Pause/i }));
    expect(pause).toHaveBeenCalledWith([accounts[0].id]);
  });

  it('selects the account object by ID even when nicknames are equal', async () => {
    const onSelect = vi.fn();
    const duplicateNames = accounts.map((account) => ({ ...account, nickname: 'Shared' }));
    render(
      <AccountStep
        accounts={duplicateNames}
        privacyMode={false}
        onSelect={onSelect}
        onAddNew={vi.fn()}
        onBack={vi.fn()}
      />
    );
    const choices = screen.getAllByRole('button', { name: /Shared/ });
    expect(choices).toHaveLength(2);
    expect(within(choices[0]).getByText('user@example.com (Business)')).toBeInTheDocument();
    expect(within(choices[1]).getByText('user@example.com (Free)')).toBeInTheDocument();
    await userEvent.click(choices[1]);
    expect(onSelect).toHaveBeenCalledWith(duplicateNames[1]);
  });

  it('shows nicknames in native selector labels while preserving option values', async () => {
    render(<CliproxyDialog open onClose={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText('Provider'), 'codex');
    const select = screen.getByLabelText('Account');
    expect(within(select).getByRole('option', { name: /^Work/ })).toHaveValue(accounts[0].id);
    const personal = within(select).getByRole('option', { name: /^Personal/ });
    expect(personal).toHaveValue(accounts[1].id);
    await userEvent.selectOptions(select, accounts[1].id);
    expect(select).toHaveValue(accounts[1].id);
  });

  it('masks native selector labels in privacy mode', async () => {
    vi.mocked(window.localStorage.getItem).mockImplementation((key) =>
      key === 'ccs-privacy-mode' ? 'true' : null
    );
    render(<CliproxyDialog open onClose={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText('Provider'), 'codex');
    const select = screen.getByLabelText('Account');
    expect(within(select).queryByRole('option', { name: /Work|Personal|user@example/ })).toBeNull();
    expect(
      within(select)
        .getAllByRole('option')
        .slice(1)
        .map((option) => option.getAttribute('value'))
    ).toEqual(accounts.map(({ id }) => id));
  });

  it('shows nickname and underlying identity in setup confirmation with privacy masking', () => {
    render(
      <VariantStep
        selectedProvider="codex"
        selectedAccount={accounts[0]}
        variantName="work"
        modelName="model"
        catalog={{ models: [{ id: 'model', name: 'Model' }] }}
        isPending={false}
        privacyMode
        onVariantNameChange={vi.fn()}
        onModelChange={vi.fn()}
        onBack={vi.fn()}
        onSkip={vi.fn()}
        onCreate={vi.fn()}
      />
    );
    expect(screen.getByText('Work')).toHaveClass('blur-[4px]');
    expect(screen.getByText('user@example.com (Business)')).toHaveClass('blur-[4px]');
  });

  it('includes grouped variant nicknames in monitor tooltips and hides them in privacy mode', () => {
    const stats = {
      provider: 'codex',
      displayName: 'Codex',
      accountCount: 1,
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      accounts: [
        {
          ...accounts[0],
          displayName: 'Codex',
          color: '#000',
          successCount: 0,
          failureCount: 0,
          variants: accounts.map((account) => ({
            ...account,
            successCount: 0,
            failureCount: 0,
            audience: 'unknown' as const,
            audienceLabel: null,
            detailLabel: null,
            compactDetailLabel: null,
            inlineLabel: null,
          })),
        },
      ],
    };
    const card = (privacyMode: boolean) => (
      <ProviderCard
        stats={stats}
        privacyMode={privacyMode}
        isHovered={false}
        onSelect={vi.fn()}
        onMouseEnter={vi.fn()}
        onMouseLeave={vi.fn()}
      />
    );
    const { rerender, container } = render(card(false));
    expect(container.querySelector('[title]')?.getAttribute('title')).toMatch(/^Work.*Personal/);
    rerender(card(true));
    expect(container.querySelector('[title]')).toHaveAttribute('title', '••••••');
  });
});
