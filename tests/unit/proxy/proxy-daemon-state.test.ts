import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  getOpenAICompatProxyDir,
  getLegacyOpenAICompatProxySessionPath,
  getOpenAICompatProxyPidPath,
  getOpenAICompatProxySessionPath,
} from '../../../src/proxy/proxy-daemon-paths';
import {
  listOpenAICompatProxyProfileNames,
  removeOpenAICompatProxyAuthTokenFile,
  writeOpenAICompatProxyAuthTokenFile,
} from '../../../src/proxy/proxy-daemon-state';

let originalCcsHome: string | undefined;
let tempDir: string;

beforeEach(() => {
  originalCcsHome = process.env.CCS_HOME;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-proxy-state-'));
  process.env.CCS_HOME = tempDir;
});

afterEach(() => {
  if (originalCcsHome !== undefined) {
    process.env.CCS_HOME = originalCcsHome;
  } else {
    delete process.env.CCS_HOME;
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('listOpenAICompatProxyProfileNames', () => {
  it('ignores the legacy singleton session file', () => {
    fs.mkdirSync(path.dirname(getLegacyOpenAICompatProxySessionPath()), { recursive: true });
    fs.writeFileSync(getLegacyOpenAICompatProxySessionPath(), '{}\n', 'utf8');
    fs.writeFileSync(getOpenAICompatProxySessionPath('ccg'), '{}\n', 'utf8');

    expect(listOpenAICompatProxyProfileNames()).toEqual(['ccg']);
  });

  it('skips malformed percent-encoded profile keys', () => {
    fs.mkdirSync(path.dirname(getLegacyOpenAICompatProxySessionPath()), { recursive: true });
    fs.writeFileSync(path.join(path.dirname(getLegacyOpenAICompatProxySessionPath()), '%E0%A4%.session.json'), '{}\n', 'utf8');
    fs.writeFileSync(getOpenAICompatProxySessionPath('ccg'), '{}\n', 'utf8');

    expect(listOpenAICompatProxyProfileNames()).toEqual(['ccg']);
  });

  it('includes pid-only profile state in the discovered profile list', () => {
    fs.mkdirSync(path.dirname(getLegacyOpenAICompatProxySessionPath()), { recursive: true });
    fs.writeFileSync(getOpenAICompatProxyPidPath('ccg'), '123\n', 'utf8');

    expect(listOpenAICompatProxyProfileNames()).toEqual(['ccg']);
  });
});

describe('writeOpenAICompatProxyAuthTokenFile', () => {
  it('writes a private token file under the CCS proxy dir and removes it', () => {
    const authToken = 'proxy-token-regression-secret';
    const tokenPath = writeOpenAICompatProxyAuthTokenFile('ccg', authToken);
    const proxyDir = getOpenAICompatProxyDir();

    expect(path.dirname(tokenPath)).toBe(proxyDir);
    expect(tokenPath.startsWith(`${proxyDir}${path.sep}`)).toBe(true);
    expect(fs.readFileSync(tokenPath, 'utf8')).toBe(authToken);

    if (process.platform !== 'win32') {
      expect(fs.statSync(proxyDir).mode & 0o777).toBe(0o700);
      expect(fs.statSync(tokenPath).mode & 0o777).toBe(0o600);
    }

    removeOpenAICompatProxyAuthTokenFile(tokenPath);

    expect(fs.existsSync(tokenPath)).toBe(false);
  });
});
