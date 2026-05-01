import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FlexibleModelSelector } from '@/components/cliproxy/provider-model-selector';
import { MODEL_CATALOGS, buildUiCatalogs } from '@/lib/model-catalogs';
import { render, screen, userEvent } from '@tests/setup/test-utils';

const noisyAgyModels = [
  { id: 'agy/gemini-3.1-pro-high', owned_by: 'antigravity' },
  { id: 'gemini-3.1-pro-high', owned_by: 'antigravity' },
  { id: 'gemini-3.1-pro-low', owned_by: 'antigravity' },
  { id: 'gemini-3.1-pro-preview', owned_by: 'antigravity' },
  { id: 'gemini-3.1-pro-preview-customtools', owned_by: 'antigravity' },
  { id: 'gemini-3-pro-preview', owned_by: 'antigravity' },
  { id: 'gemini-3-1-flash-preview', owned_by: 'antigravity' },
  { id: 'gemini-3-1-flash-preview-customtools', owned_by: 'antigravity' },
  { id: 'gpt-oss-120b-medium', owned_by: 'antigravity' },
];

const catalog = buildUiCatalogs({
  agy: {
    provider: 'agy',
    displayName: 'Antigravity',
    defaultModel: 'claude-opus-4-6-thinking',
    models: noisyAgyModels.map(({ id }) => ({ id, name: id })),
  },
}).agy;

describe('FlexibleModelSelector', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
      configurable: true,
      value: vi.fn(() => false),
    });
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });

  it('keeps the picker focused on curated Antigravity live routes', async () => {
    render(
      <FlexibleModelSelector
        label="Primary model"
        value={undefined}
        onChange={vi.fn()}
        catalog={catalog}
        allModels={noisyAgyModels}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /select model/i }));

    expect(screen.getByText('gemini-3.1-pro-high')).toBeInTheDocument();
    expect(screen.getByText('gemini-3.1-pro-low')).toBeInTheDocument();
    expect(screen.getByText('gemini-3-1-flash-preview')).toBeInTheDocument();

    expect(screen.queryByText('gemini-3.1-pro-preview')).not.toBeInTheDocument();
    expect(screen.queryByText('gemini-3-pro-preview')).not.toBeInTheDocument();
    expect(screen.queryByText('agy/gemini-3.1-pro-high')).not.toBeInTheDocument();
    expect(screen.queryByText('gemini-3-1-flash-preview-customtools')).not.toBeInTheDocument();
    expect(screen.queryByText('gpt-oss-120b-medium')).not.toBeInTheDocument();
    expect(screen.queryByText(/All Models \(/i)).not.toBeInTheDocument();
  });

  it('preserves a filtered legacy value under the current-value fallback group', async () => {
    render(
      <FlexibleModelSelector
        label="Primary model"
        value="gemini-3.1-pro-preview"
        onChange={vi.fn()}
        catalog={catalog}
        allModels={noisyAgyModels}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /gemini-3\.1-pro-preview/i }));

    expect(screen.getByText('Current value')).toBeInTheDocument();
    expect(screen.getAllByText('gemini-3.1-pro-preview').length).toBeGreaterThan(0);
    expect(screen.getByText('gemini-3.1-pro-high')).toBeInTheDocument();
  });

  it('offers codex effort-suffixed variants as first-class selectable options', async () => {
    const onChange = vi.fn();

    render(
      <FlexibleModelSelector
        label="Primary model"
        value={undefined}
        onChange={onChange}
        catalog={MODEL_CATALOGS.codex}
        allModels={[]}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /select model/i }));

    expect(screen.getByText('gpt-5.3-codex-high')).toBeInTheDocument();
    expect(screen.getByText('gpt-5.3-codex-xhigh')).toBeInTheDocument();

    await userEvent.click(screen.getByText('gpt-5.3-codex-high'));
    expect(onChange).toHaveBeenCalledWith('gpt-5.3-codex-high');
  });

  it('does not relegate saved codex effort variants to the legacy current-value fallback', async () => {
    render(
      <FlexibleModelSelector
        label="Primary model"
        value="gpt-5.3-codex-high"
        onChange={vi.fn()}
        catalog={MODEL_CATALOGS.codex}
        allModels={[]}
      />
    );

    expect(screen.getByRole('button', { name: /gpt-5\.3-codex-high/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /gpt-5\.3-codex-high/i }));

    expect(screen.queryByText('Current value')).not.toBeInTheDocument();
    expect(screen.getByText('gpt-5.3-codex')).toBeInTheDocument();
    expect(screen.getAllByText('gpt-5.3-codex-high').length).toBeGreaterThan(0);
  });

  it('preserves saved legacy codex model IDs under the current-value fallback', async () => {
    render(
      <FlexibleModelSelector
        label="Primary model"
        value="gpt-5-codex"
        onChange={vi.fn()}
        catalog={MODEL_CATALOGS.codex}
        allModels={[]}
      />
    );

    expect(screen.getByRole('button', { name: /gpt-5-codex/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /gpt-5-codex/i }));

    expect(screen.getByText('Current value')).toBeInTheDocument();
    expect(screen.getAllByText('gpt-5-codex').length).toBeGreaterThan(0);
    expect(screen.getByText('gpt-5.4')).toBeInTheDocument();
    expect(screen.getByText('gpt-5.4-mini')).toBeInTheDocument();
  });

  it('preserves explicit suffixes on supplemental codex models outside the static catalog', async () => {
    const onChange = vi.fn();

    render(
      <FlexibleModelSelector
        label="Primary model"
        value={undefined}
        onChange={onChange}
        catalog={MODEL_CATALOGS.codex}
        allModels={[{ id: 'gpt-5.5-codex-high', owned_by: 'openai' }]}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /select model/i }));

    expect(screen.getByText(/All Models \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText('gpt-5.5-codex-high')).toBeInTheDocument();

    await userEvent.click(screen.getByText('gpt-5.5-codex-high'));
    expect(onChange).toHaveBeenCalledWith('gpt-5.5-codex-high');
  });
});
