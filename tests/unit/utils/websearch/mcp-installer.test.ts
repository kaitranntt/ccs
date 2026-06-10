import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as lockfile from 'proper-lockfile';
import { getHookPath } from '../../../../src/utils/websearch/hook-config';
import {
  ensureWebSearchMcp,
  getWebSearchMcpServerName,
  getWebSearchMcpServerPath,
  uninstallWebSearchMcp,
} from '../../../../src/utils/websearch/mcp-installer';

describe('ensureWebSearchMcp', () => {
  let tempHome: string | undefined;
  let originalCcsHome: string | undefined;

  function setupTempHome(): string {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-websearch-mcp-'));
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;
    return tempHome;
  }

  function getCcsDir(): string {
    if (!tempHome) {
      throw new Error('tempHome not initialized');
    }
    return path.join(tempHome, '.ccs');
  }

  function writeEnabledConfig(): void {
    const ccsDir = getCcsDir();
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      [
        'version: 12',
        'websearch:',
        '  enabled: true',
        '  providers:',
        '    duckduckgo:',
        '      enabled: true',
        '',
      ].join('\n'),
      'utf8'
    );
  }

  function getManagedConfig() {
    return {
      type: 'stdio',
      command: 'node',
      args: [getWebSearchMcpServerPath()],
      env: {},
    };
  }

  afterEach(() => {
    mock.restore();

    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }

    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }

    tempHome = undefined;
    originalCcsHome = undefined;
  });

  it('installs the MCP server and preserves existing user mcpServers entries', () => {
    setupTempHome();
    writeEnabledConfig();

    const claudeUserConfigPath = path.join(tempHome as string, '.claude.json');
    fs.writeFileSync(
      claudeUserConfigPath,
      JSON.stringify(
        {
          mcpServers: {
            existing: { command: 'uvx', args: ['some-server'] },
          },
        },
        null,
        2
      ) + '\n',
      'utf8'
    );

    expect(ensureWebSearchMcp()).toBe(true);
    expect(fs.existsSync(getHookPath())).toBe(true);
    expect(fs.existsSync(getWebSearchMcpServerPath())).toBe(true);

    const config = JSON.parse(fs.readFileSync(claudeUserConfigPath, 'utf8')) as {
      mcpServers: Record<string, unknown>;
    };

    expect(config.mcpServers.existing).toEqual({ command: 'uvx', args: ['some-server'] });
    expect(config.mcpServers[getWebSearchMcpServerName()]).toEqual(getManagedConfig());
  });

  it('serializes ~/.claude.json updates with a file lock', () => {
    setupTempHome();
    writeEnabledConfig();
    const claudeUserConfigPath = path.join(tempHome as string, '.claude.json');
    fs.writeFileSync(claudeUserConfigPath, '{}\n', 'utf8');

    const lockSpy = spyOn(lockfile, 'lockSync');

    expect(ensureWebSearchMcp()).toBe(true);
    expect(lockSpy).toHaveBeenCalled();
    expect(lockSpy.mock.calls[0]?.[0]).toBe(path.join(tempHome as string, '.claude.json.ccs-lock'));
  });

  it('preserves the existing ~/.claude.json permissions when provisioning WebSearch MCP', () => {
    setupTempHome();
    writeEnabledConfig();

    const claudeUserConfigPath = path.join(tempHome as string, '.claude.json');
    fs.writeFileSync(claudeUserConfigPath, JSON.stringify({ existing: true }, null, 2) + '\n', {
      encoding: 'utf8',
      mode: 0o600,
    });
    fs.chmodSync(claudeUserConfigPath, 0o600);

    expect(ensureWebSearchMcp()).toBe(true);
    expect(fs.statSync(claudeUserConfigPath).mode & 0o777).toBe(0o600);
  });

  it('writes new ~/.claude.json with 0600 permissions', () => {
    setupTempHome();
    writeEnabledConfig();

    const claudeUserConfigPath = path.join(tempHome as string, '.claude.json');

    expect(ensureWebSearchMcp()).toBe(true);
    expect(fs.statSync(claudeUserConfigPath).mode & 0o777).toBe(0o600);
  });

  it('returns false and preserves malformed ~/.claude.json', () => {
    setupTempHome();
    writeEnabledConfig();

    const claudeUserConfigPath = path.join(tempHome as string, '.claude.json');
    fs.writeFileSync(claudeUserConfigPath, '{ invalid json', 'utf8');

    expect(ensureWebSearchMcp()).toBe(false);
    expect(fs.readFileSync(claudeUserConfigPath, 'utf8')).toBe('{ invalid json');
  });

  it('removes the managed MCP runtime while preserving unrelated server entries', () => {
    setupTempHome();
    writeEnabledConfig();

    const claudeUserConfigPath = path.join(tempHome as string, '.claude.json');
    fs.writeFileSync(
      claudeUserConfigPath,
      JSON.stringify(
        {
          mcpServers: {
            existing: { command: 'uvx', args: ['some-server'] },
          },
        },
        null,
        2
      ) + '\n',
      'utf8'
    );

    expect(ensureWebSearchMcp()).toBe(true);

    const instancePath = path.join(tempHome as string, '.ccs', 'instances', 'work');
    fs.mkdirSync(instancePath, { recursive: true });
    fs.writeFileSync(
      path.join(instancePath, '.claude.json'),
      JSON.stringify(
        {
          mcpServers: {
            existing: { command: 'uvx', args: ['instance-server'] },
            [getWebSearchMcpServerName()]: { command: 'node', args: ['/tmp/override.cjs'] },
          },
          otherKey: 'keep-me',
        },
        null,
        2
      ) + '\n',
      'utf8'
    );

    const lockSpy = spyOn(lockfile, 'lockSync');

    expect(uninstallWebSearchMcp()).toBe(true);
    expect(lockSpy).toHaveBeenCalled();
    expect(lockSpy.mock.calls[0]?.[0]).toBe(path.join(tempHome as string, '.claude.json.ccs-lock'));
    expect(fs.existsSync(getWebSearchMcpServerPath())).toBe(false);

    const globalConfig = JSON.parse(fs.readFileSync(claudeUserConfigPath, 'utf8')) as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    expect(globalConfig.mcpServers).toEqual({
      existing: { command: 'uvx', args: ['some-server'] },
    });

    const instanceConfig = JSON.parse(
      fs.readFileSync(path.join(instancePath, '.claude.json'), 'utf8')
    ) as {
      otherKey: string;
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    expect(instanceConfig.otherKey).toBe('keep-me');
    expect(instanceConfig.mcpServers).toEqual({
      existing: { command: 'uvx', args: ['instance-server'] },
    });
  });

  it('falls back to copy-overwrite when rename is blocked during MCP server install', () => {
    setupTempHome();
    writeEnabledConfig();

    const realRenameSync = fs.renameSync;
    const renameSpy = spyOn(fs, 'renameSync').mockImplementation((oldPath, newPath) => {
      if (String(newPath) === getWebSearchMcpServerPath()) {
        const error = new Error('busy') as NodeJS.ErrnoException;
        error.code = 'EPERM';
        throw error;
      }
      return realRenameSync(oldPath, newPath);
    });

    expect(ensureWebSearchMcp()).toBe(true);
    expect(renameSpy).toHaveBeenCalled();
    expect(fs.existsSync(getWebSearchMcpServerPath())).toBe(true);
  });
});
