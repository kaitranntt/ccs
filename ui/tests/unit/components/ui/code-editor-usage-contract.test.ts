import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const boundedConsumers = [
  {
    file: 'src/pages/cliproxy-ai-providers.tsx',
    expectedCount: 2,
  },
  {
    file: 'src/components/cliproxy/provider-editor/raw-editor-section.tsx',
    expectedCount: 1,
  },
  {
    file: 'src/components/profiles/editor/raw-editor-section.tsx',
    expectedCount: 1,
  },
  {
    file: 'src/components/copilot/config-form/raw-editor-section.tsx',
    expectedCount: 1,
  },
  {
    file: 'src/components/compatible-cli/raw-json-settings-editor-panel.tsx',
    expectedCount: 1,
  },
  {
    file: 'src/components/shared/settings-dialog.tsx',
    expectedCount: 1,
  },
] as const;

const boundedLayoutContracts = [
  {
    file: 'src/components/profiles/editor/index.tsx',
    snippets: [
      'min-h-0 flex-1 grid grid-cols-[40%_60%] divide-x overflow-hidden',
      'flex min-h-0 min-w-0 flex-col overflow-hidden',
    ],
  },
  {
    file: 'src/components/cliproxy/provider-editor/index.tsx',
    snippets: [
      'min-h-0 flex-1 grid grid-cols-[40%_60%] divide-x overflow-hidden',
      'flex min-h-0 min-w-0 flex-col overflow-hidden',
    ],
  },
  {
    // api.tsx was migrated to design system; bounded layout is now in the sub-component
    file: 'src/components/profiles/api-profile-view-pane.tsx',
    snippets: ['flex h-full min-h-0 flex-col overflow-hidden'],
  },
] as const;

describe('bounded CodeEditor consumers', () => {
  it.each(boundedConsumers)(
    '$file opts into fill-parent mode for every bounded editor',
    ({ file, expectedCount }) => {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      const matches = source.match(/heightMode="fill-parent"/g) ?? [];

      expect(matches).toHaveLength(expectedCount);
    }
  );

  it.each(boundedLayoutContracts)(
    '$file keeps bounded editor ancestors shrinkable',
    ({ file, snippets }) => {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');

      for (const snippet of snippets) {
        expect(source).toContain(snippet);
      }
    }
  );
});
