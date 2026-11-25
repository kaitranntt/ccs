import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, userEvent, waitFor } from '@tests/setup/test-utils';

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
  CodexControlCenterTab: ({ disabled }: { disabled?: boolean }) => (
    <div data-testid="codex-control-center" data-disabled={String(Boolean(disabled))}>
      Control Center
    </div>
  ),
}));

vi.mock('@/components/compatible-cli/codex-docs-tab', () => ({
  CodexDocsTab: () => <div>Docs</div>,
}));

vi.mock('@/components/compatible-cli/codex-overview-tab', () => ({
  CodexOverviewTab: () => <div>Overview</div>,
}));

import { CodexPage } from '@/pages/codex';

const joinedMigrationRawText = `[notice.model_migrations]
"gpt-5.3-codex" = "gpt-5.4"[agents.code_simplifier]
description = "Keep exact text"
`;
const repairedMigrationRawText = joinedMigrationRawText.replace(
  '"gpt-5.4"[agents.code_simplifier]',
  '"gpt-5.4"\n[agents.code_simplifier]'
);

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

    const editor = await screen.findByLabelText('codex raw editor');
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

    const editor = await screen.findByLabelText('codex raw editor');
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

    const editor = await screen.findByLabelText('codex raw editor');
    await userEvent.clear(editor);
    await userEvent.type(editor, 'model = "gpt-5.4-mini"');

    const discardButton = screen.getByRole('button', { name: 'Discard' });
    expect(discardButton).toBeEnabled();

    await userEvent.click(discardButton);

    expect(screen.getByLabelText('codex raw editor')).toHaveValue('model = "gpt-5.4"\n');
  });

  it('shows read errors and makes the raw editor read-only when the file cannot be edited safely', async () => {
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
    expect(await screen.findByLabelText('codex raw editor')).toHaveAttribute('readonly');
    expect(
      screen.queryByRole('button', { name: 'Preview one-newline repair' })
    ).not.toBeInTheDocument();
  });

  it('previews the one-newline repair as an unsaved draft before explicitly saving it', async () => {
    mocks.saveRawConfigAsync.mockResolvedValue({ success: true, mtime: 101 });
    mocks.useCodex.mockReturnValue(
      buildUseCodexResult({
        rawConfig: {
          path: '$CODEX_HOME/config.toml',
          resolvedPath: '/tmp/.codex/config.toml',
          exists: true,
          mtime: 100,
          rawText: joinedMigrationRawText,
          config: null,
          parseError: 'Invalid TOML',
          readError: null,
        },
      })
    );

    render(<CodexPage />);

    await userEvent.click(screen.getByRole('tab', { name: 'Control Center' }));
    expect(screen.getByTestId('codex-control-center')).toHaveAttribute('data-disabled', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Preview one-newline repair' }));

    expect(screen.getByLabelText('codex raw editor')).toHaveValue(repairedMigrationRawText);
    expect(screen.getByText('Unsaved')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(screen.getByTestId('codex-control-center')).toHaveAttribute('data-disabled', 'true');
    expect(mocks.saveRawConfigAsync).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mocks.saveRawConfigAsync).toHaveBeenCalledWith({
        rawText: repairedMigrationRawText,
        expectedMtime: 100,
      })
    );
  });

  it('keeps the repair draft bound to its original mtime across a fetched snapshot update', async () => {
    mocks.saveRawConfigAsync.mockResolvedValue({ success: true, mtime: 201 });
    let rawConfig = {
      path: '$CODEX_HOME/config.toml',
      resolvedPath: '/tmp/.codex/config.toml',
      exists: true,
      mtime: 100,
      rawText: joinedMigrationRawText,
      config: null,
      parseError: 'Invalid TOML',
      readError: null,
    };
    mocks.useCodex.mockImplementation(() => buildUseCodexResult({ rawConfig }));

    const view = render(<CodexPage />);
    await userEvent.click(screen.getByRole('tab', { name: 'Control Center' }));
    await userEvent.click(screen.getByRole('button', { name: 'Preview one-newline repair' }));

    rawConfig = {
      ...rawConfig,
      mtime: 200,
      rawText: 'model = "gpt-5.4-mini"\n',
      config: { model: 'gpt-5.4-mini' },
      parseError: null,
    };
    view.rerender(<CodexPage />);

    expect(screen.getByLabelText('codex raw editor')).toHaveValue(repairedMigrationRawText);
    expect(screen.getByTestId('codex-control-center')).toHaveAttribute('data-disabled', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mocks.saveRawConfigAsync).toHaveBeenCalledWith({
        rawText: repairedMigrationRawText,
        expectedMtime: 100,
      })
    );
  });

  it('keeps manual raw edits bound to the snapshot mtime captured on first edit', async () => {
    mocks.saveRawConfigAsync.mockResolvedValue({ success: true, mtime: 201 });
    let rawConfig = {
      path: '$CODEX_HOME/config.toml',
      resolvedPath: '/tmp/.codex/config.toml',
      exists: true,
      mtime: 100,
      rawText: 'model = "gpt-5.4"\n',
      config: { model: 'gpt-5.4' },
      parseError: null,
      readError: null,
    };
    mocks.useCodex.mockImplementation(() => buildUseCodexResult({ rawConfig }));

    const view = render(<CodexPage />);
    const editor = screen.getByLabelText('codex raw editor');
    await userEvent.clear(editor);
    await userEvent.type(editor, 'model = "gpt-5.4-mini"');

    rawConfig = {
      ...rawConfig,
      mtime: 200,
      rawText: 'model = "gpt-5.4-high"\n',
      config: { model: 'gpt-5.4-high' },
    };
    view.rerender(<CodexPage />);

    expect(screen.getByLabelText('codex raw editor')).toHaveValue('model = "gpt-5.4-mini"');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mocks.saveRawConfigAsync).toHaveBeenCalledWith({
        rawText: 'model = "gpt-5.4-mini"',
        expectedMtime: 100,
      })
    );
  });

  it('does not offer the targeted repair for generic invalid TOML', () => {
    mocks.useCodex.mockReturnValue(
      buildUseCodexResult({
        rawConfig: {
          path: '$CODEX_HOME/config.toml',
          resolvedPath: '/tmp/.codex/config.toml',
          exists: true,
          mtime: 100,
          rawText: 'model = "gpt-5.4"\n[features\n',
          config: null,
          parseError: 'Invalid TOML',
          readError: null,
        },
      })
    );

    render(<CodexPage />);

    expect(
      screen.queryByRole('button', { name: 'Preview one-newline repair' })
    ).not.toBeInTheDocument();
  });

  it('re-enables structured controls only after the saved valid snapshot is loaded', async () => {
    mocks.saveRawConfigAsync.mockResolvedValue({ success: true, mtime: 101 });
    let rawConfig = {
      path: '$CODEX_HOME/config.toml',
      resolvedPath: '/tmp/.codex/config.toml',
      exists: true,
      mtime: 100,
      rawText: joinedMigrationRawText,
      config: null,
      parseError: 'Invalid TOML',
      readError: null,
    };
    mocks.useCodex.mockImplementation(() => buildUseCodexResult({ rawConfig }));

    const view = render(<CodexPage />);
    await userEvent.click(screen.getByRole('tab', { name: 'Control Center' }));
    await userEvent.click(screen.getByRole('button', { name: 'Preview one-newline repair' }));
    expect(screen.getByTestId('codex-control-center')).toHaveAttribute('data-disabled', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mocks.saveRawConfigAsync).toHaveBeenCalledTimes(1));

    rawConfig = {
      ...rawConfig,
      mtime: 101,
      rawText: repairedMigrationRawText,
      config: {
        notice: { model_migrations: { 'gpt-5.3-codex': 'gpt-5.4' } },
        agents: { code_simplifier: { description: 'Keep exact text' } },
      },
      parseError: null,
    };
    view.rerender(<CodexPage />);

    expect(screen.getByTestId('codex-control-center')).toHaveAttribute('data-disabled', 'false');
  });
});
