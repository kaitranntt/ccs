import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DelegationValidator } from '../../../src/utils/delegation-validator';

describe('DelegationValidator', () => {
  let tmpDir: string;
  let ccsDir: string;
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-delegation-validator-test-'));
    ccsDir = path.join(tmpDir, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tmpDir;
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) process.env.CCS_HOME = originalCcsHome;
    else delete process.env.CCS_HOME;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rejects nonexistent profile', () => {
    const result = DelegationValidator.validate('nonexistent');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Profile not found');
  });

  it('accepts profile with valid API key', () => {
    const settingsPath = path.join(ccsDir, 'valid-key.settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_AUTH_TOKEN: 'sk-ant-api-test-key-12345',
        },
      })
    );

    const result = DelegationValidator.validate('valid-key');
    expect(result.valid).toBe(true);
    expect(result.apiKey).toBe('sk-ant-a...');
  });

  it('rejects profile with placeholder API key', () => {
    const settingsPath = path.join(ccsDir, 'placeholder.settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_AUTH_TOKEN: 'YOUR_API_KEY_HERE',
        },
      })
    );

    const result = DelegationValidator.validate('placeholder');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Default API key placeholder detected');
  });

  it('accepts keyless profile using claude.ai subscription login (Issue #1780)', () => {
    const settingsPath = path.join(ccsDir, 'claude-direct.settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:8790',
          ANTHROPIC_MODEL: 'claude-sonnet-4-6',
        },
      })
    );

    const result = DelegationValidator.validate('claude-direct');
    expect(result.valid).toBe(true);
    expect(result.apiKey).toBeUndefined();
  });

  function writeKeylessProfile(name: string, baseUrl?: string): void {
    const env: Record<string, string> = { ANTHROPIC_MODEL: 'claude-sonnet-4-6' };
    if (baseUrl !== undefined) env.ANTHROPIC_BASE_URL = baseUrl;
    fs.writeFileSync(path.join(ccsDir, `${name}.settings.json`), JSON.stringify({ env }));
  }

  it('accepts keyless profile without a custom base URL', () => {
    writeKeylessProfile('no-base-url');
    expect(DelegationValidator.validate('no-base-url').valid).toBe(true);

    writeKeylessProfile('blank-base-url', '  ');
    expect(DelegationValidator.validate('blank-base-url').valid).toBe(true);
  });

  it.each(['http://localhost:8790', 'http://[::1]:8790', 'http://127.0.0.2:8790/v1'])(
    'accepts keyless profile with loopback base URL %s',
    (baseUrl) => {
      writeKeylessProfile('loopback', baseUrl);
      expect(DelegationValidator.validate('loopback').valid).toBe(true);
    }
  );

  it.each([
    'https://api.z.ai/api/anthropic',
    'http://192.168.1.10:8790',
    'http://127.0.0.1.attacker.example',
    'not a url',
  ])('rejects keyless profile with non-loopback base URL %s', (baseUrl) => {
    writeKeylessProfile('remote', baseUrl);
    const result = DelegationValidator.validate('remote');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('API key not configured');
    expect(result.suggestion).toContain('claude.ai login');
  });

  it('accepts keyed profile with remote base URL', () => {
    fs.writeFileSync(
      path.join(ccsDir, 'glm.settings.json'),
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'https://api.z.ai/api/anthropic',
          ANTHROPIC_AUTH_TOKEN: 'sk-glm-test-key-12345',
        },
      })
    );
    expect(DelegationValidator.validate('glm').valid).toBe(true);
  });
});
