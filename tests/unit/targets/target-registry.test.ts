/**
 * Unit tests for target registry and adapters
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  registerTarget,
  getTarget,
  getDefaultTarget,
  hasTarget,
  getRegisteredTargets,
  ClaudeAdapter,
  DroidAdapter,
  CodexAdapter,
} from '../../../src/targets';

describe('target-registry', () => {
  beforeEach(() => {
    // Re-register adapters (registry is module-scoped singleton)
    registerTarget(new ClaudeAdapter());
    registerTarget(new DroidAdapter());
    registerTarget(new CodexAdapter());
  });

  it('should register and retrieve claude adapter', () => {
    const adapter = getTarget('claude');
    expect(adapter.type).toBe('claude');
    expect(adapter.displayName).toBe('Claude Code');
  });

  it('should register and retrieve droid adapter', () => {
    const adapter = getTarget('droid');
    expect(adapter.type).toBe('droid');
    expect(adapter.displayName).toBe('Factory Droid');
  });

  it('should return claude as default target', () => {
    const adapter = getDefaultTarget();
    expect(adapter.type).toBe('claude');
  });

  it('should register and retrieve codex adapter', () => {
    const adapter = getTarget('codex');
    expect(adapter.type).toBe('codex');
    expect(adapter.displayName).toBe('Codex CLI');
  });

  it('should throw for unknown target', () => {
    expect(() => getTarget('unknown' as never)).toThrow(/Unknown target "unknown"/);
  });

  it('should check target existence', () => {
    expect(hasTarget('claude')).toBe(true);
    expect(hasTarget('droid')).toBe(true);
    expect(hasTarget('codex')).toBe(true);
    expect(hasTarget('unknown' as never)).toBe(false);
  });

  it('should list registered targets', () => {
    const targets = getRegisteredTargets();
    expect(targets).toContain('claude');
    expect(targets).toContain('droid');
    expect(targets).toContain('codex');
  });
});

describe('ClaudeAdapter', () => {
  const adapter = new ClaudeAdapter();

  it('should have correct type and displayName', () => {
    expect(adapter.type).toBe('claude');
    expect(adapter.displayName).toBe('Claude Code');
  });

  it('should support all profile types', () => {
    expect(adapter.supportsProfileType('account')).toBe(true);
    expect(adapter.supportsProfileType('settings')).toBe(true);
    expect(adapter.supportsProfileType('cliproxy')).toBe(true);
    expect(adapter.supportsProfileType('default')).toBe(true);
    expect(adapter.supportsProfileType('copilot')).toBe(true);
  });

  it('should build env with credentials', () => {
    const env = adapter.buildEnv(
      {
        profile: 'gemini',
        baseUrl: 'https://api.example.com',
        apiKey: 'test-key',
        model: 'claude-opus-4-6',
      },
      'settings'
    );

    expect(env['ANTHROPIC_BASE_URL']).toBe('https://api.example.com');
    expect(env['ANTHROPIC_AUTH_TOKEN']).toBe('test-key');
    expect(env['ANTHROPIC_MODEL']).toBe('claude-opus-4-6');
  });

  it('should pass through args unchanged', () => {
    const args = adapter.buildArgs('gemini', ['-p', 'hello', '--verbose']);
    expect(args).toEqual(['-p', 'hello', '--verbose']);
  });

  it('prepareCredentials should be no-op', async () => {
    // Should not throw
    await adapter.prepareCredentials({
      profile: 'test',
      baseUrl: 'x',
      apiKey: 'y',
    });
  });
});

describe('DroidAdapter', () => {
  const adapter = new DroidAdapter();

  it('should have correct type and displayName', () => {
    expect(adapter.type).toBe('droid');
    expect(adapter.displayName).toBe('Factory Droid');
  });

  it('should NOT support account profile type', () => {
    expect(adapter.supportsProfileType('account')).toBe(false);
  });

  it('should support settings and default profile types', () => {
    expect(adapter.supportsProfileType('settings')).toBe(true);
    expect(adapter.supportsProfileType('default')).toBe(true);
  });

  it('should support cliproxy and NOT support copilot profile type', () => {
    expect(adapter.supportsProfileType('cliproxy')).toBe(true);
    expect(adapter.supportsProfileType('copilot')).toBe(false);
  });

  it('should keep interactive args clean (no model argv injection)', () => {
    const isolatedAdapter = new DroidAdapter();
    const args = isolatedAdapter.buildArgs('gemini', ['--verbose']);
    expect(args).toEqual(['--verbose']);
  });

  it('should not queue model selector as prompt when no user args', () => {
    const isolatedAdapter = new DroidAdapter();
    const args = isolatedAdapter.buildArgs('codex', []);
    expect(args).toEqual([]);
  });

  it('should build minimal env (no ANTHROPIC_ vars)', () => {
    const env = adapter.buildEnv(
      {
        baseUrl: 'http://localhost:8317',
        apiKey: 'dummy',
      },
      'cliproxy'
    );

    // Droid uses config file, not env vars
    expect(env['ANTHROPIC_BASE_URL']).toBeUndefined();
    expect(env['ANTHROPIC_AUTH_TOKEN']).toBeUndefined();
  });

  it('prepareCredentials should reject missing required credentials', async () => {
    await expect(
      adapter.prepareCredentials({
        profile: 'gemini',
        baseUrl: '',
        apiKey: 'dummy',
      })
    ).rejects.toThrow(/ANTHROPIC_BASE_URL/);

    await expect(
      adapter.prepareCredentials({
        profile: 'gemini',
        baseUrl: 'http://localhost:8317',
        apiKey: '',
      })
    ).rejects.toThrow(/ANTHROPIC_AUTH_TOKEN/);
  });

  it('prepareCredentials should persist valid credentials', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-droid-adapter-test-'));
    const originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tmpDir;

    try {
      await adapter.prepareCredentials({
        profile: 'gemini',
        baseUrl: 'http://localhost:8317',
        apiKey: 'dummy-key',
        model: 'claude-opus-4-6',
      });

      const settingsPath = path.join(tmpDir, '.factory', 'settings.json');
      expect(fs.existsSync(settingsPath)).toBe(true);
    } finally {
      if (originalCcsHome !== undefined) process.env.CCS_HOME = originalCcsHome;
      else delete process.env.CCS_HOME;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('prepareCredentials should persist reasoning override into Droid extraArgs', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-droid-adapter-reasoning-test-'));
    const originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tmpDir;

    try {
      await adapter.prepareCredentials({
        profile: 'codex',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'dummy-key',
        model: 'gpt-5.2',
        provider: 'openai',
        reasoningOverride: 'high',
      });

      const settingsPath = path.join(tmpDir, '.factory', 'settings.json');
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      expect(settings.customModels?.[0]?.extraArgs?.reasoning?.effort).toBe('high');
    } finally {
      if (originalCcsHome !== undefined) process.env.CCS_HOME = originalCcsHome;
      else delete process.env.CCS_HOME;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('buildArgs should use selector returned from Droid settings entry', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-droid-selector-test-'));
    const originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tmpDir;

    try {
      const isolatedAdapter = new DroidAdapter();
      await isolatedAdapter.prepareCredentials({
        profile: 'gemini',
        baseUrl: 'http://localhost:8317',
        apiKey: 'dummy-key',
        model: 'claude-sonnet-4-5-20250929',
      });

      const args = isolatedAdapter.buildArgs('gemini', ['--verbose']);
      expect(args).toEqual(['--verbose']);
    } finally {
      if (originalCcsHome !== undefined) process.env.CCS_HOME = originalCcsHome;
      else delete process.env.CCS_HOME;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
