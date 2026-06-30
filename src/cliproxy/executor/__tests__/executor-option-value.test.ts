import { afterEach, beforeEach, describe, expect, it, jest } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as http from 'http';
import { execClaudeWithCLIProxy, hasGitLabTokenLoginFlag, readOptionValue } from '../index';

describe('readOptionValue', () => {
  it('parses split-token option values', () => {
    expect(
      readOptionValue(
        ['--kiro-idc-start-url', 'https://d-123.awsapps.com/start'],
        '--kiro-idc-start-url'
      )
    ).toEqual({
      present: true,
      value: 'https://d-123.awsapps.com/start',
      missingValue: false,
    });
  });

  it('parses equals-form option values', () => {
    expect(readOptionValue(['--kiro-idc-flow=device'], '--kiro-idc-flow')).toEqual({
      present: true,
      value: 'device',
      missingValue: false,
    });
  });

  it('marks empty or missing values as invalid', () => {
    expect(readOptionValue(['--kiro-idc-region'], '--kiro-idc-region')).toEqual({
      present: true,
      value: undefined,
      missingValue: true,
    });
    expect(readOptionValue(['--kiro-idc-flow='], '--kiro-idc-flow')).toEqual({
      present: true,
      value: undefined,
      missingValue: true,
    });
  });

  it('treats both GitLab token-login flags as enabled', () => {
    expect(hasGitLabTokenLoginFlag(['--gitlab-token-login'])).toBe(true);
    expect(hasGitLabTokenLoginFlag(['--token-login'])).toBe(true);
    expect(hasGitLabTokenLoginFlag(['--gitlab-url', 'https://gitlab.example.com'])).toBe(false);
  });
});

describe('execClaudeWithCLIProxy browser flag validation', () => {
  let tmpHome = '';
  let fakeClaudePath = '';
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-cliproxy-executor-'));
    fakeClaudePath = path.join(tmpHome, 'fake-claude.sh');
    fs.writeFileSync(fakeClaudePath, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    fs.chmodSync(fakeClaudePath, 0o755);
    originalCcsHome = process.env.CCS_HOME;
    process.exitCode = 0;
    process.env.CCS_HOME = tmpHome;
  });

  async function waitForFile(filePath: string): Promise<boolean> {
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      if (fs.existsSync(filePath)) return true;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return fs.existsSync(filePath);
  }

  function makeWebSearchProvisioningFail(): void {
    const ccsDir = path.join(tmpHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      'version: 13\nwebsearch:\n  enabled: true\n  providers:\n    duckduckgo:\n      enabled: true\n',
      'utf8'
    );
    fs.writeFileSync(path.join(ccsDir, 'hooks'), 'not-a-directory', 'utf8');
  }

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
    process.exitCode = 0;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('keeps WebSearch provisioning strict for --config settings writes', async () => {
    makeWebSearchProvisioningFail();

    let requestCount = 0;
    const server = http.createServer((_req, res) => {
      requestCount += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      server.close();
      throw new Error('Test server did not bind to a TCP port');
    }

    try {
      await expect(
        execClaudeWithCLIProxy(
          fakeClaudePath,
          'gemini',
          [
            '--proxy-host',
            '127.0.0.1',
            '--proxy-port',
            String(address.port),
            '--proxy-auth-token',
            'SECRET_TOKEN_FOR_VALIDATION',
            '--remote-only',
            '--config',
          ],
          {}
        )
      ).rejects.toThrow(
        'WebSearch is enabled, but CCS could not prepare the local WebSearch tool.'
      );

      expect(requestCount).toBeGreaterThan(0);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('degrades WebSearch provisioning failures for CLIProxy launches', async () => {
    makeWebSearchProvisioningFail();

    const markerPath = path.join(tmpHome, 'fake-claude-launched');
    fs.writeFileSync(
      fakeClaudePath,
      `#!/bin/sh\nprintf launched > ${JSON.stringify(markerPath)}\nexit 0\n`,
      { mode: 0o755 }
    );
    fs.chmodSync(fakeClaudePath, 0o755);

    let requestCount = 0;
    const server = http.createServer((_req, res) => {
      requestCount += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      server.close();
      throw new Error('Test server did not bind to a TCP port');
    }

    const exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined as never) as typeof process.exit);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await execClaudeWithCLIProxy(
        fakeClaudePath,
        'gemini',
        [
          '--proxy-host',
          '127.0.0.1',
          '--proxy-port',
          String(address.port),
          '--proxy-auth-token',
          'SECRET_TOKEN_FOR_VALIDATION',
          '--remote-only',
          '--print',
          'hello',
        ],
        {}
      );

      expect(await waitForFile(markerPath)).toBe(true);
      expect(requestCount).toBeGreaterThan(0);
      expect(exitSpy).toHaveBeenCalledWith(0);
    } finally {
      exitSpy.mockRestore();
      logSpy.mockRestore();
      errorSpy.mockRestore();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('validates conflicting browser launch flags before remote proxy checks', async () => {
    let requestCount = 0;
    const server = http.createServer((_req, res) => {
      requestCount += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      server.close();
      throw new Error('Test server did not bind to a TCP port');
    }

    const exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined as never) as typeof process.exit);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await execClaudeWithCLIProxy(
        fakeClaudePath,
        'gemini',
        [
          '--proxy-host',
          '127.0.0.1',
          '--proxy-port',
          String(address.port),
          '--proxy-auth-token',
          'SECRET_TOKEN_FOR_VALIDATION',
          '--remote-only',
          '--browser',
          '--no-browser',
        ],
        {}
      );

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errorSpy).toHaveBeenCalledWith(
        '[X] Use either `--browser` or `--no-browser`, not both.'
      );
      expect(requestCount).toBe(0);
    } finally {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('exits cleanly when conflicting browser launch flags are provided', async () => {
    const exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined as never) as typeof process.exit);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await execClaudeWithCLIProxy(fakeClaudePath, 'gemini', ['--browser', '--no-browser'], {});

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errorSpy).toHaveBeenCalledWith(
        '[X] Use either `--browser` or `--no-browser`, not both.'
      );
    } finally {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('does not treat a stale global exitCode as a current parse failure', async () => {
    const markerPath = path.join(tmpHome, 'fake-claude-launched');
    fs.writeFileSync(
      fakeClaudePath,
      `#!/bin/sh\nprintf launched > ${JSON.stringify(markerPath)}\nexit 0\n`,
      { mode: 0o755 }
    );
    fs.chmodSync(fakeClaudePath, 0o755);

    let requestCount = 0;
    const server = http.createServer((_req, res) => {
      requestCount += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      server.close();
      throw new Error('Test server did not bind to a TCP port');
    }

    const exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined as never) as typeof process.exit);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      process.exitCode = 1;

      await execClaudeWithCLIProxy(
        fakeClaudePath,
        'gemini',
        [
          '--proxy-host',
          '127.0.0.1',
          '--proxy-port',
          String(address.port),
          '--proxy-auth-token',
          'SECRET_TOKEN_FOR_VALIDATION',
          '--remote-only',
          '--print',
          'hello',
        ],
        {}
      );

      expect(await waitForFile(markerPath)).toBe(true);
      expect(requestCount).toBeGreaterThan(0);
      expect(exitSpy).toHaveBeenCalledWith(0);
    } finally {
      exitSpy.mockRestore();
      logSpy.mockRestore();
      errorSpy.mockRestore();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
