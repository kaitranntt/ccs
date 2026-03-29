import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { AllProviders } from '../../setup/test-utils';
import { useCodex } from '@/hooks/use-codex';

function createJsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const diagnosticsResponse = {
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
    model: 'gpt-5.3-codex',
    modelReasoningEffort: null,
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

const initialRawConfigResponse = {
  path: '$CODEX_HOME/config.toml',
  resolvedPath: '/tmp/.codex/config.toml',
  exists: true,
  mtime: 100,
  rawText: 'model = "gpt-5.3-codex"\n',
  config: { model: 'gpt-5.3-codex' },
  parseError: null,
};

const patchedRawConfigResponse = {
  success: true,
  path: '$CODEX_HOME/config.toml',
  resolvedPath: '/tmp/.codex/config.toml',
  exists: true,
  mtime: 200,
  rawText: 'model = "gpt-5.4"\n',
  config: { model: 'gpt-5.4' },
  parseError: null,
};

const wrapper = ({ children }: { children: ReactNode }) => <AllProviders>{children}</AllProviders>;

describe('useCodex', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('updates cached raw config immediately after a structured patch save', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/codex/diagnostics')) {
        return Promise.resolve(createJsonResponse(diagnosticsResponse));
      }

      if (url.endsWith('/api/codex/config/raw') && !init?.method) {
        return Promise.resolve(createJsonResponse(initialRawConfigResponse));
      }

      if (url.endsWith('/api/codex/config/patch')) {
        return Promise.resolve(createJsonResponse(patchedRawConfigResponse));
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useCodex(), { wrapper });

    await waitFor(() => expect(result.current.rawConfig?.mtime).toBe(100));

    await act(async () => {
      await result.current.patchConfigAsync({
        kind: 'top-level',
        values: { model: 'gpt-5.4' },
        expectedMtime: 100,
      });
    });

    await waitFor(() => expect(result.current.rawConfig?.mtime).toBe(200));

    expect(result.current.rawConfig?.rawText).toBe('model = "gpt-5.4"\n');
    expect(result.current.rawConfig?.config?.model).toBe('gpt-5.4');
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/api/codex/config/raw'))
    ).toHaveLength(1);
  });
});
