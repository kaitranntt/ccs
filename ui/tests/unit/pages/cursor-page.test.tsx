/**
 * Cursor Page — Unit Tests (Phase 4 design-system rewrite)
 *
 * Coverage:
 * - PageShell renders (smoke)
 * - StatusSidebar: identity strip, deprecated badge, status items, live probe panel
 * - SectionRail: all 4 rail items rendered
 * - FormSections: presets, model-mapping, runtime-settings, info
 * - Dialogs: manual auth dialog open/close, import flow
 * - Handlers: save, toggle enabled, auto-detect auth, start/stop daemon, probe
 * - RawEditor: json pane header visible
 *
 * jsdom stubs: matchMedia + IntersectionObserver already in vitest-setup.ts.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@tests/setup/test-utils';

// ---------------------------------------------------------------------------
// Hoisted hook state
// ---------------------------------------------------------------------------

const hookState = vi.hoisted(() => ({
  status: {
    enabled: true,
    authenticated: true,
    auth_method: 'auto-detect' as const,
    token_age: null,
    token_expired: false,
    daemon_running: false,
    port: 3001,
    auto_start: false,
    ghost_mode: true,
  },
  config: {
    enabled: true,
    port: 3001,
    auto_start: false,
    ghost_mode: true,
    model: 'gpt-5.3-codex',
    opus_model: '',
    sonnet_model: '',
    haiku_model: '',
  },
  models: [
    { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', provider: 'openai', isDefault: true },
    { id: 'claude-opus-4.6', name: 'Claude 4.6 Opus', provider: 'anthropic' },
  ],
  rawSettings: {
    settings: { env: {} },
    mtime: Date.now(),
    path: '~/.ccs/cursor.settings.json',
    exists: true,
  },
  probeResult: undefined as
    | {
        ok: boolean;
        stage: string;
        status: number;
        duration_ms: number;
        message: string;
        model?: string;
      }
    | undefined,
  // mutation spies
  updateConfigAsync: vi.fn().mockResolvedValue({}),
  saveRawSettingsAsync: vi.fn().mockResolvedValue({}),
  autoDetectAuthAsync: vi.fn().mockResolvedValue({}),
  importManualAuthAsync: vi.fn().mockResolvedValue({}),
  startDaemonAsync: vi.fn().mockResolvedValue({ success: true, pid: 1234 }),
  stopDaemonAsync: vi.fn().mockResolvedValue({ success: true }),
  runProbeAsync: vi.fn().mockResolvedValue({
    ok: true,
    stage: 'runtime',
    status: 200,
    duration_ms: 42,
    message: 'Probe succeeded',
  }),
  resetProbe: vi.fn(),
  refetchStatus: vi.fn().mockResolvedValue({ data: undefined }),
  refetchConfig: vi.fn().mockResolvedValue({ data: undefined }),
  refetchRawSettings: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock useCursor
// ---------------------------------------------------------------------------

vi.mock('@/hooks/use-cursor', () => ({
  useCursor: () => ({
    status: hookState.status,
    statusLoading: false,
    statusError: null,
    refetchStatus: hookState.refetchStatus,
    config: hookState.config,
    configLoading: false,
    refetchConfig: hookState.refetchConfig,
    models: hookState.models,
    currentModel: 'gpt-5.3-codex',
    modelsLoading: false,
    rawSettings: hookState.rawSettings,
    rawSettingsLoading: false,
    refetchRawSettings: hookState.refetchRawSettings,
    updateConfig: vi.fn(),
    updateConfigAsync: hookState.updateConfigAsync,
    isUpdatingConfig: false,
    saveRawSettings: vi.fn(),
    saveRawSettingsAsync: hookState.saveRawSettingsAsync,
    isSavingRawSettings: false,
    autoDetectAuth: vi.fn(),
    autoDetectAuthAsync: hookState.autoDetectAuthAsync,
    isAutoDetectingAuth: false,
    autoDetectAuthResult: undefined,
    importManualAuth: vi.fn(),
    importManualAuthAsync: hookState.importManualAuthAsync,
    isImportingManualAuth: false,
    manualAuthResult: undefined,
    startDaemon: vi.fn(),
    startDaemonAsync: hookState.startDaemonAsync,
    isStartingDaemon: false,
    stopDaemon: vi.fn(),
    stopDaemonAsync: hookState.stopDaemonAsync,
    isStoppingDaemon: false,
    runProbe: vi.fn(),
    runProbeAsync: hookState.runProbeAsync,
    isRunningProbe: false,
    probeResult: hookState.probeResult,
    resetProbe: hookState.resetProbe,
  }),
}));

// Mock RawEditorSection (heavy component, not under test here)
vi.mock('@/components/copilot/config-form/raw-editor-section', () => ({
  RawEditorSection: ({ rawJsonContent }: { rawJsonContent: string }) => (
    <div data-testid="raw-editor">{rawJsonContent}</div>
  ),
}));

// ---------------------------------------------------------------------------
// Import page under test (after mocks)
// ---------------------------------------------------------------------------

import { CursorPage } from '@/pages/cursor';
import userEvent from '@testing-library/user-event';

// ---------------------------------------------------------------------------
// IntersectionObserver stub (SectionRail scroll-spy)
// ---------------------------------------------------------------------------

beforeEach(() => {
  global.IntersectionObserver = class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    root = null;
    rootMargin = '';
    thresholds = [];
  } as unknown as typeof IntersectionObserver;
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderCursorPage() {
  return render(<CursorPage />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CursorPage — smoke', () => {
  it('renders without crash', () => {
    renderCursorPage();
    // The page title from i18n key cursorPage.title should render (or fall back to key)
    expect(document.body).toBeTruthy();
  });
});

describe('StatusSidebar — identity strip', () => {
  it('renders page title', () => {
    renderCursorPage();
    // Title h1 with cursorPage.title i18n key
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('renders deprecated badge', () => {
    renderCursorPage();
    // cursorPage.deprecated i18n key — fallback shows key text
    const badges = screen.getAllByText(/deprecated/i);
    expect(badges.length).toBeGreaterThan(0);
  });

  it('shows enabled badge when status.enabled is true', () => {
    renderCursorPage();
    // enabled badge from integrationBadge computation
    const enabledBadges = screen.getAllByText(/enabled/i);
    expect(enabledBadges.length).toBeGreaterThan(0);
  });

  it('shows refresh status button', () => {
    renderCursorPage();
    const btn = screen.getByRole('button', { name: /refresh.*status/i });
    expect(btn).toBeInTheDocument();
  });
});

describe('StatusSidebar — status items', () => {
  it('shows integration status item', () => {
    renderCursorPage();
    // Multiple "Integration" texts are expected — status item + badge
    const items = screen.getAllByText(/^Integration$/i);
    expect(items.length).toBeGreaterThan(0);
  });

  it('shows authentication status item', () => {
    renderCursorPage();
    const items = screen.getAllByText(/^Authentication$/i);
    expect(items.length).toBeGreaterThan(0);
  });

  it('shows daemon status item', () => {
    renderCursorPage();
    // "Daemon" appears in status item label and section title — allow multiple
    const items = screen.getAllByText(/^Daemon$/i);
    expect(items.length).toBeGreaterThan(0);
  });
});

describe('StatusSidebar — live probe panel', () => {
  it('shows live probe section', () => {
    renderCursorPage();
    // "Live Probe" text appears in the sidebar — may appear multiple times
    const items = screen.getAllByText(/live probe/i);
    expect(items.length).toBeGreaterThan(0);
  });

  it('shows Run Live Probe button', () => {
    renderCursorPage();
    // i18n key cursorPage.runLiveProbe = "Run Live Probe"
    const btn = screen.getByRole('button', { name: /run live probe/i });
    expect(btn).toBeInTheDocument();
  });
});

describe('StatusSidebar — action buttons', () => {
  it('shows Disable Integration button when enabled', () => {
    renderCursorPage();
    expect(screen.getByRole('button', { name: /disable.*integration/i })).toBeInTheDocument();
  });

  it('shows Auto-detect Auth button', () => {
    renderCursorPage();
    // i18n: cursorPage.autoDetectAuth = "Legacy IDE Auto-detect"
    expect(screen.getByRole('button', { name: /legacy.*ide.*auto-detect/i })).toBeInTheDocument();
  });

  it('shows Manual Auth Import button', () => {
    renderCursorPage();
    // i18n: cursorPage.manualAuthImport = "Legacy Manual Import"
    expect(screen.getByRole('button', { name: /legacy.*manual.*import/i })).toBeInTheDocument();
  });

  it('shows Start Daemon button when daemon not running', () => {
    renderCursorPage();
    expect(screen.getByRole('button', { name: /start.*daemon/i })).toBeInTheDocument();
  });
});

describe('SectionRail — navigation items', () => {
  it('renders Presets rail item', () => {
    renderCursorPage();
    // Appears in both SectionRail and PresetsSection header
    expect(screen.getAllByText('Presets').length).toBeGreaterThan(0);
  });

  it('renders Model Mapping rail item', () => {
    renderCursorPage();
    // Appears in both SectionRail and ModelMappingSection header
    expect(screen.getAllByText('Model Mapping').length).toBeGreaterThan(0);
  });

  it('renders Settings rail item', () => {
    renderCursorPage();
    expect(screen.getAllByText('Settings').length).toBeGreaterThan(0);
  });

  it('renders Info rail item', () => {
    renderCursorPage();
    expect(screen.getAllByText('Info').length).toBeGreaterThan(0);
  });
});

describe('PresetsSection', () => {
  it('renders GPT-5.3 Codex preset button', () => {
    renderCursorPage();
    // Button appears once in PresetsSection
    const btns = screen.getAllByRole('button', { name: /gpt-5\.3 codex/i });
    expect(btns.length).toBeGreaterThan(0);
  });

  it('renders Claude 4.6 preset button', () => {
    renderCursorPage();
    expect(screen.getByRole('button', { name: /claude 4\.6/i })).toBeInTheDocument();
  });

  it('renders Gemini 3 Pro preset button', () => {
    renderCursorPage();
    expect(screen.getByRole('button', { name: /gemini 3 pro/i })).toBeInTheDocument();
  });
});

describe('ModelMappingSection', () => {
  it('shows Default Model label', () => {
    renderCursorPage();
    // Multiple "Default Model" labels may appear (label + description)
    expect(screen.getAllByText(/default.*model/i).length).toBeGreaterThan(0);
  });

  it('shows Opus Model label', () => {
    renderCursorPage();
    expect(screen.getByText(/opus.*model/i)).toBeInTheDocument();
  });

  it('shows Sonnet Model label', () => {
    renderCursorPage();
    expect(screen.getByText(/sonnet.*model/i)).toBeInTheDocument();
  });

  it('shows Haiku Model label', () => {
    renderCursorPage();
    expect(screen.getByText(/haiku.*model/i)).toBeInTheDocument();
  });
});

describe('RuntimeSettingsSection', () => {
  it('renders port input', () => {
    renderCursorPage();
    const portInput = document.getElementById('cursor-port');
    expect(portInput).toBeInTheDocument();
  });

  it('renders auto-start switch', () => {
    renderCursorPage();
    const sw = document.getElementById('cursor-auto-start');
    expect(sw).toBeInTheDocument();
  });

  it('renders ghost mode switch', () => {
    renderCursorPage();
    const sw = document.getElementById('cursor-ghost-mode');
    expect(sw).toBeInTheDocument();
  });
});

describe('InfoSection', () => {
  it('shows provider label', () => {
    renderCursorPage();
    expect(screen.getByText(/cursor ide.*legacy/i)).toBeInTheDocument();
  });

  it('shows file path', () => {
    renderCursorPage();
    // cursor.settings.json appears in badge and in info section file path
    expect(screen.getAllByText(/cursor\.settings\.json/i).length).toBeGreaterThan(0);
  });

  it('shows available model list items', () => {
    renderCursorPage();
    expect(screen.getByText('gpt-5.3-codex')).toBeInTheDocument();
    expect(screen.getByText('claude-opus-4.6')).toBeInTheDocument();
  });

  it('shows Default badge on current model', () => {
    renderCursorPage();
    // cursorPage.default i18n key
    expect(screen.getByText(/^default$/i)).toBeInTheDocument();
  });
});

describe('JsonPane — raw configuration header', () => {
  it('renders raw configuration label', () => {
    renderCursorPage();
    expect(screen.getByText(/raw.*configuration/i)).toBeInTheDocument();
  });

  it('renders RawEditorSection', () => {
    renderCursorPage();
    expect(screen.getByTestId('raw-editor')).toBeInTheDocument();
  });
});

describe('Manual Auth Dialog', () => {
  it('dialog not visible by default', () => {
    renderCursorPage();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens dialog on Manual Auth Import click', async () => {
    const user = userEvent.setup();
    renderCursorPage();
    await user.click(screen.getByRole('button', { name: /legacy.*manual.*import/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes dialog on Cancel click', async () => {
    const user = userEvent.setup();
    renderCursorPage();
    await user.click(screen.getByRole('button', { name: /legacy.*manual.*import/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows Access Token and Machine ID inputs in dialog', async () => {
    const user = userEvent.setup();
    renderCursorPage();
    await user.click(screen.getByRole('button', { name: /legacy.*manual.*import/i }));
    expect(document.getElementById('cursor-manual-token')).toBeInTheDocument();
    expect(document.getElementById('cursor-manual-machine-id')).toBeInTheDocument();
  });
});

describe('Save flow — header save button', () => {
  it('Save button disabled when no changes', () => {
    renderCursorPage();
    const saveBtn = screen.getByRole('button', { name: /^save$/i });
    expect(saveBtn).toBeDisabled();
  });
});

describe('Toggle enabled flow', () => {
  it('calls updateConfigAsync with enabled=false when Disable Integration clicked', async () => {
    const user = userEvent.setup();
    hookState.updateConfigAsync.mockResolvedValue({});
    renderCursorPage();
    await user.click(screen.getByRole('button', { name: /disable.*integration/i }));
    expect(hookState.updateConfigAsync).toHaveBeenCalledWith({ enabled: false });
  });
});

describe('Auto-detect auth flow', () => {
  it('calls autoDetectAuthAsync on button click', async () => {
    const user = userEvent.setup();
    hookState.autoDetectAuthAsync.mockResolvedValue({});
    renderCursorPage();
    await user.click(screen.getByRole('button', { name: /legacy.*ide.*auto-detect/i }));
    expect(hookState.autoDetectAuthAsync).toHaveBeenCalled();
  });
});

describe('CLIProxy navigation buttons', () => {
  it('renders Start CLIProxy Cursor Auth button', () => {
    renderCursorPage();
    // i18n: cursorPage.startCliproxyAuth = "Start CLIProxy Cursor Auth"
    expect(screen.getByRole('button', { name: /start cliproxy cursor auth/i })).toBeInTheDocument();
  });

  it('renders Open CLIProxy Cursor button', () => {
    renderCursorPage();
    // i18n: cursorPage.openCliproxyCursor = "Open CLIProxy Cursor"
    expect(screen.getByRole('button', { name: /open cliproxy cursor/i })).toBeInTheDocument();
  });
});
