import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent } from '@tests/setup/test-utils';

const hookState = vi.hoisted(() => ({
  variantsData: { variants: [] as Array<{ name: string; provider: string; target?: string }> },
  authData: {
    authStatus: [
      {
        provider: 'gemini',
        displayName: 'Gemini',
        authenticated: true,
        accounts: [{ id: 'acct-1', provider: 'gemini' }],
      },
      {
        provider: 'ghcp',
        displayName: 'GitHub Copilot (OAuth)',
        authenticated: false,
        accounts: [],
      },
    ],
    source: 'local' as const,
  },
  catalogData: undefined as
    | {
        catalogs: Record<
          string,
          {
            provider: string;
            displayName: string;
            defaultModel: string;
            models: Array<{ id: string; name: string }>;
          }
        >;
      }
    | undefined,
}));

vi.mock('@/hooks/use-cliproxy', () => ({
  useCliproxy: () => ({
    data: hookState.variantsData,
    isFetching: false,
  }),
  useCliproxyAuth: () => ({
    data: hookState.authData,
    isLoading: false,
  }),
  useCliproxyCatalog: () => ({
    data: hookState.catalogData,
  }),
  useCliproxyUpdateCheck: () => ({
    data: undefined,
  }),
  useSetDefaultAccount: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveAccount: () => ({ mutate: vi.fn(), isPending: false }),
  usePauseAccount: () => ({ mutate: vi.fn(), isPending: false }),
  useResumeAccount: () => ({ mutate: vi.fn(), isPending: false }),
  useSoloAccount: () => ({ mutate: vi.fn(), isPending: false }),
  useBulkPauseAccounts: () => ({ mutate: vi.fn(), isPending: false }),
  useBulkResumeAccounts: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteVariant: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/components/quick-setup-wizard', () => ({
  QuickSetupWizard: ({ open }: { open: boolean }) =>
    open ? <div data-testid="advanced-variant-wizard" /> : null,
}));

vi.mock('@/components/monitoring/proxy-status-widget', () => ({
  ProxyStatusWidget: () => null,
}));

vi.mock('@/components/account/account-safety-warning-card', () => ({
  AccountSafetyWarningCard: () => null,
}));

vi.mock('@/components/cliproxy/provider-logo', () => ({
  ProviderLogo: () => <div>provider-logo</div>,
}));

vi.mock('@/components/cliproxy/provider-editor', () => ({
  ProviderEditor: ({ onAddAccount }: { onAddAccount: () => void }) => (
    <button onClick={onAddAccount}>open-add-account</button>
  ),
}));

vi.mock('@/components/account/add-account-dialog', () => ({
  AddAccountDialog: ({
    open,
    provider,
    catalog,
  }: {
    open: boolean;
    provider?: string;
    catalog?: { defaultModel?: string };
  }) =>
    open ? (
      <div
        data-testid="add-account-dialog"
        data-provider={provider}
        data-catalog={catalog?.defaultModel ?? 'missing'}
      />
    ) : null,
}));

import { CliproxyPage } from '@/pages/cliproxy';

describe('CliproxyPage add-account catalog gating', () => {
  beforeEach(() => {
    hookState.variantsData = { variants: [] };
    hookState.authData = {
      authStatus: [
        {
          provider: 'gemini',
          displayName: 'Gemini',
          authenticated: true,
          accounts: [{ id: 'acct-1', provider: 'gemini' }],
        },
        {
          provider: 'ghcp',
          displayName: 'GitHub Copilot (OAuth)',
          authenticated: false,
          accounts: [],
        },
      ],
      source: 'local',
    };
    hookState.catalogData = undefined;
  });

  it('separates core providers from plus extras in the sidebar', () => {
    render(<CliproxyPage />);

    expect(screen.getByText('Core / original backend')).toBeInTheDocument();
    expect(screen.getByText('Plus extras / community-maintained')).toBeInTheDocument();
    expect(screen.getByText('Default, always-available provider track')).toBeInTheDocument();
    expect(
      screen.getByText('Still supported, but separated from the default backend for now')
    ).toBeInTheDocument();
    expect(screen.getByText('Gemini')).toBeInTheDocument();
    expect(screen.getByText('GitHub Copilot (OAuth)')).toBeInTheDocument();
  });

  it('does not pass a static fallback catalog before the catalog query resolves', async () => {
    render(<CliproxyPage />);

    await userEvent.click(screen.getByRole('button', { name: 'open-add-account' }));

    expect(screen.getByTestId('add-account-dialog')).toHaveAttribute('data-catalog', 'missing');
  });

  it('passes the fetched provider catalog after the catalog query resolves', async () => {
    hookState.catalogData = {
      catalogs: {
        gemini: {
          provider: 'gemini',
          displayName: 'Gemini',
          defaultModel: 'gemini-3.9-pro-preview',
          models: [{ id: 'gemini-3.9-pro-preview', name: 'Gemini 3.9 Pro Preview' }],
        },
      },
    };

    render(<CliproxyPage />);

    await userEvent.click(screen.getByRole('button', { name: 'open-add-account' }));

    expect(screen.getByTestId('add-account-dialog')).toHaveAttribute(
      'data-catalog',
      'gemini-3.9-pro-preview'
    );
  });

  it('uses the sidebar setup CTA for account connection instead of variant creation', async () => {
    render(<CliproxyPage />);

    await userEvent.click(screen.getByRole('button', { name: /add account/i }));

    expect(screen.getByTestId('add-account-dialog')).toHaveAttribute('data-provider', 'gemini');
    expect(screen.queryByTestId('advanced-variant-wizard')).not.toBeInTheDocument();
  });

  it('adds accounts against the base provider when a runtime variant is selected', async () => {
    hookState.variantsData = {
      variants: [{ name: 'gemini-parallel', provider: 'gemini', target: 'claude' }],
    };

    render(<CliproxyPage />);

    await userEvent.click(screen.getByRole('button', { name: /gemini-parallel/i }));
    await userEvent.click(screen.getByRole('button', { name: /add account/i }));

    expect(screen.getByTestId('add-account-dialog')).toHaveAttribute('data-provider', 'gemini');
    expect(screen.queryByTestId('advanced-variant-wizard')).not.toBeInTheDocument();
  });

  it('surfaces account setup from the empty state before provider data is available', async () => {
    hookState.authData = {
      authStatus: [],
      source: 'local',
    };

    render(<CliproxyPage />);

    const addAccountButtons = screen.getAllByRole('button', { name: /add account/i });
    await userEvent.click(addAccountButtons[addAccountButtons.length - 1]);

    expect(screen.getByTestId('add-account-dialog')).toHaveAttribute('data-provider', 'gemini');
    expect(screen.queryByTestId('advanced-variant-wizard')).not.toBeInTheDocument();
  });

  it('keeps advanced variant creation available as a secondary action', async () => {
    render(<CliproxyPage />);

    await userEvent.click(screen.getByRole('button', { name: /advanced variant/i }));

    expect(screen.getByTestId('advanced-variant-wizard')).toBeInTheDocument();
    expect(screen.queryByTestId('add-account-dialog')).not.toBeInTheDocument();
  });
});
