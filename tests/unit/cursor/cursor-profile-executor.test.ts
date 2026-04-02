import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  executeCursorProfile,
  generateCursorEnv,
} from '../../../src/cursor/cursor-profile-executor';
import { saveCredentials } from '../../../src/cursor/cursor-auth';
import type { CursorConfig } from '../../../src/config/unified-config-types';

const BASE_CONFIG: CursorConfig = {
  enabled: true,
  port: 20129,
  auto_start: false,
  ghost_mode: true,
  model: 'gpt-5.3-codex',
};

describe('cursor-profile-executor', () => {
  let originalCcsHome: string | undefined;
  let tempDir: string;

  beforeEach(() => {
    originalCcsHome = process.env.CCS_HOME;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-cursor-profile-executor-'));
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

  it('builds Cursor env for Claude runtime', () => {
    const env = generateCursorEnv(
      {
        ...BASE_CONFIG,
        opus_model: 'cursor-opus',
        sonnet_model: 'cursor-sonnet',
        haiku_model: 'cursor-haiku',
      },
      '/tmp/claude-config'
    );

    expect(env.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:20129');
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe('cursor-managed');
    expect(env.ANTHROPIC_MODEL).toBe('gpt-5.3-codex');
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('cursor-opus');
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('cursor-sonnet');
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('cursor-haiku');
    expect(env.CLAUDE_CONFIG_DIR).toBe('/tmp/claude-config');
  });

  it('fails fast when Cursor integration is disabled', async () => {
    const exitCode = await executeCursorProfile({ ...BASE_CONFIG, enabled: false }, []);
    expect(exitCode).toBe(1);
  });

  it('fails when credentials are missing', async () => {
    const exitCode = await executeCursorProfile(BASE_CONFIG, []);
    expect(exitCode).toBe(1);
  });

  it('fails with actionable guidance when daemon is down and auto_start is false', async () => {
    saveCredentials({
      accessToken: 'a'.repeat(60),
      machineId: '1234567890abcdef1234567890abcdef',
      authMethod: 'manual',
      importedAt: new Date().toISOString(),
    });

    const exitCode = await executeCursorProfile(
      {
        ...BASE_CONFIG,
        port: 29991,
        auto_start: false,
      },
      []
    );

    expect(exitCode).toBe(1);
  });
});
