import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, userEvent, waitFor } from '@tests/setup/test-utils';

// ConfigLayout renders desktop 3-pane grid only when matchMedia reports >= 1024px.
// jsdom does not implement matchMedia — stub it to always return desktop.
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

// SectionRail uses IntersectionObserver for scroll-spy — stub for jsdom.
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

const mocks = vi.hoisted(() => ({
  useCodex: vi.fn(),
  refetchDiagnostics: vi.fn(),
  refetchRawConfig: vi.fn(),
  saveRawConfigAsync: vi.fn(),
  patchConfigAsync: vi.fn(),
}));

vi.mock('@/hooks/use-codex', () => ({
  useCodex: mocks.useCodex,
}));

// react-resizable-panels was used in the pre-migration layout — stub retained for
// compatibility in case any transitive import still references it.
vi.mock('react-resizable-panels', () => ({
  PanelGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Panel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PanelResizeHandle: () => <div data-testid="panel-resize-handle" />,
}));

vi.mock('@/components/shared/code-editor', () => ({
  CodeEditor: ({
    value,
    onChange,
    readonly,
  }: {
    value: string;
    onChange: (next: string) => void;
    readonly?: boolean;
  }) => (
    <textarea
      aria-label="codex raw editor"
      value={value}
      readOnly={readonly}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

vi.mock('@/components/compatible-cli/codex-control-center-tab', () => ({
  CodexControlCenterTab: () => <div>Control Center</div>,
}));

vi.mock('@/components/compatible-cli/codex-docs-tab', () => ({
  CodexDocsTab: () => <div>Docs</div>,
}));

vi.mock('@/components/compatible-cli/codex-overview-tab', () => ({
  CodexOverviewTab: () => <div>Overview</div>,
}));

import { CodexPage } from '@/pages/codex';

const diagnostics = {
  binary: {
    installed: true,
    path: '/tmp/codex',
    installDir: '/tmp',
    source: 'PATH',
    version: 'codex-cli 0.118.0-alpha.3',
    overridePath: null,
    supportsConfigOverrides: true,
  },
  file: {
    label: 'Codex user config',
    path: '$CODEX_HOME/config.toml',
    resolvedPath: '/tmp/.codex/config.toml',
    exists: true,
    isSymlink: false,
    isRegularFile: true,
    sizeBytes: 64,
    mtimeMs: 100,
    parseError: null,
    readError: null,
  },
  workspacePath: '/tmp/workspace',
  config: {
    model: 'gpt-5.4',
    modelReasoningEffort: null,
    modelContextWindow: null,
    modelAutoCompactTokenLimit: null,
    modelProvider: null,
    activeProfile: null,
    approvalPolicy: null,
    sandboxMode: null,
    webSearch: null,
    toolOutputTokenLimit: null,
    personality: null,
    topLevelKeys: ['model'],
    profileCount: 0,
    profileNames: [],
    modelProviderCount: 0,
    modelProviders: [],
    featureCount: 0,
    enabledFeatures: [],
    disabledFeatures: [],
    trustedProjectCount: 0,
    untrustedProjectCount: 0,
    projectTrust: [],
    mcpServerCount: 0,
    mcpServers: [],
  },
  supportMatrix: [],
  warnings: [],
  docsReference: {
    providerValues: [],
    settingsHierarchy: [],
    notes: [],
    links: [],
    providerDocs: [],
  },
};

function buildUseCodexResult(overrides?: Partial<ReturnType<typeof mocks.useCodex>>) {
  return {
    diagnostics,
    diagnosticsLoading: false,
    diagnosticsError: null,
    refetchDiagnostics: mocks.refetchDiagnostics,
    rawConfig: {
      path: '$CODEX_HOME/config.toml',
      resolvedPath: '/tmp/.codex/config.toml',
      exists: true,
      mtime: 100,
      rawText: 'model = "gpt-5.4"\n',
      config: { model: 'gpt-5.4' },
      parseError: null,
      readError: null,
    },
    rawConfigLoading: false,
    rawConfigError: null,
    refetchRawConfig: mocks.refetchRawConfig,
    saveRawConfigAsync: mocks.saveRawConfigAsync,
    isSavingRawConfig: false,
    patchConfigAsync: mocks.patchConfigAsync,
    isPatchingConfig: false,
    ...overrides,
  };
}

describe('CodexPage', () => {
  beforeEach(() => {
    mocks.refetchDiagnostics.mockClear();
    mocks.refetchRawConfig.mockClear();
    mocks.refetchDiagnostics.mockResolvedValue({ status: 'success', isError: false, error: null });
    mocks.refetchRawConfig.mockResolvedValue({ status: 'success', isError: false, error: null });
    mocks.saveRawConfigAsync.mockReset();
    mocks.patchConfigAsync.mockReset();
  });

  it('discards local raw TOML edits when the user refreshes the page snapshot successfully', async () => {
    mocks.useCodex.mockReturnValue(buildUseCodexResult());

    render(<CodexPage />);

    const editor = screen.getByLabelText('codex raw editor');
    await userEvent.clear(editor);
    await userEvent.type(editor, 'model = "gpt-5.4-mini"');
    expect(editor).toHaveValue('model = "gpt-5.4-mini"');

    await userEvent.click(screen.getByLabelText('Refresh raw config'));

    await waitFor(() => expect(mocks.refetchDiagnostics).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.refetchRawConfig).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByLabelText('codex raw editor')).toHaveValue('model = "gpt-5.4"\n')
    );
  });

  it('keeps local raw TOML edits when refresh resolves with an error state', async () => {
    mocks.refetchRawConfig.mockResolvedValueOnce({
      status: 'error',
      isError: true,
      error: new Error('Failed to fetch Codex raw config'),
    });
    mocks.useCodex.mockReturnValue(buildUseCodexResult());

    render(<CodexPage />);

    const editor = screen.getByLabelText('codex raw editor');
    await userEvent.clear(editor);
    await userEvent.type(editor, 'model = "gpt-5.4-mini"');

    await userEvent.click(screen.getByLabelText('Refresh raw config'));

    await waitFor(() => expect(mocks.refetchDiagnostics).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.refetchRawConfig).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('codex raw editor')).toHaveValue('model = "gpt-5.4-mini"');
    expect(screen.getByText('Unsaved')).toBeInTheDocument();
  });

  it('restores the last fetched snapshot when the user discards local raw TOML edits', async () => {
    mocks.useCodex.mockReturnValue(buildUseCodexResult());

    render(<CodexPage />);

    const editor = screen.getByLabelText('codex raw editor');
    await userEvent.clear(editor);
    await userEvent.type(editor, 'model = "gpt-5.4-mini"');

    const discardButton = screen.getByRole('button', { name: 'Discard' });
    expect(discardButton).toBeEnabled();

    await userEvent.click(discardButton);

    expect(screen.getByLabelText('codex raw editor')).toHaveValue('model = "gpt-5.4"\n');
  });

  it('shows read errors and makes the raw editor read-only when the file cannot be edited safely', () => {
    mocks.useCodex.mockReturnValue(
      buildUseCodexResult({
        rawConfig: {
          path: '$CODEX_HOME/config.toml',
          resolvedPath: '/tmp/.codex/config.toml',
          exists: true,
          mtime: 100,
          rawText: '',
          config: null,
          parseError: null,
          readError: 'Refusing symlink file for safety.',
        },
      })
    );

    render(<CodexPage />);

    expect(screen.getByText(/Read-only: Refusing symlink file for safety\./)).toBeInTheDocument();
    expect(screen.getByLabelText('codex raw editor')).toHaveAttribute('readonly');
  });
});
