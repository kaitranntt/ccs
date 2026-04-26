/**
 * CursorPage — integration-level tests (pre-existing, updated for design-system rewrite).
 *
 * Phase 4 rewrite replaced Tabs (Model Config | Settings | Info) with FormSections
 * in a scrollable FormPane. Port input and other fields are now always visible
 * (no tab navigation needed). Tests updated accordingly.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent, waitFor } from '@tests/setup/test-utils';

const mocks = vi.hoisted(() => ({
  useCursor: vi.fn(),
  runProbeAsync: vi.fn(),
  resetProbe: vi.fn(),
  refetchStatus: vi.fn(),
  refetchConfig: vi.fn(),
  refetchRawSettings: vi.fn(),
  updateConfigAsync: vi.fn(),
  saveRawSettingsAsync: vi.fn(),
  autoDetectAuthAsync: vi.fn(),
  importManualAuthAsync: vi.fn(),
  startDaemonAsync: vi.fn(),
  stopDaemonAsync: vi.fn(),
}));

vi.mock('@/hooks/use-cursor', () => ({
  useCursor: mocks.useCursor,
}));

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: toastMocks,
}));

vi.mock('@/components/copilot/config-form/raw-editor-section', () => ({
  RawEditorSection: () => <div>Raw Editor</div>,
}));

vi.mock('@/components/ui/searchable-select', () => ({
  SearchableSelect: ({ value }: { value?: string }) => (
    <div data-testid="searchable-select">{value ?? 'select'}</div>
  ),
}));

import { CursorPage } from '@/pages/cursor';

const probeFailure = {
  ok: false,
  stage: 'daemon',
  status: 503,
  duration_ms: 321,
  error_type: 'daemon_not_running',
  model: 'gpt-5.3-codex',
  message: 'Cursor daemon is not running.',
};

function buildUseCursorResult(overrides: Record<string, unknown> = {}) {
  return {
    status: {
      enabled: true,
      authenticated: true,
      auth_method: 'manual',
      token_age: 1,
      token_expired: false,
      daemon_running: false,
      port: 20129,
      auto_start: false,
      ghost_mode: true,
    },
    statusLoading: false,
    refetchStatus: mocks.refetchStatus,
    config: {
      enabled: true,
      port: 20129,
      auto_start: false,
      ghost_mode: true,
      model: 'gpt-5.3-codex',
      opus_model: 'gpt-5.1-codex-max',
      sonnet_model: 'gpt-5.3-codex',
      haiku_model: 'gpt-5-mini',
    },
    refetchConfig: mocks.refetchConfig,
    updateConfigAsync: mocks.updateConfigAsync,
    isUpdatingConfig: false,
    models: [{ id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', provider: 'openai' }],
    modelsLoading: false,
    currentModel: 'gpt-5.3-codex',
    rawSettings: {
      settings: {},
      mtime: 100,
      path: '/tmp/cursor.settings.json',
      exists: true,
    },
    rawSettingsLoading: false,
    refetchRawSettings: mocks.refetchRawSettings,
    saveRawSettingsAsync: mocks.saveRawSettingsAsync,
    isSavingRawSettings: false,
    autoDetectAuthAsync: mocks.autoDetectAuthAsync,
    isAutoDetectingAuth: false,
    autoDetectAuthResult: undefined,
    importManualAuthAsync: mocks.importManualAuthAsync,
    isImportingManualAuth: false,
    manualAuthResult: undefined,
    startDaemonAsync: mocks.startDaemonAsync,
    isStartingDaemon: false,
    stopDaemonAsync: mocks.stopDaemonAsync,
    isStoppingDaemon: false,
    runProbeAsync: mocks.runProbeAsync,
    isRunningProbe: false,
    probeResult: undefined,
    resetProbe: mocks.resetProbe,
    ...overrides,
  };
}

describe('CursorPage', () => {
  beforeEach(() => {
    mocks.runProbeAsync.mockReset();
    mocks.resetProbe.mockReset();
    mocks.refetchConfig.mockReset();
    mocks.refetchStatus.mockReset();
    mocks.refetchRawSettings.mockReset();
    mocks.refetchConfig.mockResolvedValue({
      status: 'success',
      isError: false,
      error: null,
      data: buildUseCursorResult().config,
    });
    mocks.refetchStatus.mockResolvedValue({ data: buildUseCursorResult().status });
    mocks.runProbeAsync.mockResolvedValue(probeFailure);
    mocks.useCursor.mockReturnValue(buildUseCursorResult());
    toastMocks.error.mockReset();
    toastMocks.success.mockReset();
  });

  it('renders persistent live probe results in the sidebar', async () => {
    mocks.useCursor.mockReturnValue(
      buildUseCursorResult({
        probeResult: probeFailure,
      })
    );

    render(<CursorPage />);

    // "Live Probe" appears in sidebar header and as section heading — allow multiple
    expect(screen.getAllByText('Live Probe').length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByText('Probe failed')).toBeInTheDocument());
    expect(screen.getByText('503')).toBeInTheDocument();
    expect(screen.getByText('321 ms')).toBeInTheDocument();
    expect(screen.getByText('Cursor daemon is not running.')).toBeInTheDocument();
    expect(screen.getAllByText('gpt-5.3-codex').length).toBeGreaterThan(0);
  });

  it('runs the live probe from the sidebar action', async () => {
    render(<CursorPage />);

    await userEvent.click(screen.getByRole('button', { name: 'Run Live Probe' }));

    await waitFor(() => expect(mocks.runProbeAsync).toHaveBeenCalledTimes(1));
  });

  it('blocks live probe runs while local edits are unsaved', async () => {
    render(<CursorPage />);

    // Phase 4 rewrite: Port input is always visible in RuntimeSettingsSection (no tab nav needed)
    const portInput = document.getElementById('cursor-port') as HTMLInputElement;
    expect(portInput).toBeInTheDocument();

    await userEvent.clear(portInput);
    await userEvent.type(portInput, '20130');
    await userEvent.click(screen.getByRole('button', { name: 'Run Live Probe' }));

    expect(mocks.runProbeAsync).not.toHaveBeenCalled();
    expect(toastMocks.error).toHaveBeenCalledWith(
      'Save or discard Cursor changes before running the live probe'
    );
  });

  it('refreshes config state with accessible refresh controls', async () => {
    render(<CursorPage />);

    expect(screen.getByRole('button', { name: 'Refresh Cursor status' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Refresh Cursor configuration' })
    ).toBeInTheDocument();

    // Phase 4 rewrite: Port input is always visible (no tab click needed)
    const portInput = document.getElementById('cursor-port') as HTMLInputElement;
    expect(portInput).toBeInTheDocument();

    await userEvent.clear(portInput);
    await userEvent.type(portInput, '20130');

    await userEvent.click(screen.getByRole('button', { name: 'Refresh Cursor configuration' }));

    await waitFor(() => expect(mocks.refetchConfig).toHaveBeenCalledTimes(1));
    // After refresh, port resets to pristine config value 20129
    expect(portInput).toHaveValue(20129);
  });
});
