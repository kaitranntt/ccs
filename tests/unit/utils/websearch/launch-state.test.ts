import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { appendThirdPartyWebSearchToolArgs } from '../../../../src/utils/websearch/claude-tool-args';
import { resolveWebSearchLaunchState } from '../../../../src/utils/websearch/launch-state';
import { ensureWebSearchMcpForLaunch } from '../../../../src/utils/websearch/mcp-installer';

describe('WebSearch launch state', () => {
  let originalCcsHome: string | undefined;
  let tempHome = '';
  let configPath = '';

  beforeEach(() => {
    originalCcsHome = process.env.CCS_HOME;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-websearch-launch-state-'));
    const ccsDir = path.join(tempHome, '.ccs');
    configPath = path.join(ccsDir, 'config.yaml');
    fs.mkdirSync(ccsDir, { recursive: true });
    process.env.CCS_HOME = tempHome;
  });

  afterEach(() => {
    if (originalCcsHome === undefined) {
      delete process.env.CCS_HOME;
    } else {
      process.env.CCS_HOME = originalCcsHome;
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('keeps provisioning, hook env, and steering on one snapshot when config changes', () => {
    fs.writeFileSync(configPath, 'version: 12\nwebsearch:\n  enabled: false\n', 'utf8');
    const launch = resolveWebSearchLaunchState();

    ensureWebSearchMcpForLaunch(launch.config);
    fs.writeFileSync(configPath, 'version: 12\nwebsearch:\n  enabled: true\n', 'utf8');

    const args = appendThirdPartyWebSearchToolArgs(['smoke'], launch.enabled);
    expect(launch.enabled).toBe(false);
    expect(launch.hookEnv.CCS_WEBSEARCH_ENABLED).toBe('0');
    expect(launch.hookEnv.CCS_WEBSEARCH_SKIP).toBe('1');
    expect(args).toContain('--disallowedTools');
    expect(args).toContain('WebSearch');
    expect(args).not.toContain('--append-system-prompt');
  });

  it('keeps native WebSearch only for profiles listed in native_profiles', () => {
    fs.writeFileSync(
      configPath,
      [
        'version: 12',
        'websearch:',
        '  enabled: true',
        '  native_profiles:',
        '    - " gateway "',
        '    - gateway',
        '    - ""',
        '',
      ].join('\n'),
      'utf8'
    );

    const native = resolveWebSearchLaunchState('gateway');
    expect(native.config.native_profiles).toEqual(['gateway']);
    expect(native.native).toBe(true);
    expect(native.enabled).toBe(false);
    expect(native.hookEnv.CCS_WEBSEARCH_SKIP).toBe('1');
    expect(appendThirdPartyWebSearchToolArgs(['smoke'], native.enabled, native.native)).toEqual([
      'smoke',
    ]);

    const managed = resolveWebSearchLaunchState('other');
    expect(managed.native).toBe(false);
    expect(managed.enabled).toBe(true);
    expect(
      appendThirdPartyWebSearchToolArgs(['smoke'], managed.enabled, managed.native)
    ).toContain('--disallowedTools');
  });
});
