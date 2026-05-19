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
    const root = container.querySelector('[data-slot="code-editor-root"]');

    expect(viewport).toBeInTheDocument();
    expect(root).toHaveStyle({ height: '100%' });
    expect(viewport).not.toContainElement(screen.getByText('Valid JSON'));
  });

  it('renders a CodeMirror surface when readonly so the user can still select and copy', () => {
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
    const root = container.querySelector('[data-slot="code-editor-root"]');
    const cm = container.querySelector('[data-slot="code-editor-codemirror"]');

    expect(root).toHaveStyle({ height: 'calc(60vh - 120px)' });
    expect(cm).toBeInTheDocument();
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

  it('mounts a CodeMirror editor for TOML with the value as the document', () => {
    const rawToml =
      'model = "gpt-5.4"\n' +
      '[agents.brainstormer]\n' +
      'config_file = "agents/brainstormer.toml"\n';

    const { container } = render(
      <CodeEditor
        value={rawToml}
        onChange={vi.fn()}
        language="toml"
        minHeight="100%"
        heightMode="fill-parent"
        exactText
      />
    );

    const cm = container.querySelector('[data-slot="code-editor-codemirror"]');
    expect(cm).toBeInTheDocument();
    const cmContent = container.querySelector('.cm-content');
    expect(cmContent?.textContent).toContain('model = "gpt-5.4"');
    expect(cmContent?.textContent).toContain('[agents.brainstormer]');
    expect(screen.getByText('Valid TOML')).toBeInTheDocument();
  });

  it('reports a validation error when JSON is malformed', () => {
    render(<CodeEditor value={'{ "broken": '} onChange={vi.fn()} language="json" />);
    expect(screen.queryByText('Valid JSON')).not.toBeInTheDocument();
  });

  it('masks the entire multi-line TOML triple-quoted secret value', () => {
    const value = [
      'name = "demo"',
      'API_KEY = """',
      'secret-line-one',
      'secret-line-two',
      '"""',
      'other = "visible"',
    ].join('\n');

    const { container } = render(<CodeEditor value={value} onChange={vi.fn()} language="toml" />);

    const masks = container.querySelectorAll('.cm-sensitive-mask');
    expect(masks.length).toBeGreaterThan(0);
    const masked = Array.from(masks)
      .map((el) => el.textContent ?? '')
      .join('');
    expect(masked).toContain('secret-line-one');
    expect(masked).toContain('secret-line-two');
    expect(masked).not.toContain('visible');
  });

  it('masks values whose key uses a TOML quoted-key form', () => {
    const value = ['"API_KEY" = "supersecret"', 'visible = "ok"'].join('\n');

    const { container } = render(<CodeEditor value={value} onChange={vi.fn()} language="toml" />);
    const masked = Array.from(container.querySelectorAll('.cm-sensitive-mask'))
      .map((el) => el.textContent ?? '')
      .join('');
    expect(masked).toContain('supersecret');
    expect(masked).not.toContain('ok');
  });

  it('does not terminate TOML array masking on a `]` inside a triple-quoted string', () => {
    const value = ['AUTH_TOKEN = [', '  """abc]xyz""",', '  "second",', ']', 'visible = "ok"'].join(
      '\n'
    );

    const { container } = render(<CodeEditor value={value} onChange={vi.fn()} language="toml" />);
    const masked = Array.from(container.querySelectorAll('.cm-sensitive-mask'))
      .map((el) => el.textContent ?? '')
      .join('');
    expect(masked).toContain('abc]xyz');
    expect(masked).toContain('"second"');
    expect(masked).not.toContain('ok');
  });

  it('ignores JSON pseudo-keys embedded inside escaped value strings', () => {
    const value = '{"description": "use \\"API_KEY\\": header", "API_KEY": "real-secret"}';

    const { container } = render(<CodeEditor value={value} onChange={vi.fn()} language="json" />);
    const masked = Array.from(container.querySelectorAll('.cm-sensitive-mask'))
      .map((el) => el.textContent ?? '')
      .join('');
    // Only the real API_KEY value gets masked, not the embedded `API_KEY` text
    // inside the `description` value.
    expect(masked).toContain('real-secret');
    expect(masked).not.toContain('use ');
    expect(masked).not.toContain('header');
  });

  it('does not terminate TOML array masking on a `]` inside a comment', () => {
    const value = [
      'AUTH_TOKEN = [',
      '  "first", # closing bracket in comment: ]',
      '  "second",',
      ']',
      'visible = "ok"',
    ].join('\n');

    const { container } = render(<CodeEditor value={value} onChange={vi.fn()} language="toml" />);
    const masked = Array.from(container.querySelectorAll('.cm-sensitive-mask'))
      .map((el) => el.textContent ?? '')
      .join('');
    expect(masked).toContain('"first"');
    expect(masked).toContain('"second"');
    expect(masked).not.toContain('ok');
  });

  it('respects escaped quotes inside TOML array values when masking', () => {
    const value = ['AUTH_TOKEN = ["a \\"quoted\\" value", "x"]', 'visible = "ok"'].join('\n');

    const { container } = render(<CodeEditor value={value} onChange={vi.fn()} language="toml" />);
    const masked = Array.from(container.querySelectorAll('.cm-sensitive-mask'))
      .map((el) => el.textContent ?? '')
      .join('');
    // The closing bracket must be reached; both array members and the
    // unrelated `visible` line stay on their respective sides of the mask.
    expect(masked).toContain('"x"');
    expect(masked).not.toContain('ok');
  });

  it('masks an entire multi-line TOML array value bound to a sensitive key', () => {
    const value = ['AUTH_TOKEN = [', '  "first",', '  "second",', ']', 'visible = "ok"'].join('\n');

    const { container } = render(<CodeEditor value={value} onChange={vi.fn()} language="toml" />);

    const masked = Array.from(container.querySelectorAll('.cm-sensitive-mask'))
      .map((el) => el.textContent ?? '')
      .join('');
    expect(masked).toContain('"first"');
    expect(masked).toContain('"second"');
    expect(masked).not.toContain('ok');
  });
});
