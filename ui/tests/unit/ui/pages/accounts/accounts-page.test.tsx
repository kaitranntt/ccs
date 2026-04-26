/**
 * Accounts Page — Unit Tests
 *
 * Covers:
 * - PageHeader title renders
 * - Action rail renders (create, auth, open pool)
 * - Legacy migration follow-up shown/hidden
 * - AccountsTable renders with account data
 * - ContinuityOverview mounts
 * - Create account dialog opens via action rail button
 * - Confirm legacy button triggers mutation
 * - Navigate calls for pool buttons
 * - CreateAuthProfileDialog renders
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent } from '@tests/setup/test-utils';

// ─── Mock navigate ────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const mod = await importOriginal<typeof import('react-router-dom')>();
  return { ...mod, useNavigate: () => mockNavigate };
});

// ─── Mock hooks ───────────────────────────────────────────────────────────────

const confirmLegacyMutate = vi.fn();

const accountState = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: null as any,
  isLoading: false,
  isPending: false,
}));

vi.mock('@/hooks/use-accounts', () => ({
  useAccounts: () => ({
    data: accountState.data,
    isLoading: accountState.isLoading,
  }),
  useConfirmLegacyAccountPolicies: () => ({
    mutate: confirmLegacyMutate,
    isPending: accountState.isPending,
  }),
}));

// ─── Mock heavy sub-components ───────────────────────────────────────────────

vi.mock('@/components/account/continuity-overview', () => ({
  ContinuityOverview: ({ totalAccounts }: { totalAccounts: number }) => (
    <div data-testid="continuity-overview" data-total={totalAccounts} />
  ),
}));

vi.mock('@/components/account/accounts-table', () => ({
  AccountsTable: ({ data }: { data: unknown[] }) => (
    <div data-testid="accounts-table" data-count={data.length} />
  ),
}));

vi.mock('@/components/account/create-auth-profile-dialog', () => ({
  CreateAuthProfileDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="create-dialog" /> : null,
}));

// ─── Import page after mocks ─────────────────────────────────────────────────

import { AccountsPage } from '@/pages/accounts';

// ─── Baseline account data ────────────────────────────────────────────────────

const baseAccount = (name: string, legacy = false) => ({
  name,
  context_inferred: legacy,
  continuity_inferred: false,
});

const makeData = (
  accounts: ReturnType<typeof baseAccount>[] = [],
  overrides: Partial<NonNullable<typeof accountState.data>> = {}
) => ({
  accounts,
  default: null,
  cliproxyCount: 0,
  legacyContextCount: 0,
  legacyContinuityCount: 0,
  sharedCount: 0,
  sharedStandardCount: 0,
  deeperSharedCount: 0,
  isolatedCount: 0,
  sharedAloneCount: 0,
  sharedPeerAccountCount: 0,
  deeperReadyAccountCount: 0,
  sharedPeerGroups: [],
  deeperReadyGroups: [],
  sharedGroups: [],
  groupSummaries: [],
  plainCcsLane: null,
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AccountsPage', () => {
  beforeEach(() => {
    accountState.data = makeData();
    accountState.isLoading = false;
    accountState.isPending = false;
    mockNavigate.mockReset();
    confirmLegacyMutate.mockReset();
  });

  describe('PageHeader', () => {
    it('renders the page title', () => {
      render(<AccountsPage />);
      // 'Accounts' appears in both desktop PageHeader and mobile card header
      const titles = screen.getAllByText('Accounts');
      expect(titles.length).toBeGreaterThan(0);
    });
  });

  describe('Action rail — primary buttons', () => {
    it('renders create account button', () => {
      render(<AccountsPage />);
      // Appears in desktop rail and mobile fallback
      const buttons = screen.getAllByRole('button', { name: 'Create Account' });
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('renders auth claude in pool button', () => {
      render(<AccountsPage />);
      const buttons = screen.getAllByRole('button', { name: 'Authenticate Claude in Pool' });
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('navigates to cliproxy claude pool on open pool button click', async () => {
      render(<AccountsPage />);
      const buttons = screen.getAllByRole('button', { name: 'Open Claude Pool Settings' });
      await userEvent.click(buttons[0]);
      expect(mockNavigate).toHaveBeenCalledWith('/cliproxy?provider=claude');
    });

    it('navigates to cliproxy auth action on auth claude in pool button click', async () => {
      render(<AccountsPage />);
      const buttons = screen.getAllByRole('button', { name: 'Authenticate Claude in Pool' });
      await userEvent.click(buttons[0]);
      expect(mockNavigate).toHaveBeenCalledWith('/cliproxy?provider=claude&action=auth');
    });
  });

  describe('Create account dialog', () => {
    it('dialog is closed by default', () => {
      render(<AccountsPage />);
      expect(screen.queryByTestId('create-dialog')).not.toBeInTheDocument();
    });

    it('opens dialog when create account button is clicked', async () => {
      render(<AccountsPage />);
      const buttons = screen.getAllByRole('button', { name: 'Create Account' });
      await userEvent.click(buttons[0]);
      expect(screen.getByTestId('create-dialog')).toBeInTheDocument();
    });
  });

  describe('Legacy migration follow-up', () => {
    it('shows no legacy message when no legacy accounts', () => {
      accountState.data = makeData([baseAccount('work', false)]);
      render(<AccountsPage />);
      const noLegacy = screen.getAllByText('No legacy follow-up pending.');
      expect(noLegacy.length).toBeGreaterThan(0);
    });

    it('shows legacy warning when accounts have context_inferred flag', () => {
      accountState.data = makeData([baseAccount('work', true)], { legacyContextCount: 1 });
      render(<AccountsPage />);
      // i18n interpolates "1 account still needs first-time mode confirmation."
      const warnings = screen.getAllByText(/account still needs first-time mode confirmation\./i);
      expect(warnings.length).toBeGreaterThan(0);
    });

    it('calls confirmLegacy mutation when confirm button is clicked', async () => {
      accountState.data = makeData([baseAccount('work', true)], { legacyContextCount: 1 });
      render(<AccountsPage />);
      const confirmButtons = screen.getAllByRole('button', {
        name: /Confirm Legacy Policies/i,
      });
      await userEvent.click(confirmButtons[0]);
      expect(confirmLegacyMutate).toHaveBeenCalledTimes(1);
      expect(confirmLegacyMutate).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ name: 'work' })])
      );
    });

    it('disables confirm button and shows pending label when mutation is pending', () => {
      accountState.isPending = true;
      accountState.data = makeData([baseAccount('work', true)], { legacyContextCount: 1 });
      render(<AccountsPage />);
      const confirmButtons = screen.getAllByRole('button', {
        name: 'Confirming Legacy Policies...',
      });
      confirmButtons.forEach((btn) => expect(btn).toBeDisabled());
    });
  });

  describe('AccountsTable', () => {
    it('renders accounts table with account data', () => {
      accountState.data = makeData([baseAccount('work'), baseAccount('personal')]);
      render(<AccountsPage />);
      const tables = screen.getAllByTestId('accounts-table');
      expect(tables.length).toBeGreaterThan(0);
      expect(tables[0]).toHaveAttribute('data-count', '2');
    });

    it('shows loading state while fetching', () => {
      accountState.isLoading = true;
      accountState.data = null;
      render(<AccountsPage />);
      const loadingTexts = screen.getAllByText('Loading accounts...');
      expect(loadingTexts.length).toBeGreaterThan(0);
    });
  });

  describe('ContinuityOverview', () => {
    it('mounts with total account count', () => {
      accountState.data = makeData([baseAccount('work'), baseAccount('personal')]);
      render(<AccountsPage />);
      const overviews = screen.getAllByTestId('continuity-overview');
      expect(overviews.length).toBeGreaterThan(0);
      expect(overviews[0]).toHaveAttribute('data-total', '2');
    });
  });
});
