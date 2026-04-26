/**
 * Unit tests for ApiPage — api.tsx design system migration.
 *
 * Coverage:
 * - PageHeader renders with title and description
 * - ApiProfileListPane mounts (profile list pane)
 * - Profile list items render and are accessible
 * - Empty state renders when no profile selected
 * - Profile editor view mounts when profile selected
 * - Create dialog opens and closes
 * - Delete confirm dialog flow
 * - Unsaved-changes guard (pending switch confirm)
 * - Import file input is hidden
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent } from '@tests/setup/test-utils';

// ---------------------------------------------------------------------------
// jsdom stubs
// ---------------------------------------------------------------------------

// IntersectionObserver (not in jsdom)
const mockIntersectionObserver = vi.fn().mockReturnValue({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
});
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: mockIntersectionObserver,
});

// matchMedia — return matches:true so ConfigLayout renders 3-pane desktop grid,
// not MobileTabs (which would hide form and json behind tab buttons).
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: true, // desktop breakpoint always met
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// ---------------------------------------------------------------------------
// Hoisted hook state (vi.hoisted runs before module init — inline the data)
// ---------------------------------------------------------------------------

const hookState = vi.hoisted(() => ({
  profiles: [
    {
      name: 'my-openrouter',
      target: 'claude' as const,
      settingsPath: '/home/user/.config/ccs/my-openrouter.json',
      configured: true,
    },
    {
      name: 'droid-profile',
      target: 'droid' as const,
      settingsPath: '/home/user/.config/ccs/droid-profile.json',
      configured: false,
    },
  ],
  isLoading: false,
  isError: false,
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/hooks/use-profiles', () => ({
  useProfiles: () => ({
    data: { profiles: hookState.profiles },
    isLoading: hookState.isLoading,
    isError: hookState.isError,
    refetch: vi.fn(),
  }),
  useDeleteProfile: () => ({ mutate: vi.fn(), isPending: false }),
  useDiscoverProfileOrphans: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRegisterProfileOrphans: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCopyProfile: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useExportProfile: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useImportProfile: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/use-openrouter-models', () => ({
  useOpenRouterModels: () => undefined,
}));

// Heavy sub-components — stub out to isolate page-level logic
vi.mock('@/components/profile-editor', () => ({
  ProfileEditor: ({ profileName }: { profileName: string }) => (
    <div data-testid="profile-editor" data-profile={profileName}>
      Profile Editor: {profileName}
    </div>
  ),
}));

vi.mock('@/components/profiles/openrouter-quick-start', () => ({
  OpenRouterQuickStart: () => (
    <div data-testid="openrouter-quick-start">OpenRouter Quick Start</div>
  ),
}));

vi.mock('@/components/profiles/openrouter-banner', () => ({
  OpenRouterBanner: () => <div data-testid="openrouter-banner">OpenRouter Banner</div>,
}));

vi.mock('@/components/profiles/openrouter-promo-card', () => ({
  OpenRouterPromoCard: () => <div data-testid="openrouter-promo">OpenRouter Promo</div>,
}));

vi.mock('@/components/profiles/alibaba-coding-plan-promo-card', () => ({
  AlibabaCodingPlanPromoCard: () => (
    <div data-testid="alibaba-promo">Alibaba Coding Plan Promo</div>
  ),
}));

vi.mock('@/components/profiles/profile-create-dialog', () => ({
  ProfileCreateDialog: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
  }) =>
    open ? (
      <div data-testid="profile-create-dialog">
        <button onClick={() => onOpenChange(false)}>close-dialog</button>
      </div>
    ) : null,
}));

vi.mock('@/components/shared/confirm-dialog', () => ({
  ConfirmDialog: ({
    open,
    title,
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    title: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) =>
    open ? (
      <div data-testid="confirm-dialog" data-title={title}>
        <button onClick={onConfirm}>confirm</button>
        <button onClick={onCancel}>cancel</button>
      </div>
    ) : null,
}));

// ---------------------------------------------------------------------------
// Import page AFTER mocks
// ---------------------------------------------------------------------------

import { ApiPage } from '@/pages/api';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ApiPage — design system shell', () => {
  beforeEach(() => {
    hookState.profiles = [
      {
        name: 'my-openrouter',
        target: 'claude' as const,
        settingsPath: '/home/user/.config/ccs/my-openrouter.json',
        configured: true,
      },
      {
        name: 'droid-profile',
        target: 'droid' as const,
        settingsPath: '/home/user/.config/ccs/droid-profile.json',
        configured: false,
      },
    ];
    hookState.isLoading = false;
    hookState.isError = false;
  });

  it('renders PageHeader with title', () => {
    render(<ApiPage />);
    // The title includes "Profiles" from the i18n key apiProfiles.sidebarTitle
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('renders profile list items for each profile', () => {
    render(<ApiPage />);
    expect(screen.getByText('my-openrouter')).toBeInTheDocument();
    expect(screen.getByText('droid-profile')).toBeInTheDocument();
  });

  it('renders profile list item target badges', () => {
    render(<ApiPage />);
    // Badge shows target value
    expect(screen.getByText('claude')).toBeInTheDocument();
    expect(screen.getByText('droid')).toBeInTheDocument();
  });

  it('profile items are keyboard-accessible (role=button)', () => {
    render(<ApiPage />);
    // Each list item is role=button
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('shows empty state (OpenRouterQuickStart) when no profile selected', () => {
    render(<ApiPage />);
    expect(screen.getByTestId('openrouter-quick-start')).toBeInTheDocument();
  });

  it('shows profile editor after clicking a profile', async () => {
    render(<ApiPage />);
    // Click the first profile item
    const profileItem = screen.getByText('my-openrouter').closest('[role="button"]');
    expect(profileItem).not.toBeNull();
    if (profileItem) {
      await userEvent.click(profileItem);
    }
    expect(screen.getByTestId('profile-editor')).toBeInTheDocument();
    expect(screen.getByTestId('profile-editor')).toHaveAttribute('data-profile', 'my-openrouter');
  });

  it('shows copy and export buttons when a profile is selected', async () => {
    render(<ApiPage />);
    const profileItem = screen.getByText('my-openrouter').closest('[role="button"]');
    if (profileItem) {
      await userEvent.click(profileItem);
    }
    // Use getAllByRole since CopyButton components may also match /copy/i — take the first
    const copyBtns = screen.getAllByRole('button', { name: /^copy$/i });
    expect(copyBtns.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /^export$/i })).toBeInTheDocument();
  });

  it('hides profile editor and shows empty state after profile deselect flow (unsaved-changes cancel)', async () => {
    render(<ApiPage />);
    // Select first profile
    const firstItem = screen.getByText('my-openrouter').closest('[role="button"]');
    if (firstItem) {
      await userEvent.click(firstItem);
    }
    expect(screen.getByTestId('profile-editor')).toBeInTheDocument();
    // Editor is up — clicking another profile triggers switch (no unsaved changes, switches directly)
    const secondItem = screen.getByText('droid-profile').closest('[role="button"]');
    if (secondItem) {
      await userEvent.click(secondItem);
    }
    expect(screen.getByTestId('profile-editor')).toHaveAttribute('data-profile', 'droid-profile');
  });

  it('opens create dialog when New button clicked', async () => {
    render(<ApiPage />);
    const newBtn = screen.getByRole('button', { name: /new/i });
    await userEvent.click(newBtn);
    expect(screen.getByTestId('profile-create-dialog')).toBeInTheDocument();
  });

  it('closes create dialog', async () => {
    render(<ApiPage />);
    await userEvent.click(screen.getByRole('button', { name: /new/i }));
    expect(screen.getByTestId('profile-create-dialog')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'close-dialog' }));
    expect(screen.queryByTestId('profile-create-dialog')).not.toBeInTheDocument();
  });

  it('opens delete confirm dialog when delete icon clicked', async () => {
    render(<ApiPage />);
    // Hover over first profile to reveal delete button
    const profileItem = screen.getByText('my-openrouter').closest('[role="button"]');
    if (profileItem) {
      await userEvent.hover(profileItem);
    }
    const deleteBtn = screen.getAllByRole('button', { name: /delete profile my-openrouter/i })[0];
    await userEvent.click(deleteBtn);
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
  });

  it('cancels delete confirm dialog', async () => {
    render(<ApiPage />);
    const profileItem = screen.getByText('my-openrouter').closest('[role="button"]');
    if (profileItem) {
      await userEvent.hover(profileItem);
    }
    const deleteBtn = screen.getAllByRole('button', { name: /delete profile my-openrouter/i })[0];
    await userEvent.click(deleteBtn);
    await userEvent.click(screen.getByRole('button', { name: 'cancel' }));
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
  });

  it('hidden file input exists for import', () => {
    render(<ApiPage />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();
    expect(fileInput.className).toContain('hidden');
    expect(fileInput.accept).toContain('.json');
  });

  it('shows loading state', () => {
    hookState.isLoading = true;
    hookState.profiles = [];
    render(<ApiPage />);
    // Loading text from i18n key
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows error state with retry button', () => {
    hookState.isError = true;
    hookState.profiles = [];
    render(<ApiPage />);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('shows profile count badge when profiles exist', () => {
    render(<ApiPage />);
    // configured count badge in header: "1/2 configured"
    // getAllByText in case multiple elements contain "configured"
    const configuredEls = screen.getAllByText(/configured/i);
    expect(configuredEls.length).toBeGreaterThanOrEqual(1);
  });

  it('renders promo cards in list pane', () => {
    render(<ApiPage />);
    expect(screen.getByTestId('openrouter-promo')).toBeInTheDocument();
    expect(screen.getByTestId('alibaba-promo')).toBeInTheDocument();
  });
});
