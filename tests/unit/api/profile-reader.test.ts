import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { listApiProfiles } from '../../../src/api/services/profile-reader';
import { runWithScopedConfigDir, setGlobalConfigDir } from '../../../src/utils/config-manager';

describe('profile reader target sanitization', () => {
  let tempHome = '';
  let originalCcsHome: string | undefined;
  let originalCcsDir: string | undefined;
  let originalUnifiedMode: string | undefined;

  function getScopedCcsDir(): string {
    return path.join(tempHome, '.ccs');
  }

  async function runInScopedCcsDir<T>(fn: () => T): Promise<T> {
    return await runWithScopedConfigDir(getScopedCcsDir(), fn);
  }

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-profile-reader-'));
    originalCcsHome = process.env.CCS_HOME;
    originalCcsDir = process.env.CCS_DIR;
    originalUnifiedMode = process.env.CCS_UNIFIED_CONFIG;
    process.env.CCS_HOME = tempHome;
    delete process.env.CCS_DIR;
    delete process.env.CCS_UNIFIED_CONFIG;
    setGlobalConfigDir(undefined);
  });

  afterEach(() => {
    if (originalCcsHome === undefined) {
      delete process.env.CCS_HOME;
    } else {
      process.env.CCS_HOME = originalCcsHome;
    }

    if (originalCcsDir === undefined) {
      delete process.env.CCS_DIR;
    } else {
      process.env.CCS_DIR = originalCcsDir;
    }

    if (originalUnifiedMode === undefined) {
      delete process.env.CCS_UNIFIED_CONFIG;
    } else {
      process.env.CCS_UNIFIED_CONFIG = originalUnifiedMode;
    }

    setGlobalConfigDir(undefined);

    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('normalizes legacy stored codex targets back to claude for profiles and variants', async () => {
    const ccsDir = getScopedCcsDir();
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(
      path.join(ccsDir, 'config.json'),
      JSON.stringify(
        {
          profiles: { demo: '~/.ccs/demo.settings.json' },
          profile_targets: { demo: 'codex' },
          cliproxy: {
            routed: {
              provider: 'codex',
              settings: '~/.ccs/routed.settings.json',
              target: 'codex',
            },
          },
        },
        null,
        2
      ) + '\n'
    );
    fs.writeFileSync(
      path.join(ccsDir, 'demo.settings.json'),
      JSON.stringify(
        { env: { ANTHROPIC_BASE_URL: 'https://api.example.com', ANTHROPIC_AUTH_TOKEN: 'token' } },
        null,
        2
      ) + '\n'
    );

    const result = await runInScopedCcsDir(() => listApiProfiles());

    expect(result.profiles).toHaveLength(1);
    expect(result.profiles[0]?.target).toBe('claude');
    expect(result.variants).toHaveLength(1);
    expect(result.variants[0]?.target).toBe('claude');
  });

  it('normalizes unified stored codex targets back to claude for profiles and variants', async () => {
    const ccsDir = getScopedCcsDir();
    fs.mkdirSync(ccsDir, { recursive: true });
    process.env.CCS_UNIFIED_CONFIG = '1';
    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      [
        'version: 12',
        'profiles:',
        '  demo:',
        '    type: api',
        '    settings: ~/.ccs/demo.settings.json',
        '    target: codex',
        'cliproxy:',
        '  oauth_accounts: {}',
        '  providers: []',
        '  variants:',
        '    routed:',
        '      provider: codex',
        '      settings: ~/.ccs/routed.settings.json',
        '      target: codex',
        '',
      ].join('\n'),
      'utf8'
    );
    fs.writeFileSync(
      path.join(ccsDir, 'demo.settings.json'),
      JSON.stringify(
        { env: { ANTHROPIC_BASE_URL: 'https://api.example.com', ANTHROPIC_AUTH_TOKEN: 'token' } },
        null,
        2
      ) + '\n'
    );

    const result = await runInScopedCcsDir(() => listApiProfiles());

    expect(result.profiles).toHaveLength(1);
    expect(result.profiles[0]?.target).toBe('claude');
    expect(result.variants).toHaveLength(1);
    expect(result.variants[0]?.target).toBe('claude');
  });
});
