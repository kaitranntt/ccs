import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { invalidateConfigCache } from '../../../config/config-loader-facade';
import { clearConfigCache } from '../base-config-loader';
import { applyClaudeAutoCompactWindow } from '../env-builder';
import { buildClaudeEnvironment } from '../../executor/env-resolver';

describe('applyClaudeAutoCompactWindow', () => {
  it('injects the catalog window for the effective model after suffix normalization', () => {
    const env = applyClaudeAutoCompactWindow(
      {
        ANTHROPIC_MODEL: 'gpt-5.6-sol-xhigh[1m]',
      },
      'codex'
    );
    expect(env.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe('272000');
  });
  it('injects 1.05M window for GPT-6.1 Sol with tuning suffixes', () => {
    const env = applyClaudeAutoCompactWindow(
      {
        ANTHROPIC_MODEL: 'gpt-6.1-sol-max-fast',
      },
      'codex'
    );
    expect(env.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe('1050000');
  });

  it('uses the selected provider when the same model family exists in multiple catalogs', () => {
    const env = applyClaudeAutoCompactWindow(
      {
        ANTHROPIC_MODEL: 'claude-opus-4-6-thinking',
      },
      'agy'
    );

    expect(env.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe('200000');
  });

  it('does not inject a value for unknown or custom models', () => {
    const env = applyClaudeAutoCompactWindow(
      {
        ANTHROPIC_MODEL: 'custom-model-with-unknown-window',
      },
      'codex'
    );

    expect('CLAUDE_CODE_AUTO_COMPACT_WINDOW' in env).toBe(false);
  });

  it('preserves an explicit user value', () => {
    const env = applyClaudeAutoCompactWindow(
      {
        ANTHROPIC_MODEL: 'gpt-5.6-sol',
        CLAUDE_CODE_AUTO_COMPACT_WINDOW: '123456',
      },
      'codex'
    );

    expect(env.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe('123456');
  });

  it('treats an explicit empty value as authoritative', () => {
    const env = applyClaudeAutoCompactWindow(
      {
        ANTHROPIC_MODEL: 'gpt-5.6-sol',
        CLAUDE_CODE_AUTO_COMPACT_WINDOW: '',
      },
      'codex'
    );

    expect(env.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe('');
  });

  it('does not mistake a differently cased variable for the Claude Code key', () => {
    const env = applyClaudeAutoCompactWindow(
      {
        ANTHROPIC_MODEL: 'gpt-5.6-sol',
        claude_code_auto_compact_window: '123456',
      },
      'codex'
    );

    expect(env.claude_code_auto_compact_window).toBe('123456');
    expect(env.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe('272000');
  });
});

describe('Claude launch auto-compact integration', () => {
  let tempHome: string;
  let originalCcsHome: string | undefined;
  let originalAutoCompactWindow: string | undefined;

  beforeEach(() => {
    originalCcsHome = process.env.CCS_HOME;
    originalAutoCompactWindow = process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-auto-compact-'));
    process.env.CCS_HOME = tempHome;
    delete process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW;
    invalidateConfigCache();
    clearConfigCache();
  });

  afterEach(() => {
    if (originalCcsHome === undefined) delete process.env.CCS_HOME;
    else process.env.CCS_HOME = originalCcsHome;

    if (originalAutoCompactWindow === undefined) {
      delete process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW;
    } else {
      process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = originalAutoCompactWindow;
    }

    invalidateConfigCache();
    clearConfigCache();
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('injects the catalog window for the provider default model on Claude launches', () => {
    const env = buildClaudeEnvironment({
      provider: 'codex',
      useRemoteProxy: false,
      localPort: 8317,
      verbose: false,
    });

    expect(env.ANTHROPIC_MODEL).toBe('gpt-5.4(high)');
    expect(env.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe('1050000');
  });

  it('preserves an inherited user value on Claude launches', () => {
    process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = '';

    const env = buildClaudeEnvironment({
      provider: 'codex',
      useRemoteProxy: false,
      localPort: 8317,
      verbose: false,
    });

    expect(env.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe('');
  });

  it('uses the composite default tier provider for model lookup', () => {
    const env = buildClaudeEnvironment({
      provider: 'codex',
      useRemoteProxy: false,
      localPort: 8317,
      verbose: false,
      isComposite: true,
      compositeTiers: {
        opus: { provider: 'agy', model: 'claude-opus-4-6-thinking' },
        sonnet: { provider: 'codex', model: 'gpt-5.6-sol' },
        haiku: { provider: 'kimi', model: 'kimi-k2' },
      },
      compositeDefaultTier: 'opus',
    });

    expect(env.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe('200000');
  });

  it('preserves an explicit empty value from a custom settings file', () => {
    const settingsPath = path.join(tempHome, 'codex-custom.settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317',
          ANTHROPIC_AUTH_TOKEN: 'test-token',
          ANTHROPIC_MODEL: 'gpt-5.6-sol',
          CLAUDE_CODE_AUTO_COMPACT_WINDOW: '',
        },
      })
    );

    const env = buildClaudeEnvironment({
      provider: 'codex',
      useRemoteProxy: false,
      localPort: 8317,
      customSettingsPath: settingsPath,
      verbose: false,
    });

    expect(env.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe('');
  });
});
