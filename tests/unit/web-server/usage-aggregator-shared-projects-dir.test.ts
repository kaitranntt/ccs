import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let tempRoot = '';
let ccsDir = '';
let claudeDir = '';
let aggregator: typeof import('../../../src/web-server/usage/aggregator');
let originalCcsDir: string | undefined;
let originalClaudeConfigDir: string | undefined;
let originalCcsHome: string | undefined;

function writeUnifiedConfigFixture(): void {
  const yaml = `version: 2
accounts: {}
profiles: {}
preferences:
  theme: system
  telemetry: false
  auto_update: true
cliproxy:
  oauth_accounts: {}
  providers: []
  variants: {}
cliproxy_server:
  local:
    port: 65534
`;

  fs.mkdirSync(ccsDir, { recursive: true });
  fs.writeFileSync(path.join(ccsDir, 'config.yaml'), yaml, 'utf-8');
}

/** One shared transcript store, symlinked into several instances. */
function writeSharedContextGroupFixture(instanceNames: string[]): void {
  const sharedProjectsDir = path.join(ccsDir, 'shared', 'context-groups', 'default', 'projects');
  const sharedProjectDir = path.join(sharedProjectsDir, 'project-one');
  fs.mkdirSync(sharedProjectDir, { recursive: true });

  const line = JSON.stringify({
    type: 'assistant',
    sessionId: 'session-shared',
    timestamp: '2026-03-02T10:00:00.000Z',
    cwd: '/tmp/project',
    message: {
      model: 'claude-sonnet-4-5',
      usage: {
        input_tokens: 100,
        output_tokens: 40,
      },
    },
  });
  fs.writeFileSync(path.join(sharedProjectDir, 'usage.jsonl'), `${line}\n`, 'utf-8');

  for (const name of instanceNames) {
    const instancePath = path.join(ccsDir, 'instances', name);
    fs.mkdirSync(instancePath, { recursive: true });
    fs.symlinkSync(sharedProjectsDir, path.join(instancePath, 'projects'), 'dir');
  }
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-usage-shared-'));
  ccsDir = path.join(tempRoot, '.ccs');
  claudeDir = path.join(tempRoot, '.claude');

  originalCcsDir = process.env.CCS_DIR;
  originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
  originalCcsHome = process.env.CCS_HOME;
  process.env.CCS_DIR = ccsDir;
  process.env.CCS_HOME = tempRoot;
  process.env.CLAUDE_CONFIG_DIR = claudeDir;

  fs.mkdirSync(path.join(claudeDir, 'projects'), { recursive: true });
  writeUnifiedConfigFixture();
});

afterEach(() => {
  aggregator?.shutdownUsageAggregator();
  aggregator?.clearUsageCache();

  if (originalCcsDir !== undefined) {
    process.env.CCS_DIR = originalCcsDir;
  } else {
    delete process.env.CCS_DIR;
  }

  if (originalClaudeConfigDir !== undefined) {
    process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
  } else {
    delete process.env.CLAUDE_CONFIG_DIR;
  }

  if (originalCcsHome !== undefined) {
    process.env.CCS_HOME = originalCcsHome;
  } else {
    delete process.env.CCS_HOME;
  }

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('usage aggregator with a shared projects directory', () => {
  it('counts a transcript store shared by several instances once', async () => {
    writeSharedContextGroupFixture(['profile-c', 'profile-a', 'profile-b']);

    aggregator = await import('../../../src/web-server/usage/aggregator');
    aggregator.clearUsageCache();

    const daily = await aggregator.getCachedDailyData();

    expect(daily).toHaveLength(1);
    expect(daily[0].date).toBe('2026-03-02');
    expect(daily[0].inputTokens).toBe(100);
    expect(daily[0].outputTokens).toBe(40);
    // The shared store reports under the first instance by name, not whichever
    // one readdir happened to return first.
    expect(daily[0].profile).toBe('profile-a');
  });

  it('ignores an instance whose projects symlink is dangling', async () => {
    writeSharedContextGroupFixture(['profile-a']);

    const brokenInstancePath = path.join(ccsDir, 'instances', 'profile-b');
    fs.mkdirSync(brokenInstancePath, { recursive: true });
    fs.symlinkSync(
      path.join(tempRoot, 'does-not-exist'),
      path.join(brokenInstancePath, 'projects'),
      'dir'
    );

    aggregator = await import('../../../src/web-server/usage/aggregator');
    aggregator.clearUsageCache();

    const daily = await aggregator.getCachedDailyData();

    expect(daily).toHaveLength(1);
    expect(daily[0].inputTokens).toBe(100);
    expect(daily[0].profile).toBe('profile-a');
  });

  it('skips an instance whose projects directory is the default config dir', async () => {
    const claudeProjectDir = path.join(claudeDir, 'projects', 'project-one');
    fs.mkdirSync(claudeProjectDir, { recursive: true });

    const line = JSON.stringify({
      type: 'assistant',
      sessionId: 'session-default',
      timestamp: '2026-03-03T10:00:00.000Z',
      cwd: '/tmp/project',
      message: {
        model: 'claude-sonnet-4-5',
        usage: {
          input_tokens: 10,
          output_tokens: 4,
        },
      },
    });
    fs.writeFileSync(path.join(claudeProjectDir, 'usage.jsonl'), `${line}\n`, 'utf-8');

    const instancePath = path.join(ccsDir, 'instances', 'profile-a');
    fs.mkdirSync(instancePath, { recursive: true });
    fs.symlinkSync(path.join(claudeDir, 'projects'), path.join(instancePath, 'projects'), 'dir');

    aggregator = await import('../../../src/web-server/usage/aggregator');
    aggregator.clearUsageCache();

    const daily = await aggregator.getCachedDailyData();

    expect(daily).toHaveLength(1);
    expect(daily[0].date).toBe('2026-03-03');
    expect(daily[0].inputTokens).toBe(10);
    expect(daily[0].outputTokens).toBe(4);
  });
});
