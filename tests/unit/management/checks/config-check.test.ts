import { afterEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { ClaudeSettingsChecker } from '../../../../src/management/checks/config-check';
import { HealthCheck } from '../../../../src/management/checks/types';
import { runWithScopedCcsHome } from '../../../../src/utils/config-manager';

let originalClaudeConfigDir: string | undefined;

afterEach(() => {
  if (originalClaudeConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR;
  } else {
    process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
  }
});

describe('ClaudeSettingsChecker', () => {
  it('warns when Claude settings point at the Codex CLIProxy translator', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-config-check-'));
    originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
    delete process.env.CLAUDE_CONFIG_DIR;

    try {
      await runWithScopedCcsHome(tempRoot, async () => {
        const settingsPath = path.join(tempRoot, '.claude', 'settings.json');
        fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
        fs.writeFileSync(
          settingsPath,
          JSON.stringify(
            {
              env: {
                ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/codex',
              },
            },
            null,
            2
          ) + '\n'
        );

        const originalConsoleLog = console.log;
        console.log = () => {};
        try {
          const results = new HealthCheck();
          new ClaudeSettingsChecker().run(results);

          expect(results.warnings).toHaveLength(1);
          expect(results.warnings[0].message).toContain('Codex CLIProxy translator');
          expect(results.warnings[0].fix).toContain('ccs persist default --yes');
        } finally {
          console.log = originalConsoleLog;
        }
      });
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
