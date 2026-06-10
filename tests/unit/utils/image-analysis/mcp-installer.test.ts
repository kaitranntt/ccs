import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as lockfile from 'proper-lockfile';
import {
  ensureImageAnalysisMcp,
  getImageAnalysisMcpRuntimePath,
  getImageAnalysisMcpServerName,
  getImageAnalysisMcpServerPath,
  hasImageAnalysisMcpReady,
  uninstallImageAnalysisMcp,
} from '../../../../src/utils/image-analysis';

describe('ensureImageAnalysisMcp', () => {
  let tempHome: string | undefined;
  let originalCcsHome: string | undefined;

  function setupTempHome(): string {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-image-analysis-mcp-'));
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
        'image_analysis:',
        '  enabled: true',
        '  timeout: 60',
        '  fallback_backend: agy',
        '  provider_models:',
        '    agy: gemini-3-1-flash-preview',
        '',
      ].join('\n'),
      'utf8'
    );
  }

  function getManagedConfig() {
    return {
      type: 'stdio',
      command: 'node',
      args: [getImageAnalysisMcpServerPath()],
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

    expect(ensureImageAnalysisMcp()).toBe(true);
    expect(fs.existsSync(getImageAnalysisMcpServerPath())).toBe(true);
    expect(fs.existsSync(getImageAnalysisMcpRuntimePath())).toBe(true);

    const config = JSON.parse(fs.readFileSync(claudeUserConfigPath, 'utf8')) as {
      mcpServers: Record<string, unknown>;
    };

    expect(config.mcpServers.existing).toEqual({ command: 'uvx', args: ['some-server'] });
    expect(config.mcpServers[getImageAnalysisMcpServerName()]).toEqual(getManagedConfig());
    expect(hasImageAnalysisMcpReady(claudeUserConfigPath)).toBe(true);
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

    expect(ensureImageAnalysisMcp()).toBe(true);

    const instancePath = path.join(tempHome as string, '.ccs', 'instances', 'work');
    fs.mkdirSync(instancePath, { recursive: true });
    fs.writeFileSync(
      path.join(instancePath, '.claude.json'),
      JSON.stringify(
        {
          mcpServers: {
            existing: { command: 'uvx', args: ['instance-server'] },
            [getImageAnalysisMcpServerName()]: { command: 'node', args: ['/tmp/override.cjs'] },
          },
          otherKey: 'keep-me',
        },
        null,
        2
      ) + '\n',
      'utf8'
    );

    expect(uninstallImageAnalysisMcp()).toBe(true);
    expect(fs.existsSync(getImageAnalysisMcpServerPath())).toBe(false);
    expect(fs.existsSync(getImageAnalysisMcpRuntimePath())).toBe(false);

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

  it('installs the first-class MCP runtime even when the legacy hooks path is unusable', () => {
    setupTempHome();
    writeEnabledConfig();

    const hooksPath = path.join(getCcsDir(), 'hooks');
    fs.writeFileSync(hooksPath, 'not-a-directory', 'utf8');

    expect(ensureImageAnalysisMcp()).toBe(true);
    expect(fs.existsSync(getImageAnalysisMcpServerPath())).toBe(true);
    expect(fs.existsSync(getImageAnalysisMcpRuntimePath())).toBe(true);
  });

  it('serializes ~/.claude.json updates with a file lock', () => {
    setupTempHome();
    writeEnabledConfig();
    const claudeUserConfigPath = path.join(tempHome as string, '.claude.json');
    fs.writeFileSync(claudeUserConfigPath, '{}\n', 'utf8');

    const lockSpy = spyOn(lockfile, 'lockSync');

    expect(ensureImageAnalysisMcp()).toBe(true);
    expect(lockSpy).toHaveBeenCalled();
    expect(lockSpy.mock.calls[0]?.[0]).toBe(path.join(tempHome as string, '.claude.json.ccs-lock'));
  });

  it('retries ~/.claude.json lock acquisition before provisioning', () => {
    setupTempHome();
    writeEnabledConfig();
    const claudeUserConfigPath = path.join(tempHome as string, '.claude.json');
    fs.writeFileSync(claudeUserConfigPath, '{}\n', 'utf8');

    let calls = 0;
    spyOn(lockfile, 'lockSync').mockImplementation(() => {
      calls++;
      if (calls === 1) {
        const error = new Error('Lock file is already being held') as NodeJS.ErrnoException;
        error.code = 'ELOCKED';
        throw error;
      }
      return (() => undefined) as ReturnType<typeof lockfile.lockSync>;
    });

    expect(ensureImageAnalysisMcp()).toBe(true);
    expect(calls).toBe(2);

    const config = JSON.parse(fs.readFileSync(claudeUserConfigPath, 'utf8')) as {
      mcpServers: Record<string, unknown>;
    };
    expect(config.mcpServers[getImageAnalysisMcpServerName()]).toEqual(getManagedConfig());
  });

  it('returns false instead of throwing when ~/.claude.json stays locked', () => {
    setupTempHome();
    writeEnabledConfig();

    const claudeUserConfigPath = path.join(tempHome as string, '.claude.json');
    fs.writeFileSync(claudeUserConfigPath, '{}\n', 'utf8');

    let now = 0;
    spyOn(Date, 'now').mockImplementation(() => {
      now += 10001;
      return now;
    });
    spyOn(lockfile, 'lockSync').mockImplementation(() => {
      const error = new Error('Lock file is already being held') as NodeJS.ErrnoException;
      error.code = 'ELOCKED';
      throw error;
    });

    let result: boolean | undefined;
    expect(() => {
      result = ensureImageAnalysisMcp();
    }).not.toThrow();
    expect(result).toBe(false);
  });
});
