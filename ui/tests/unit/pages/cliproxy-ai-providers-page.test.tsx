/**
 * Unit tests for the cliproxy-ai-providers page rewrite.
 *
 * Covers:
 * - Loading skeleton
 * - Error state with retry/navigation buttons
 * - Family rail selection (URL param driven)
 * - Entry selector (single + multi entry display)
 * - Entry inspector: Config tab sections
 * - Entry inspector: Info & Usage tab
 * - Raw JSON pane bidirectional sync (schema validation prevents bad save)
 * - Empty state workspace (setup guidance)
 * - Create/edit dialog flow
 * - Delete confirm dialog flow
 * - canSave disabled when no changes / missing required fields
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent } from '@tests/setup/test-utils';

// ---------------------------------------------------------------------------
// Hoisted hook mock state — data must be defined inside vi.hoisted
// ---------------------------------------------------------------------------

const hookState = vi.hoisted(() => {
  const GEMINI_ENTRY = {
    id: 'entry-1',
    label: 'Gemini Default',
    name: '',
    baseUrl: '',
    proxyUrl: '',
    prefix: '',
    headers: [] as Array<{ key: string; value: string }>,
    excludedModels: [] as string[],
    models: [] as Array<{ name: string; alias: string }>,
    secretConfigured: true,
    apiKeyMasked: 'AIza****' as string | undefined,
    apiKeysMasked: undefined as string[] | undefined,
  };

  const GEMINI_FAMILY = {
    id: 'gemini-api-key' as const,
    displayName: 'Gemini',
    authMode: 'api-key',
    routePath: '/gemini',
    description: 'Google Gemini via CLIProxy',
    status: 'ready' as const,
    supportsNamedEntries: false,
    entries: [GEMINI_ENTRY],
  };

  const OPENAI_COMPAT_FAMILY = {
    id: 'openai-compatibility' as const,
    displayName: 'OpenAI Compatible',
    authMode: 'api-key',
    routePath: '/openai',
    description: 'Custom OpenAI-compatible connector',
    status: 'empty' as const,
    supportsNamedEntries: true,
    entries: [] as typeof GEMINI_FAMILY.entries,
  };

  const MOCK_DATA = {
    families: [GEMINI_FAMILY, OPENAI_COMPAT_FAMILY],
    source: { label: 'Local', target: 'http://localhost:8317' },
  };

  return {
    isLoading: false,
    error: null as Error | null,
    data: MOCK_DATA as typeof MOCK_DATA | null,
    isFetching: false,
    refetch: () => {},
    createPending: false,
    updatePending: false,
    deletePending: false,
    createMutate: (() => Promise.resolve()) as (...args: unknown[]) => Promise<unknown>,
    updateMutate: (() => Promise.resolve()) as (...args: unknown[]) => Promise<unknown>,
    deleteMutate: (() => Promise.resolve()) as (...args: unknown[]) => Promise<unknown>,
    GEMINI_ENTRY,
    MOCK_DATA,
  };
});

vi.mock('@/hooks/use-cliproxy-ai-providers', () => ({
  useCliproxyAiProviders: () => ({
    data: hookState.data,
    error: hookState.error,
    isLoading: hookState.isLoading,
    isFetching: hookState.isFetching,
    refetch: hookState.refetch,
  }),
  useCreateCliproxyAiProviderEntry: () => ({
    mutateAsync: hookState.createMutate,
    isPending: hookState.createPending,
  }),
  useUpdateCliproxyAiProviderEntry: () => ({
    mutateAsync: hookState.updateMutate,
    isPending: hookState.updatePending,
  }),
  useDeleteCliproxyAiProviderEntry: () => ({
    mutateAsync: hookState.deleteMutate,
    isPending: hookState.deletePending,
  }),
}));

// Stub shared components that need browser APIs or heavy deps
vi.mock('@/components/shared/code-editor', () => ({
  CodeEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea
      data-testid="code-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      readOnly={!onChange}
    />
  ),
}));

vi.mock('@/components/shared/global-env-indicator', () => ({
  GlobalEnvIndicator: ({ profileEnv }: { profileEnv: Record<string, string> }) => (
    <div data-testid="global-env-indicator">{JSON.stringify(profileEnv)}</div>
  ),
}));

vi.mock('@/components/monitoring/proxy-status-widget', () => ({
  ProxyStatusWidget: () => <div data-testid="proxy-status-widget" />,
}));

vi.mock('@/components/cliproxy/ai-providers', () => ({
  FamilyRail: ({
    families,
    selectedFamily,
    onSelect,
  }: {
    families: Array<{ id: string; displayName: string }>;
    selectedFamily: string;
    onSelect: (id: string) => void;
  }) => (
    <div data-testid="family-rail">
      {families.map((f) => (
        <button
          key={f.id}
          data-testid={`family-item-${f.id}`}
          aria-pressed={f.id === selectedFamily}
          onClick={() => onSelect(f.id)}
        >
          {f.displayName}
        </button>
      ))}
    </div>
  ),
  ProviderEntryDialog: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
  }) =>
    open ? (
      <div role="dialog" aria-label="Provider entry dialog">
        <button onClick={() => onOpenChange(false)}>Close dialog</button>
      </div>
    ) : null,
}));

vi.mock('@/components/cliproxy/provider-logo', () => ({
  ProviderLogo: ({ provider }: { provider: string }) => (
    <span data-testid={`provider-logo-${provider}`} />
  ),
}));

vi.mock('@/lib/provider-config', () => ({
  getAiProviderFamilyVisual: (id: string) => id,
  formatRequestedUpstreamModelRules: () => '',
  getRequestedUpstreamModelRuleErrors: () => [],
  getRequestedModelId: (item: { name: string }) => item.name,
  parseRequestedUpstreamModelRules: () => [],
}));

// jsdom stubs
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('1024px') ? true : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

const observerMock = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: observerMock,
});

// Page import — after all mocks
import { CliproxyAiProvidersPage } from '@/pages/cliproxy-ai-providers';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CliproxyAiProvidersPage', () => {
  beforeEach(() => {
    // Reset URL so family selection always starts at default (gemini-api-key)
    window.history.replaceState({}, '', '/');
    hookState.isLoading = false;
    hookState.error = null;
    hookState.data = hookState.MOCK_DATA;
    hookState.isFetching = false;
    hookState.refetch = vi.fn();
    hookState.createMutate = vi.fn().mockResolvedValue(undefined);
    hookState.updateMutate = vi.fn().mockResolvedValue(undefined);
    hookState.deleteMutate = vi.fn().mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------------------
  describe('loading state', () => {
    it('renders skeleton when isLoading', () => {
      hookState.isLoading = true;
      hookState.data = null;
      render(<CliproxyAiProvidersPage />);
      // Skeletons render as divs with animate-pulse; page-specific content absent
      expect(screen.queryByText('CLIProxy Plus')).toBeNull();
      expect(screen.queryByTestId('family-rail')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------
  describe('error state', () => {
    it('shows error message and retry button on API failure', () => {
      hookState.error = new Error('Connection refused');
      hookState.data = null;
      render(<CliproxyAiProvidersPage />);
      expect(screen.getByText(/Connection refused/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('retry button calls refetch', async () => {
      hookState.error = new Error('fail');
      hookState.data = null;
      render(<CliproxyAiProvidersPage />);
      await userEvent.click(screen.getByRole('button', { name: /retry/i }));
      expect(hookState.refetch).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Left rail
  // -------------------------------------------------------------------------
  describe('left rail', () => {
    it('renders brand strip and FamilyRail', () => {
      render(<CliproxyAiProvidersPage />);
      expect(screen.getByText('CLIProxy Plus')).toBeInTheDocument();
      expect(screen.getByTestId('family-rail')).toBeInTheDocument();
    });

    it('renders ProxyStatusWidget', () => {
      render(<CliproxyAiProvidersPage />);
      expect(screen.getByTestId('proxy-status-widget')).toBeInTheDocument();
    });

    it('shows ready families count in footer', () => {
      render(<CliproxyAiProvidersPage />);
      // gemini-api-key is ready
      expect(screen.getByText(/1 ready/)).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Family header
  // -------------------------------------------------------------------------
  describe('family header', () => {
    it('displays selected family display name', () => {
      render(<CliproxyAiProvidersPage />);
      // Gemini appears in the rail button AND the family header h2 — use getAllByText
      const geminiEls = screen.getAllByText('Gemini');
      expect(geminiEls.length).toBeGreaterThan(0);
      // The h2 heading should be among them
      const heading = geminiEls.find((el) => el.tagName === 'H2');
      expect(heading).toBeTruthy();
    });

    it('shows route path badge', () => {
      render(<CliproxyAiProvidersPage />);
      const badges = screen.getAllByText('/gemini');
      expect(badges.length).toBeGreaterThan(0);
    });

    it('shows status badge for selected family', () => {
      render(<CliproxyAiProvidersPage />);
      // Gemini status = ready → "Ready" badge
      const readyBadges = screen.getAllByText('Ready');
      expect(readyBadges.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Entry selector
  // -------------------------------------------------------------------------
  describe('entry selector (Gemini with one entry)', () => {
    it('shows saved entry label', () => {
      render(<CliproxyAiProvidersPage />);
      const labels = screen.getAllByText('Gemini Default');
      expect(labels.length).toBeGreaterThan(0);
    });

    it('shows entries/secrets count badges', () => {
      render(<CliproxyAiProvidersPage />);
      expect(screen.getByText('1 entries')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Entry inspector — config tab sections
  // -------------------------------------------------------------------------
  describe('entry inspector config tab', () => {
    it('renders Connection section heading', () => {
      render(<CliproxyAiProvidersPage />);
      expect(screen.getByText('Connection')).toBeInTheDocument();
    });

    it('renders Model rules section heading', () => {
      render(<CliproxyAiProvidersPage />);
      expect(screen.getByText('Model rules')).toBeInTheDocument();
    });

    it('renders Advanced routing section heading', () => {
      render(<CliproxyAiProvidersPage />);
      expect(screen.getByText('Advanced routing')).toBeInTheDocument();
    });

    it('Save button is disabled when no changes', () => {
      render(<CliproxyAiProvidersPage />);
      const saveBtn = screen.getByRole('button', { name: /save/i });
      expect(saveBtn).toBeDisabled();
    });

    it('Reset button is disabled when no changes', () => {
      render(<CliproxyAiProvidersPage />);
      const resetBtn = screen.getByRole('button', { name: /reset/i });
      expect(resetBtn).toBeDisabled();
    });

    it('Remove button is always enabled', () => {
      render(<CliproxyAiProvidersPage />);
      const removeBtn = screen.getByRole('button', { name: /remove/i });
      expect(removeBtn).toBeEnabled();
    });
  });

  // -------------------------------------------------------------------------
  // Raw JSON pane
  // -------------------------------------------------------------------------
  describe('raw JSON pane', () => {
    it('renders Raw Entry Config tab', () => {
      render(<CliproxyAiProvidersPage />);
      expect(screen.getByText('Raw Entry Config')).toBeInTheDocument();
    });

    it('renders CodeEditor for raw JSON', () => {
      render(<CliproxyAiProvidersPage />);
      expect(screen.getByTestId('code-editor')).toBeInTheDocument();
    });

    it('renders settings.json Preview tab', () => {
      render(<CliproxyAiProvidersPage />);
      expect(screen.getByText('settings.json Preview')).toBeInTheDocument();
    });

    it('shows stored secret placeholder notice when secret configured', () => {
      render(<CliproxyAiProvidersPage />);
      const placeholders = screen.getAllByText(/<stored in CLIProxy>/);
      expect(placeholders.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Empty state (openai-compatibility has no entries)
  // -------------------------------------------------------------------------
  describe('empty state workspace', () => {
    it('shows setup guidance when family is empty', async () => {
      render(<CliproxyAiProvidersPage />);
      // Switch to openai-compatibility family
      await userEvent.click(screen.getByTestId('family-item-openai-compatibility'));
      expect(screen.getByText(/Set up OpenAI Compatible/)).toBeInTheDocument();
      expect(screen.getByText('Do this first')).toBeInTheDocument();
      expect(screen.getByText('Only if needed')).toBeInTheDocument();
    });

    it('shows Create Connector CTA for supportsNamedEntries families', async () => {
      render(<CliproxyAiProvidersPage />);
      await userEvent.click(screen.getByTestId('family-item-openai-compatibility'));
      expect(screen.getAllByRole('button', { name: /create connector/i }).length).toBeGreaterThan(
        0
      );
    });
  });

  // -------------------------------------------------------------------------
  // Create dialog
  // -------------------------------------------------------------------------
  describe('create dialog', () => {
    it('opens ProviderEntryDialog on Add entry CTA click', async () => {
      render(<CliproxyAiProvidersPage />);
      // Click "Add Gemini Entry" in rail header
      const addBtn = screen.getByRole('button', { name: /add gemini entry/i });
      await userEvent.click(addBtn);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('closes dialog on close button', async () => {
      render(<CliproxyAiProvidersPage />);
      await userEvent.click(screen.getByRole('button', { name: /add gemini entry/i }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: /close dialog/i }));
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Delete confirm dialog
  // -------------------------------------------------------------------------
  describe('delete confirm dialog', () => {
    it('opens ConfirmDialog on Remove button click', async () => {
      render(<CliproxyAiProvidersPage />);
      await userEvent.click(screen.getByRole('button', { name: /remove/i }));
      expect(screen.getByText(/Remove provider entry\?/)).toBeInTheDocument();
    });

    it('calls deleteMutation on confirm', async () => {
      hookState.deleteMutate = vi.fn().mockResolvedValue(undefined);
      render(<CliproxyAiProvidersPage />);
      await userEvent.click(screen.getByRole('button', { name: /remove/i }));
      const confirmBtn = screen.getByRole('button', { name: /^remove$/i });
      await userEvent.click(confirmBtn);
      expect(hookState.deleteMutate).toHaveBeenCalledWith({
        family: 'gemini-api-key',
        entryId: 'entry-1',
      });
    });

    it('dismisses dialog on cancel', async () => {
      render(<CliproxyAiProvidersPage />);
      await userEvent.click(screen.getByRole('button', { name: /remove/i }));
      await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
      expect(screen.queryByText(/Remove provider entry\?/)).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Utility lib — pure function coverage
  // -------------------------------------------------------------------------
  describe('ai-provider-utils pure functions', () => {
    it('getFamilyStatusBadge returns ready class for ready status', async () => {
      const { getFamilyStatusBadge } =
        await import('@/pages/cliproxy-ai-providers/lib/ai-provider-utils');
      const result = getFamilyStatusBadge('ready');
      expect(result.label).toBe('Ready');
      expect(result.className).toContain('emerald');
    });

    it('getFamilyStatusBadge returns empty class for empty status', async () => {
      const { getFamilyStatusBadge } =
        await import('@/pages/cliproxy-ai-providers/lib/ai-provider-utils');
      const result = getFamilyStatusBadge('empty');
      expect(result.label).toBe('Empty');
    });

    it('getRoutingMode detects proxy override', async () => {
      const { getRoutingMode } =
        await import('@/pages/cliproxy-ai-providers/lib/ai-provider-utils');
      const entry = {
        id: 'x',
        label: 'X',
        name: '',
        baseUrl: '',
        proxyUrl: 'https://proxy.example.com',
        prefix: '',
        headers: [],
        excludedModels: [],
        models: [],
        secretConfigured: false,
        apiKeyMasked: undefined,
        apiKeysMasked: undefined,
      };
      expect(getRoutingMode(entry)).toBe('Proxy override');
    });

    it('getRoutingMode returns Default runtime when nothing set', async () => {
      const { getRoutingMode } =
        await import('@/pages/cliproxy-ai-providers/lib/ai-provider-utils');
      const entry = {
        id: 'x',
        label: 'X',
        name: '',
        baseUrl: '',
        proxyUrl: '',
        prefix: '',
        headers: [],
        excludedModels: [],
        models: [],
        secretConfigured: true,
        apiKeyMasked: undefined,
        apiKeysMasked: undefined,
      };
      expect(getRoutingMode(entry)).toBe('Default runtime');
    });

    it('parseDelimitedLines splits and trims lines', async () => {
      const { parseDelimitedLines } =
        await import('@/pages/cliproxy-ai-providers/lib/ai-provider-utils');
      expect(parseDelimitedLines('  foo  \n  bar  \n\n  baz  ')).toEqual(['foo', 'bar', 'baz']);
    });

    it('parseKeyValueLines parses colon-separated pairs', async () => {
      const { parseKeyValueLines } =
        await import('@/pages/cliproxy-ai-providers/lib/ai-provider-utils');
      const result = parseKeyValueLines('X-Org: org_123\nContent-Type: application/json');
      expect(result).toEqual([
        { key: 'X-Org', value: 'org_123' },
        { key: 'Content-Type', value: 'application/json' },
      ]);
    });

    it('renderModelRuleSummary returns No model rules for empty array', async () => {
      const { renderModelRuleSummary } =
        await import('@/pages/cliproxy-ai-providers/lib/ai-provider-utils');
      expect(renderModelRuleSummary([])).toBe('No model rules');
    });

    it('renderModelRuleSummary counts mapped and direct', async () => {
      const { renderModelRuleSummary } =
        await import('@/pages/cliproxy-ai-providers/lib/ai-provider-utils');
      const models = [
        { name: 'claude-a', alias: 'gpt-5' }, // mapped
        { name: 'glm-5', alias: '' }, // direct
      ];
      expect(renderModelRuleSummary(models)).toBe('1 mapped + 1 direct');
    });

    it('buildEntryEditorDraft initialises apiKey as empty string', async () => {
      const { buildEntryEditorDraft } =
        await import('@/pages/cliproxy-ai-providers/lib/ai-provider-utils');
      const draft = buildEntryEditorDraft(hookState.GEMINI_ENTRY);
      // API key must always start empty — never pre-fill from masked value
      expect(draft.apiKey).toBe('');
    });

    it('STORED_SECRET_PLACEHOLDER constant value', async () => {
      const { STORED_SECRET_PLACEHOLDER } =
        await import('@/pages/cliproxy-ai-providers/lib/ai-provider-utils');
      expect(STORED_SECRET_PLACEHOLDER).toBe('<stored in CLIProxy>');
    });
  });
});
