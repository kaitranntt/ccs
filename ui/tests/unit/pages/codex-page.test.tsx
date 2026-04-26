/**
 * Unit tests for the migrated CodexPage — design system Phase 3.
 *
 * Verifies:
 * - PageHeader title and description render
 * - SectionRail navigation items are present and accessible
 * - FormPane sections mount (overview, controls, docs)
 * - RawConfigEditorPanel (json slot) mounts with correct title
 * - Loading and error states handled cleanly
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@tests/setup/test-utils';

// ConfigLayout renders the desktop 3-pane grid only when window.innerWidth >= 1024px.
// jsdom defaults to 1024px width, but matchMedia is not implemented — stub it so
// useIsDesktop() returns true (desktop) and the FormPane content is always mounted.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: query.includes('min-width') ? true : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

// SectionRail uses IntersectionObserver for scroll-spy — stub it for jsdom.
class IntersectionObserverStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(_cb: IntersectionObserverCallback, _opts?: IntersectionObserverInit) {}
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: IntersectionObserverStub,
});

// ---------------------------------------------------------------------------
// Shared hook state — mutated per test via beforeEach
// ---------------------------------------------------------------------------

const hookState = vi.hoisted(() => ({
  diagnostics: null as null | {
    workspacePath: string;
    config: { activeProfile: string | null };
    file: { path: string };
  },
  diagnosticsLoading: false,
  diagnosticsError: false,
  rawConfig: null as null | {
    rawText: string;
    path: string;
    exists: boolean;
    mtime: number;
    parseError: null | string;
    readError: null | string;
    config: null;
  },
  rawConfigLoading: false,
  rawConfigError: false,
}));

vi.mock('@/hooks/use-codex', () => ({
  useCodex: () => ({
    diagnostics: hookState.diagnostics,
    diagnosticsLoading: hookState.diagnosticsLoading,
    diagnosticsError: hookState.diagnosticsError,
    refetchDiagnostics: vi.fn().mockResolvedValue({ status: 'success' }),
    rawConfig: hookState.rawConfig,
    rawConfigLoading: hookState.rawConfigLoading,
    rawConfigError: hookState.rawConfigError,
    refetchRawConfig: vi.fn().mockResolvedValue({ status: 'success' }),
    saveRawConfigAsync: vi.fn().mockResolvedValue(undefined),
    isSavingRawConfig: false,
    patchConfigAsync: vi.fn().mockResolvedValue(undefined),
    isPatchingConfig: false,
  }),
}));

// Stub heavy sub-components — tests verify mount presence, not their internals
vi.mock('@/components/compatible-cli/codex-overview-tab', () => ({
  CodexOverviewTab: () => <div data-testid="codex-overview-tab">Overview content</div>,
}));

vi.mock('@/components/compatible-cli/codex-control-center-tab', () => ({
  CodexControlCenterTab: ({ disabled }: { disabled: boolean }) => (
    <div data-testid="codex-control-center-tab" data-disabled={disabled}>
      Control Center content
    </div>
  ),
}));

vi.mock('@/components/compatible-cli/codex-docs-tab', () => ({
  CodexDocsTab: () => <div data-testid="codex-docs-tab">Docs content</div>,
}));

vi.mock('@/components/compatible-cli/raw-json-settings-editor-panel', () => ({
  RawConfigEditorPanel: ({ title, loading }: { title: string; loading: boolean }) => (
    <div data-testid="raw-config-editor" data-loading={loading}>
      {title}
    </div>
  ),
  RawJsonSettingsEditorPanel: () => null,
}));

// smol-toml is not installed in the test environment — mock the shared module
vi.mock('@shared/toml-object', () => ({
  safeParseTomlObject: (text: string) => ({
    object: text ? { model: { name: 'gpt-5.3-codex' } } : {},
    parseError: null,
  }),
}));

vi.mock('@/lib/codex-config', () => ({
  getKnownCodexFeatures: () => [],
  readCodexTopLevelSettings: () => ({}),
  readCodexProjectTrust: () => [],
  readCodexProfiles: () => [],
  readCodexModelProviders: () => [],
  readCodexMcpServers: () => [],
  readCodexFeatureState: () => ({}),
}));

import { CodexPage } from '@/pages/codex';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_DIAGNOSTICS = {
  workspacePath: '/tmp/workspace',
  config: { activeProfile: null },
  file: { path: '$CODEX_HOME/config.toml' },
};

const MOCK_RAW_CONFIG = {
  rawText: '[model]\nname = "gpt-5.3-codex"\n',
  path: '/tmp/.codex/config.toml',
  exists: true,
  mtime: 1000000,
  parseError: null,
  readError: null,
  config: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CodexPage — design system migration', () => {
  beforeEach(() => {
    hookState.diagnostics = MOCK_DIAGNOSTICS;
    hookState.diagnosticsLoading = false;
    hookState.diagnosticsError = false;
    hookState.rawConfig = MOCK_RAW_CONFIG;
    hookState.rawConfigLoading = false;
    hookState.rawConfigError = false;
  });

  describe('PageHeader identity strip', () => {
    it('renders the Codex page title', () => {
      render(<CodexPage />);
      expect(screen.getByRole('heading', { name: /codex/i })).toBeInTheDocument();
    });

    it('renders the page description', () => {
      render(<CodexPage />);
      expect(
        screen.getByText(/configure and manage your codex cli integration/i)
      ).toBeInTheDocument();
    });

    it('renders the Refresh action button', () => {
      render(<CodexPage />);
      expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
    });
  });

  describe('SectionRail navigation', () => {
    it('renders Overview section rail item', () => {
      render(<CodexPage />);
      expect(screen.getByRole('button', { name: /overview/i })).toBeInTheDocument();
    });

    it('renders Control Center section rail item', () => {
      render(<CodexPage />);
      expect(screen.getByRole('button', { name: /control center/i })).toBeInTheDocument();
    });

    it('renders Docs section rail item', () => {
      render(<CodexPage />);
      expect(screen.getByRole('button', { name: /^docs$/i })).toBeInTheDocument();
    });

    it('section rail items are keyboard-accessible buttons', () => {
      render(<CodexPage />);
      const railButtons = screen
        .getAllByRole('button')
        .filter((b) => /overview|control center|docs/i.test(b.textContent ?? ''));
      expect(railButtons.length).toBeGreaterThanOrEqual(3);
      railButtons.forEach((btn) => {
        expect(btn.tagName).toBe('BUTTON');
      });
    });
  });

  describe('FormPane sections', () => {
    it('mounts the Overview section', () => {
      render(<CodexPage />);
      expect(screen.getByTestId('codex-overview-tab')).toBeInTheDocument();
    });

    it('mounts the Control Center section', () => {
      render(<CodexPage />);
      expect(screen.getByTestId('codex-control-center-tab')).toBeInTheDocument();
    });

    it('mounts the Docs section', () => {
      render(<CodexPage />);
      expect(screen.getByTestId('codex-docs-tab')).toBeInTheDocument();
    });

    it('disables structured controls when raw config is loading', () => {
      hookState.rawConfigLoading = true;
      hookState.rawConfig = null;
      render(<CodexPage />);
      expect(screen.getByTestId('codex-control-center-tab')).toHaveAttribute(
        'data-disabled',
        'true'
      );
    });
  });

  describe('RawConfigEditorPanel (json slot)', () => {
    it('mounts with title "Codex config.toml"', () => {
      render(<CodexPage />);
      expect(screen.getByTestId('raw-config-editor')).toBeInTheDocument();
      expect(screen.getByTestId('raw-config-editor')).toHaveTextContent('Codex config.toml');
    });

    it('shows loading state while raw config fetches', () => {
      hookState.rawConfigLoading = true;
      hookState.rawConfig = null;
      render(<CodexPage />);
      expect(screen.getByTestId('raw-config-editor')).toHaveAttribute('data-loading', 'true');
    });
  });

  describe('Loading and error states', () => {
    it('shows spinner while diagnostics are loading', () => {
      hookState.diagnosticsLoading = true;
      hookState.diagnostics = null;
      render(<CodexPage />);
      expect(screen.getByText(/loading codex diagnostics/i)).toBeInTheDocument();
    });

    it('shows error message when diagnostics fail', () => {
      hookState.diagnosticsError = true;
      hookState.diagnostics = null;
      render(<CodexPage />);
      expect(screen.getByText(/failed to load codex diagnostics/i)).toBeInTheDocument();
    });

    it('shows error message when diagnostics resolve null', () => {
      hookState.diagnosticsLoading = false;
      hookState.diagnosticsError = false;
      hookState.diagnostics = null;
      render(<CodexPage />);
      expect(screen.getByText(/failed to load codex diagnostics/i)).toBeInTheDocument();
    });
  });
});
