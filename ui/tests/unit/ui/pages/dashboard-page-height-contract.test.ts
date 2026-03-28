import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDir, '../../../../');

const layoutManagedRouteFiles = [
  'src/pages/index.tsx',
  'src/pages/analytics/index.tsx',
  'src/pages/updates.tsx',
  'src/pages/api.tsx',
  'src/pages/cliproxy.tsx',
  'src/pages/cliproxy-ai-providers.tsx',
  'src/pages/cliproxy-control-panel.tsx',
  'src/pages/copilot.tsx',
  'src/pages/cursor.tsx',
  'src/pages/claude-extension.tsx',
  'src/pages/codex.tsx',
  'src/pages/droid.tsx',
  'src/pages/accounts.tsx',
  'src/pages/settings/index.tsx',
  'src/pages/health.tsx',
  'src/pages/shared.tsx',
] as const;

const forbiddenViewportHeightPattern = /\b(?:h-screen|min-h-screen)\b|calc\(100(?:d|l|s)?vh/i;

function readSource(relativePath: string): string {
  return readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

describe('dashboard route height contract', () => {
  it.each(layoutManagedRouteFiles)(
    '%s relies on the shared layout for viewport height',
    (relativePath) => {
      const source = readSource(relativePath);

      expect(source).not.toMatch(forbiddenViewportHeightPattern);
    }
  );

  it('keeps the Codex dashboard registered in router and sidebar navigation', () => {
    const appSource = readSource('src/App.tsx');
    const sidebarSource = readSource('src/components/layout/app-sidebar.tsx');

    expect(appSource).toContain('path="/codex"');
    expect(appSource).toContain('<CodexPage />');
    expect(sidebarSource).toContain("path: '/codex'");
    expect(sidebarSource).toContain("label: 'Codex CLI'");
  });
});
