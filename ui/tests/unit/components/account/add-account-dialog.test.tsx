import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import { AddAccountDialog } from '@/components/account/add-account-dialog';
import { render, screen, userEvent, waitFor } from '@tests/setup/test-utils';
import { toast } from 'sonner';
import type { OAuthAccount } from '@/lib/api-client';

const authMocks = vi.hoisted(() => ({
  startAuth: vi.fn(),
  cancelAuth: vi.fn(),
  submitCallback: vi.fn(),
}));

const kiroImportMocks = vi.hoisted(() => ({
  mutate: vi.fn(),
}));

const authFlowState = vi.hoisted(() => ({
  provider: null as string | null,
  isAuthenticating: false,
}));

const presetMocks = vi.hoisted(() => ({
  applyDefaultPreset: vi.fn(),
}));

vi.mock('@/lib/preset-utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/preset-utils')>()),
  applyDefaultPreset: presetMocks.applyDefaultPreset,
}));

vi.mock('@/hooks/use-cliproxy-auth-flow', () => ({
  useCliproxyAuthFlow: () => ({
    provider: authFlowState.provider,
    isAuthenticating: authFlowState.isAuthenticating,
    error: null,
    authUrl: null,
    oauthState: null,
    isSubmittingCallback: false,
    isDeviceCodeFlow: false,
    startAuth: authMocks.startAuth,
    cancelAuth: authMocks.cancelAuth,
    submitCallback: authMocks.submitCallback,
  }),
}));

vi.mock('@/hooks/use-cliproxy', () => ({
  useKiroImport: () => ({
    isPending: false,
    mutate: kiroImportMocks.mutate,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

function createJsonResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('AddAccountDialog power user mode', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.clearAllMocks();
    vi.mocked(window.localStorage.getItem).mockReturnValue(null);
    fetchMock.mockReset();
    authFlowState.provider = null;
    authFlowState.isAuthenticating = false;
    presetMocks.applyDefaultPreset.mockResolvedValue({ success: true, skipped: true });
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
      configurable: true,
      value: () => false,
    });
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: () => {},
    });
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
      configurable: true,
      value: () => {},
    });
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: () => {},
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('skips the Gemini typed acknowledgement when power user mode is enabled', async () => {
    fetchMock.mockResolvedValue(createJsonResponse({ antigravityAckBypass: true }));

    render(<AddAccountDialog open onClose={vi.fn()} provider="gemini" displayName="Gemini" />);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/settings/auth/antigravity-risk')
    );

    const authenticateButton = screen.getByRole('button', { name: 'Authenticate' });
    await waitFor(() => expect(authenticateButton).toBeEnabled());

    expect(screen.getByText('Power user mode enabled')).toBeInTheDocument();
    expect(screen.queryByText(/Type exact phrase to continue/i)).not.toBeInTheDocument();

    await userEvent.click(authenticateButton);

    expect(authMocks.startAuth).toHaveBeenCalledWith(
      'gemini',
      expect.objectContaining({
        riskAcknowledgement: undefined,
      })
    );
  });

  it('keeps the Gemini typed acknowledgement when power user mode is disabled', async () => {
    fetchMock.mockResolvedValue(createJsonResponse({ antigravityAckBypass: false }));

    render(<AddAccountDialog open onClose={vi.fn()} provider="gemini" displayName="Gemini" />);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/settings/auth/antigravity-risk')
    );

    const authenticateButton = screen.getByRole('button', { name: 'Authenticate' });
    await waitFor(() => expect(authenticateButton).toBeDisabled());

    expect(screen.getByText(/Type exact phrase to continue/i)).toBeInTheDocument();
    expect(screen.queryByText('Power user mode enabled')).not.toBeInTheDocument();
    expect(authMocks.startAuth).not.toHaveBeenCalled();
  });

  it('surfaces a power user mode fetch failure and fails closed for Gemini', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    render(<AddAccountDialog open onClose={vi.fn()} provider="gemini" displayName="Gemini" />);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to load power user mode settings. Check Settings > Proxy and try again.'
      )
    );

    expect(
      screen.getByText(
        'Failed to load power user mode settings. Check Settings > Proxy and try again.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/Type exact phrase to continue/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Authenticate' })).toBeDisabled();
  });

  it('skips the AGY responsibility checklist when power user mode is enabled', async () => {
    fetchMock.mockResolvedValue(createJsonResponse({ antigravityAckBypass: true }));

    render(<AddAccountDialog open onClose={vi.fn()} provider="agy" displayName="AGY" />);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/settings/auth/antigravity-risk')
    );

    const authenticateButton = screen.getByRole('button', { name: 'Authenticate' });
    await waitFor(() => expect(authenticateButton).toBeEnabled());

    expect(screen.getByText('Power user mode enabled')).toBeInTheDocument();
    expect(screen.queryByText(/Step 1: I reviewed issue #509/i)).not.toBeInTheDocument();

    await userEvent.click(authenticateButton);

    expect(authMocks.startAuth).toHaveBeenCalledWith(
      'agy',
      expect.objectContaining({
        riskAcknowledgement: undefined,
      })
    );
  });

  it('keeps the AGY responsibility checklist when power user mode is disabled', async () => {
    fetchMock.mockResolvedValue(createJsonResponse({ antigravityAckBypass: false }));

    render(<AddAccountDialog open onClose={vi.fn()} provider="agy" displayName="AGY" />);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/settings/auth/antigravity-risk')
    );

    const authenticateButton = screen.getByRole('button', { name: 'Authenticate' });
    await waitFor(() => expect(authenticateButton).toBeDisabled());

    expect(screen.getByText(/Step 1: I reviewed issue #509/i)).toBeInTheDocument();
    expect(screen.queryByText('Power user mode enabled')).not.toBeInTheDocument();
    expect(authMocks.startAuth).not.toHaveBeenCalled();
  });

  it('submits GitLab PAT mode with base URL and token through the shared auth hook', async () => {
    render(<AddAccountDialog open onClose={vi.fn()} provider="gitlab" displayName="GitLab Duo" />);

    await userEvent.click(screen.getByRole('combobox', { name: 'GitLab auth method' }));
    await userEvent.click(screen.getByRole('option', { name: 'Personal Access Token' }));

    await userEvent.type(screen.getByLabelText('GitLab URL'), 'https://gitlab.example.com');
    await userEvent.type(screen.getByLabelText('Personal Access Token'), 'glpat-test-token');

    await userEvent.click(screen.getByRole('button', { name: 'Authenticate' }));

    expect(authMocks.startAuth).toHaveBeenCalledWith(
      'gitlab',
      expect.objectContaining({
        gitlabAuthMode: 'pat',
        gitlabBaseUrl: 'https://gitlab.example.com',
        gitlabPersonalAccessToken: 'glpat-test-token',
        startEndpoint: 'start',
      })
    );
  });

  async function completeOAuth(provider: string, displayName: string, isFirstAccount: boolean) {
    const onClose = vi.fn();
    const dialog = () => (
      <AddAccountDialog
        open
        onClose={onClose}
        provider={provider}
        displayName={displayName}
        isFirstAccount={isFirstAccount}
      />
    );
    const { rerender } = render(dialog());

    await userEvent.click(screen.getByRole('button', { name: 'Authenticate' }));
    authFlowState.provider = provider;
    authFlowState.isAuthenticating = true;
    rerender(dialog());
    authFlowState.provider = null;
    authFlowState.isAuthenticating = false;
    rerender(dialog());

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  }

  it('does not apply the default preset when adding another account', async () => {
    await completeOAuth('claude', 'Claude', false);

    expect(presetMocks.applyDefaultPreset).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows the saved nickname for reauthentication while sending the existing account ID and nickname', async () => {
    const account: OAuthAccount = {
      id: 'user@example.com#free',
      email: 'user@example.com',
      nickname: 'Personal',
      provider: 'codex',
      tokenFile: 'codex-user@example.com-free.json',
      isDefault: true,
      createdAt: '2026-01-01T00:00:00Z',
    };
    render(
      <AddAccountDialog
        open
        onClose={vi.fn()}
        provider="codex"
        displayName="Codex"
        account={account}
      />
    );
    expect(screen.getAllByText('Personal')).toHaveLength(2);
    expect(screen.getByText('user@example.com (Free)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reauthenticate' }));
    expect(authMocks.startAuth).toHaveBeenCalledWith(
      'codex',
      expect.objectContaining({
        accountId: account.id,
        nickname: account.nickname,
      })
    );
    expect(presetMocks.applyDefaultPreset).not.toHaveBeenCalled();
  });

  it('masks the nickname and secondary identity in the reauthentication dialog', () => {
    vi.mocked(window.localStorage.getItem).mockImplementation((key) =>
      key === 'ccs-privacy-mode' ? 'true' : null
    );
    const account: OAuthAccount = {
      id: 'user@example.com#free',
      email: 'user@example.com',
      nickname: 'Personal',
      provider: 'codex',
      tokenFile: 'codex-user@example.com-free.json',
      isDefault: true,
      createdAt: '2026-01-01T00:00:00Z',
    };
    render(
      <AddAccountDialog
        open
        onClose={vi.fn()}
        provider="codex"
        displayName="Codex"
        account={account}
      />
    );
    screen.getAllByText('Personal').forEach((label) => expect(label).toHaveClass('blur-[4px]'));
    expect(screen.getByText('user@example.com (Free)')).toHaveClass('blur-[4px]');
  });

  it('applies the default preset when adding the first account', async () => {
    presetMocks.applyDefaultPreset.mockResolvedValue({ success: true, presetName: 'GPT-5.5' });

    await completeOAuth('codex', 'Codex', true);

    expect(presetMocks.applyDefaultPreset).toHaveBeenCalledWith('codex', undefined, undefined);
    expect(toast.success).toHaveBeenCalledWith('Applied "GPT-5.5" preset');
  });
});
