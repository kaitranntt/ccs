import { describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent } from '@tests/setup/test-utils';

vi.mock('@/components/cliproxy/provider-model-selector', () => ({
  FlexibleModelSelector: () => <div data-testid="flexible-model-selector" />,
}));

vi.mock('@/components/cliproxy/extended-context-toggle', () => ({
  ExtendedContextToggle: () => <div data-testid="extended-context-toggle" />,
}));

import { ModelConfigSection } from '@/components/cliproxy/provider-editor/model-config-section';
import { MODEL_CATALOGS } from '@/lib/model-catalogs';

describe('ModelConfigSection presets', () => {
  it('groups codex presets by free and paid tiers', async () => {
    const onApplyPreset = vi.fn();

    render(
      <ModelConfigSection
        catalog={MODEL_CATALOGS.codex}
        savedPresets={[]}
        currentModel="gpt-5-codex"
        opusModel="gpt-5-codex"
        sonnetModel="gpt-5-codex"
        haikuModel="gpt-5-codex-mini"
        providerModels={[]}
        provider="codex"
        onExtendedContextToggle={vi.fn()}
        onApplyPreset={onApplyPreset}
        onUpdateEnvValue={vi.fn()}
        onOpenCustomPreset={vi.fn()}
        onDeletePreset={vi.fn()}
      />
    );

    expect(screen.getByText('Free Tier')).toBeInTheDocument();
    expect(screen.getByText('Paid Tier')).toBeInTheDocument();
    expect(screen.getByText('Available on free or paid plans')).toBeInTheDocument();
    expect(screen.getByText('Requires paid access')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'GPT-5.4' }));

    expect(onApplyPreset).toHaveBeenCalledWith({
      ANTHROPIC_MODEL: 'gpt-5.4',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-5.4',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-5.4',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gpt-5.4-mini',
    });
  });

  it('keeps non-tiered provider presets ungrouped', () => {
    render(
      <ModelConfigSection
        catalog={MODEL_CATALOGS.agy}
        savedPresets={[]}
        currentModel="claude-opus-4-6-thinking"
        opusModel="claude-opus-4-6-thinking"
        sonnetModel="gemini-3.9-pro-preview"
        haikuModel="gemini-3-9-flash-preview"
        providerModels={[]}
        provider="agy"
        onExtendedContextToggle={vi.fn()}
        onApplyPreset={vi.fn()}
        onUpdateEnvValue={vi.fn()}
        onOpenCustomPreset={vi.fn()}
        onDeletePreset={vi.fn()}
      />
    );

    expect(screen.queryByText('Free Tier')).not.toBeInTheDocument();
    expect(screen.queryByText('Paid Tier')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Claude Opus 4.6 Thinking' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gemini Pro High' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gemini Pro Low' })).toBeInTheDocument();
    expect(screen.getByTestId('extended-context-toggle')).toBeInTheDocument();
  });

  it('applies Antigravity Gemini presets using the best live Gemini family ids', async () => {
    const onApplyPreset = vi.fn();

    render(
      <ModelConfigSection
        catalog={MODEL_CATALOGS.agy}
        savedPresets={[]}
        currentModel="claude-opus-4-6-thinking"
        opusModel="claude-opus-4-6-thinking"
        sonnetModel="gemini-3.9-pro-preview"
        haikuModel="gemini-3-9-flash-preview"
        providerModels={[
          { id: 'gemini-3.9-pro-preview-customtools', owned_by: 'antigravity' },
          { id: 'gemini-3.9-pro-preview', owned_by: 'antigravity' },
          { id: 'gemini-3-9-flash-preview-customtools', owned_by: 'antigravity' },
          { id: 'gemini-3-9-flash-preview', owned_by: 'antigravity' },
        ]}
        provider="agy"
        onExtendedContextToggle={vi.fn()}
        onApplyPreset={onApplyPreset}
        onUpdateEnvValue={vi.fn()}
        onOpenCustomPreset={vi.fn()}
        onDeletePreset={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Gemini Pro High' }));

    expect(onApplyPreset).toHaveBeenCalledWith({
      ANTHROPIC_MODEL: 'gemini-3.1-pro-high',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'gemini-3.1-pro-high',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'gemini-3.1-pro-high',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gemini-3-9-flash-preview',
    });
  });

  it('applies managed short prefixes when routing guidance is available', async () => {
    const onApplyPreset = vi.fn();

    render(
      <ModelConfigSection
        catalog={MODEL_CATALOGS.gemini}
        savedPresets={[]}
        currentModel="gemini-3-flash-preview"
        opusModel="gemini-3.1-pro-preview"
        sonnetModel="gemini-3.1-pro-preview"
        haikuModel="gemini-3-flash-preview"
        providerModels={[]}
        routing={{
          provider: 'gemini',
          displayName: 'Gemini',
          prefix: 'gcli',
          safeCount: 0,
          shadowedCount: 2,
          prefixOnlyCount: 0,
          models: [
            {
              modelId: 'gemini-3.1-pro-preview',
              modelName: 'Gemini Pro',
              prefix: 'gcli',
              pinnedModelId: 'gcli/gemini-3.1-pro-preview',
              recommendedModelId: 'gcli/gemini-3.1-pro-preview',
              pinnedAvailable: true,
              unprefixedStatus: 'shadowed',
              effectiveProvider: 'agy',
              effectiveDisplayName: 'Antigravity',
              effectiveOwnedBy: 'antigravity',
              summary: 'shadowed by Antigravity',
            },
            {
              modelId: 'gemini-3-flash-preview',
              modelName: 'Gemini Flash',
              prefix: 'gcli',
              pinnedModelId: 'gcli/gemini-3-flash-preview',
              recommendedModelId: 'gcli/gemini-3-flash-preview',
              pinnedAvailable: true,
              unprefixedStatus: 'shadowed',
              effectiveProvider: 'agy',
              effectiveDisplayName: 'Antigravity',
              effectiveOwnedBy: 'antigravity',
              summary: 'shadowed by Antigravity',
            },
          ],
        }}
        provider="gemini"
        onExtendedContextToggle={vi.fn()}
        onApplyPreset={onApplyPreset}
        onUpdateEnvValue={vi.fn()}
        onOpenCustomPreset={vi.fn()}
        onDeletePreset={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Gemini Flash' }));

    expect(onApplyPreset).toHaveBeenCalledWith({
      ANTHROPIC_MODEL: 'gcli/gemini-3-flash-preview',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'gcli/gemini-3.1-pro-preview',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'gcli/gemini-3.1-pro-preview',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gcli/gemini-3-flash-preview',
    });
  });

  it('normalizes saved presets through preferred pinned model ids when live pinning is available', async () => {
    const onApplyPreset = vi.fn();

    render(
      <ModelConfigSection
        catalog={MODEL_CATALOGS.gemini}
        savedPresets={[
          {
            name: 'legacy',
            default: 'gemini-3-flash-preview',
            opus: 'gemini-3.1-pro-preview',
            sonnet: 'gemini-3.1-pro-preview',
            haiku: 'gemini-3-flash-preview',
          },
        ]}
        currentModel="gemini-3-flash-preview"
        opusModel="gemini-3.1-pro-preview"
        sonnetModel="gemini-3.1-pro-preview"
        haikuModel="gemini-3-flash-preview"
        providerModels={[]}
        routing={{
          provider: 'gemini',
          displayName: 'Gemini',
          prefix: 'gcli',
          safeCount: 0,
          shadowedCount: 2,
          prefixOnlyCount: 0,
          models: [
            {
              modelId: 'gemini-3.1-pro-preview',
              modelName: 'Gemini Pro',
              prefix: 'gcli',
              pinnedModelId: 'gcli/gemini-3.1-pro-preview',
              recommendedModelId: 'gcli/gemini-3.1-pro-preview',
              pinnedAvailable: true,
              unprefixedStatus: 'shadowed',
              effectiveProvider: 'agy',
              effectiveDisplayName: 'Antigravity',
              effectiveOwnedBy: 'antigravity',
              summary: 'shadowed by Antigravity',
            },
            {
              modelId: 'gemini-3-flash-preview',
              modelName: 'Gemini Flash',
              prefix: 'gcli',
              pinnedModelId: 'gcli/gemini-3-flash-preview',
              recommendedModelId: 'gcli/gemini-3-flash-preview',
              pinnedAvailable: true,
              unprefixedStatus: 'shadowed',
              effectiveProvider: 'agy',
              effectiveDisplayName: 'Antigravity',
              effectiveOwnedBy: 'antigravity',
              summary: 'shadowed by Antigravity',
            },
          ],
        }}
        provider="gemini"
        onExtendedContextToggle={vi.fn()}
        onApplyPreset={onApplyPreset}
        onUpdateEnvValue={vi.fn()}
        onOpenCustomPreset={vi.fn()}
        onDeletePreset={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'legacy' }));

    expect(onApplyPreset).toHaveBeenCalledWith({
      ANTHROPIC_MODEL: 'gcli/gemini-3-flash-preview',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'gcli/gemini-3.1-pro-preview',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'gcli/gemini-3.1-pro-preview',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gcli/gemini-3-flash-preview',
    });
  });
});
