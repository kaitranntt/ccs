import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@tests/setup/test-utils';

import { CodeEditor } from '@/components/shared/code-editor';

vi.mock('@/hooks/use-theme', () => ({
  useTheme: () => ({ isDark: false }),
}));

describe('CodeEditor', () => {
  it('creates an internal scroll viewport in fill-parent mode and keeps status outside it', () => {
    const { container } = render(
      <CodeEditor
        value={'{\n  "provider": "openrouter"\n}'}
        onChange={vi.fn()}
        language="json"
        minHeight="100%"
        heightMode="fill-parent"
      />
    );

    const viewport = container.querySelector('[data-slot="code-editor-viewport"]');
    const root = container.firstElementChild;

    expect(viewport).toBeInTheDocument();
    expect(root).toHaveStyle({ height: '100%' });
    expect(viewport).not.toContainElement(screen.getByText('Valid JSON'));
  });

  it('keeps readonly status outside the scroll viewport for bounded editors', () => {
    const { container } = render(
      <CodeEditor
        value={'{\n  "provider": "openrouter"\n}'}
        onChange={vi.fn()}
        language="json"
        readonly
        minHeight="calc(60vh - 120px)"
        heightMode="fill-parent"
      />
    );

    const viewport = container.querySelector('[data-slot="code-editor-viewport"]');
    const textarea = container.querySelector('textarea');
    const root = container.firstElementChild;

    expect(root).toHaveStyle({ height: 'calc(60vh - 120px)' });
    expect(textarea).toBeDisabled();
    expect(viewport).not.toContainElement(screen.getByText('(Read-only)'));
  });

  it('preserves content mode as the default layout contract', () => {
    const { container } = render(
      <CodeEditor value={'{\n  "provider": "openrouter"\n}'} onChange={vi.fn()} language="json" />
    );

    expect(container.querySelector('[data-slot="code-editor-viewport"]')).not.toBeInTheDocument();
  });

  it('validates TOML payloads when language is toml', () => {
    render(
      <CodeEditor
        value={'model = "gpt-5.4"\n[features]\nmulti_agent = true\n'}
        onChange={vi.fn()}
        language="toml"
      />
    );

    expect(screen.getByText('Valid TOML')).toBeInTheDocument();
  });
});
