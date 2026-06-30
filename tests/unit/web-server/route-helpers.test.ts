import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { validateFilePath } from '../../../src/web-server/routes/route-helpers';

describe('validateFilePath', () => {
  let tempDir: string;
  let originalCcsHome: string | undefined;
  let originalClaudeConfigDir: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'route-helpers-test-'));
    originalCcsHome = process.env.CCS_HOME;
    originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;

    process.env.CCS_HOME = tempDir;
    process.env.CLAUDE_CONFIG_DIR = path.join(tempDir, '.claude-custom');
  });

  afterEach(() => {
    if (originalCcsHome === undefined) {
      delete process.env.CCS_HOME;
    } else {
      process.env.CCS_HOME = originalCcsHome;
    }

    if (originalClaudeConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR;
    } else {
      process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
    }

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('allows files within ~/.ccs tree', () => {
    const filePath = path.join(tempDir, '.ccs', 'config.yaml');
    const result = validateFilePath(filePath);

    expect(result.valid).toBe(true);
    expect(result.readonly).toBe(false);
  });

  test('rejects writes to the macOS bar launch descriptor', () => {
    const filePath = path.join(tempDir, '.ccs', 'bar', 'launch.json');
    const result = validateFilePath(filePath);

    expect(result.valid).toBe(false);
    expect(result.readonly).toBe(false);
  });

  test('still allows other writes inside the bar directory', () => {
    const filePath = path.join(tempDir, '.ccs', 'bar', 'serve.log');
    const result = validateFilePath(filePath);

    expect(result.valid).toBe(true);
    expect(result.readonly).toBe(false);
  });

  test('rejects sibling paths that only share ~/.ccs prefix', () => {
    const bypassPath = path.join(tempDir, '.ccs-evil', 'config.yaml');
    const result = validateFilePath(bypassPath);

    expect(result.valid).toBe(false);
    expect(result.readonly).toBe(false);
  });

  test('allows readonly access to resolved Claude settings path', () => {
    const filePath = path.join(tempDir, '.claude-custom', 'settings.json');
    const result = validateFilePath(filePath);

    expect(result.valid).toBe(true);
    expect(result.readonly).toBe(true);
  });

  test('rejects symlinked paths inside ~/.ccs tree', () => {
    if (process.platform === 'win32') {
      return;
    }

    const ccsDir = path.join(tempDir, '.ccs');
    const outsideDir = path.join(tempDir, 'outside');
    const linkedDir = path.join(ccsDir, 'linked');
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });
    fs.symlinkSync(outsideDir, linkedDir, 'dir');

    const result = validateFilePath(path.join(linkedDir, 'config.yaml'));
    expect(result.valid).toBe(false);
    expect(result.readonly).toBe(false);
  });

  test('rejects symlinked Claude settings path', () => {
    if (process.platform === 'win32') {
      return;
    }

    const claudeDir = path.join(tempDir, '.claude-custom');
    const targetFile = path.join(tempDir, 'target-settings.json');
    const settingsPath = path.join(claudeDir, 'settings.json');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(targetFile, '{}');
    fs.symlinkSync(targetFile, settingsPath, 'file');

    const result = validateFilePath(settingsPath);
    expect(result.valid).toBe(false);
    expect(result.readonly).toBe(false);
  });
});
