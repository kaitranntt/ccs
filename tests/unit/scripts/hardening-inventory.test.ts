import { describe, expect, test } from 'bun:test';

const { collectSyncCallSites, isTestFile } = require('../../../scripts/hardening-inventory.js');

describe('hardening-inventory sync call scanning', () => {
  test('ignores sync-call names inside regex literals after else', () => {
    const source = [
      'if (enabled) {',
      '  run();',
      '} else /fs\\.readFileSync\\(/.test("pattern");',
    ].join('\n');

    const result = collectSyncCallSites(source);
    expect(result.count).toBe(0);
  });

  test('ignores sync-call names inside regex literals after do', () => {
    const source = 'do /fs\\.writeFileSync\\(/.test("pattern"); while (false);';
    const result = collectSyncCallSites(source);

    expect(result.count).toBe(0);
  });

  test('still counts real sync fs call sites', () => {
    const source = [
      'if (enabled) {',
      '  run();',
      '} else /fs\\.readFileSync\\(/.test("pattern");',
      'fs.readFileSync("file.txt", "utf8");',
    ].join('\n');

    const result = collectSyncCallSites(source);
    expect(result.count).toBe(1);
    expect(result.calls).toEqual(['readFileSync']);
  });
});

describe('hardening-inventory runtime file classification', () => {
  test.each([
    'src/cliproxy/__tests__/routing.test.ts',
    'src/commands/fixtures/help-output.ts',
    'src/auth/profile.spec.ts',
    'tests/unit/commands/profile.test.ts',
  ])('excludes %s from runtime hotpaths', (filePath) => {
    expect(isTestFile(filePath)).toBe(true);
  });

  test.each([
    'src/cliproxy/routing/retry-settings.ts',
    'src/commands/help-command.ts',
    'src/utils/browser/mcp-installer.ts',
  ])('keeps %s eligible for runtime hotpaths', (filePath) => {
    expect(isTestFile(filePath)).toBe(false);
  });
});
