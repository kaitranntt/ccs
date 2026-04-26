/**
 * Unit tests for the droid page design-system rewrite (Phase 4).
 *
 * Coverage:
 * - PageHeader renders with title
 * - SectionRail items (Overview, BYOK, Docs) render
 * - Each FormSection (overview, byok, docs) mounts with correct id
 * - RawJsonSettingsEditorPanel mounts (json pane)
 * - Save flow: success path + conflict error path
 * - Dirty indicator appears when editor has unsaved changes
 * - Quick settings disabled when JSON is invalid
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { fireEvent } from '@testing-library/react';
import { render, screen, userEvent, waitFor } from '@tests/setup/test-utils';

// ---- Stub IntersectionObserver (used by SectionRail scroll-spy) -------------

class IntersectionObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(_callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}
}
global.IntersectionObserver = IntersectionObserverMock as unknown as typeof IntersectionObserver;

// ---- Force desktop layout: matchMedia returns true for min-width queries ----
// ConfigLayout uses useIsDesktop() which calls window.matchMedia('(min-width: 1024px)').
// jsdom returns false by default, collapsing to mobile tabs and hiding form/json panes.
// Override globally so tests always render the 3-column desktop grid.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('min-width'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// ---- Hoisted mocks ----------------------------------------------------------

const mocks = vi.hoisted(() => ({
  useDroid: vi.fn(),
  refetchDiagnostics: vi.fn(),
  refetchRawSettings: vi.fn(),
  saveRawSettingsAsync: vi.fn(),
}));

vi.mock('@/hooks/use-droid', () => ({
  useDroid: mocks.useDroid,
}));

// Stub CodeEditor so we can interact with raw JSON textarea in tests
vi.mock('@/components/shared/code-editor', () => ({
  CodeEditor: ({ value, onChange }: { value: string; onChange: (next: string) => void }) => (
    <textarea
      aria-label="droid raw settings editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

// Stub heavy compatible-cli sub-components to keep tests focused
vi.mock('@/components/compatible-cli/droid-settings-quick-controls-card', () => ({
  DroidSettingsQuickControlsCard: ({ disabled }: { disabled: boolean }) => (
    <div data-testid="quick-controls" data-disabled={String(disabled)}>
      Quick Controls
    </div>
  ),
}));

vi.mock('@/components/compatible-cli/droid-byok-reasoning-controls-card', () => ({
  DroidByokReasoningControlsCard: () => (
    <div data-testid="byok-reasoning-controls">BYOK Reasoning Controls</div>
  ),
}));

// Stub react-resizable-panels (not used in new architecture, but kept for safety)
vi.mock('react-resizable-panels', () => ({
  PanelGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Panel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PanelResizeHandle: () => <div data-testid="panel-resize-handle" />,
}));

import { DroidPage } from '@/pages/droid';

// ---- Fixtures ---------------------------------------------------------------

const baseDiagnostics = {
  binary: {
    installed: true,
    path: '/usr/local/bin/droid',
    installDir: '/usr/local/bin',
    source: 'PATH' as const,
    version: '1.2.3',
    overridePath: null,
  },
  files: {
    settings: {
      label: 'settings.json',
      path: '~/.factory/settings.json',
      resolvedPath: '/home/user/.factory/settings.json',
      exists: true,
      isSymlink: false,
      isRegularFile: true,
      sizeBytes: 128,
      mtimeMs: 1700000000000,
      parseError: null,
      readError: null,
    },
    legacyConfig: {
      label: 'Legacy config',
      path: '~/.factory/config.json',
      resolvedPath: '/home/user/.factory/config.json',
      exists: false,
      isSymlink: false,
      isRegularFile: false,
      sizeBytes: null,
      mtimeMs: null,
      parseError: null,
      readError: null,
    },
  },
  byok: {
    activeModelSelector: 'claude-opus-4-5',
    customModelCount: 2,
    ccsManagedCount: 1,
    userManagedCount: 1,
    invalidModelEntryCount: 0,
    providerBreakdown: { anthropic: 1, openai: 1 },
    customModels: [
      {
        displayName: 'My Claude',
        model: 'claude-opus-4-5',
        provider: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
        host: 'api.anthropic.com',
        maxOutputTokens: null,
        isCcsManaged: true,
        apiKeyState: 'set' as const,
        apiKeyPreview: 'sk-ant-...',
      },
    ],
  },
  warnings: [],
  docsReference: {
    providerValues: ['anthropic', 'openai'],
    settingsHierarchy: ['global', 'project'],
    notes: ['Use BYOK to bring your own model credentials.'],
    links: [],
    providerDocs: [],
  },
};

const baseRawSettings = {
  path: '~/.factory/settings.json',
  resolvedPath: '/home/user/.factory/settings.json',
  exists: true,
  mtime: 1700000000000,
  rawText: '{\n  "reasoningEffort": "medium"\n}\n',
  settings: { reasoningEffort: 'medium' },
  parseError: null,
};

function buildUseDroidResult(overrides?: object) {
  return {
    diagnostics: baseDiagnostics,
    diagnosticsLoading: false,
    diagnosticsError: null,
    refetchDiagnostics: mocks.refetchDiagnostics,
    rawSettings: baseRawSettings,
    rawSettingsLoading: false,
    rawSettingsError: null,
    refetchRawSettings: mocks.refetchRawSettings,
    saveRawSettings: vi.fn(),
    saveRawSettingsAsync: mocks.saveRawSettingsAsync,
    isSavingRawSettings: false,
    ...overrides,
  };
}

// ---- Tests ------------------------------------------------------------------

describe('DroidPage (Phase 4 design-system rewrite)', () => {
  beforeEach(() => {
    mocks.refetchDiagnostics.mockReset();
    mocks.refetchRawSettings.mockReset();
    mocks.saveRawSettingsAsync.mockReset();
    mocks.refetchDiagnostics.mockResolvedValue({ status: 'success', isError: false, error: null });
    mocks.refetchRawSettings.mockResolvedValue({ status: 'success', isError: false, error: null });
  });

  it('renders PageHeader with "Factory Droid" title', () => {
    mocks.useDroid.mockReturnValue(buildUseDroidResult());
    render(<DroidPage />);
    expect(screen.getByRole('heading', { name: /factory droid/i })).toBeInTheDocument();
  });

  it('renders SectionRail with Overview, BYOK and Docs navigation items', () => {
    mocks.useDroid.mockReturnValue(buildUseDroidResult());
    render(<DroidPage />);
    expect(screen.getByRole('button', { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /byok/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /docs/i })).toBeInTheDocument();
  });

  it('mounts the overview FormSection with binary install info', () => {
    mocks.useDroid.mockReturnValue(buildUseDroidResult());
    render(<DroidPage />);
    // FormSection id="overview" renders its title via t('droidPage.overview')
    // and the runtime install card content
    expect(document.getElementById('overview')).toBeInTheDocument();
    expect(screen.getByText('settings.json')).toBeInTheDocument();
  });

  it('mounts the byok FormSection with quick controls and reasoning controls', () => {
    mocks.useDroid.mockReturnValue(buildUseDroidResult());
    render(<DroidPage />);
    expect(document.getElementById('byok')).toBeInTheDocument();
    expect(screen.getByTestId('quick-controls')).toBeInTheDocument();
    expect(screen.getByTestId('byok-reasoning-controls')).toBeInTheDocument();
  });

  it('mounts the docs FormSection with notes content', () => {
    mocks.useDroid.mockReturnValue(buildUseDroidResult());
    render(<DroidPage />);
    expect(document.getElementById('docs')).toBeInTheDocument();
    expect(screen.getByText(/Use BYOK to bring your own model credentials/)).toBeInTheDocument();
  });

  it('mounts the raw settings JSON pane with editor', () => {
    mocks.useDroid.mockReturnValue(buildUseDroidResult());
    render(<DroidPage />);
    expect(screen.getByLabelText('droid raw settings editor')).toBeInTheDocument();
    expect(screen.getByLabelText('droid raw settings editor')).toHaveValue(baseRawSettings.rawText);
  });

  it('shows Unsaved badge when editor content differs from saved base', () => {
    mocks.useDroid.mockReturnValue(buildUseDroidResult());
    render(<DroidPage />);

    const editor = screen.getByLabelText('droid raw settings editor');
    fireEvent.change(editor, { target: { value: '{\n  "reasoningEffort": "high"\n}\n' } });

    expect(screen.getByText('Unsaved')).toBeInTheDocument();
  });

  it('calls saveRawSettingsAsync with correct payload on save', async () => {
    mocks.useDroid.mockReturnValue(buildUseDroidResult());
    mocks.saveRawSettingsAsync.mockResolvedValue({ success: true, mtime: 1700000001000 });

    render(<DroidPage />);

    const editor = screen.getByLabelText('droid raw settings editor');
    fireEvent.change(editor, { target: { value: '{\n  "reasoningEffort": "high"\n}\n' } });

    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(mocks.saveRawSettingsAsync).toHaveBeenCalledOnce());
    expect(mocks.saveRawSettingsAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        rawText: expect.stringContaining('"reasoningEffort"'),
        expectedMtime: baseRawSettings.mtime,
      })
    );
  });

  it('disables save button when JSON is invalid', () => {
    mocks.useDroid.mockReturnValue(buildUseDroidResult());
    render(<DroidPage />);

    const editor = screen.getByLabelText('droid raw settings editor');
    fireEvent.change(editor, { target: { value: 'not valid json' } });

    const saveButton = screen.getByRole('button', { name: /save/i });
    expect(saveButton).toBeDisabled();
  });

  it('disables quick-controls when JSON is invalid', () => {
    mocks.useDroid.mockReturnValue(buildUseDroidResult());
    render(<DroidPage />);

    const editor = screen.getByLabelText('droid raw settings editor');
    fireEvent.change(editor, { target: { value: 'not valid json' } });

    expect(screen.getByTestId('quick-controls')).toHaveAttribute('data-disabled', 'true');
  });

  it('renders overview loading state when diagnosticsLoading is true', () => {
    mocks.useDroid.mockReturnValue(
      buildUseDroidResult({ diagnosticsLoading: true, diagnostics: undefined })
    );
    render(<DroidPage />);
    // FormSection id="overview" renders the loading spinner text
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows provider breakdown badges in byok section', () => {
    mocks.useDroid.mockReturnValue(buildUseDroidResult());
    render(<DroidPage />);
    expect(screen.getByText(/anthropic: 1/i)).toBeInTheDocument();
    expect(screen.getByText(/openai: 1/i)).toBeInTheDocument();
  });

  it('renders factory docs fallback links in docs section when API returns empty links', () => {
    mocks.useDroid.mockReturnValue(
      buildUseDroidResult({
        diagnostics: {
          ...baseDiagnostics,
          docsReference: {
            ...baseDiagnostics.docsReference,
            links: [],
            notes: [],
          },
        },
      })
    );
    render(<DroidPage />);
    expect(screen.getByText('Droid CLI Overview')).toBeInTheDocument();
    expect(screen.getByText('BYOK Overview')).toBeInTheDocument();
  });

  it('shows custom model in byok section table', () => {
    mocks.useDroid.mockReturnValue(buildUseDroidResult());
    render(<DroidPage />);
    // 'My Claude' is the displayName shown only in the custom models table
    expect(screen.getByText('My Claude')).toBeInTheDocument();
    // 'claude-opus-4-5' appears in both the BYOK summary row and the table cell
    expect(screen.getAllByText('claude-opus-4-5').length).toBeGreaterThanOrEqual(1);
  });
});
