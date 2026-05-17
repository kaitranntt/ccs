const { describe, expect, test } = require('bun:test');
const path = require('node:path');
const bucket = require('../../../scripts/run-test-bucket.js');

describe('run-test-bucket', () => {
  const browserMcpSplitSuites = [
    'tests/unit/hooks/browser-mcp-advanced-interactions.test.ts',
    'tests/unit/hooks/browser-mcp-downloads-and-files.test.ts',
    'tests/unit/hooks/browser-mcp-navigation-and-query.test.ts',
    'tests/unit/hooks/browser-mcp-orchestration-and-artifacts.test.ts',
    'tests/unit/hooks/browser-mcp-recording-and-replay.test.ts',
    'tests/unit/hooks/browser-mcp-session-and-intercepts.test.ts',
  ];

  test('all declared slow tests still exist on disk', () => {
    for (const relativePath of bucket.slowTests) {
      const absolutePath = path.resolve(__dirname, '../../../', relativePath);
      expect(Bun.file(absolutePath).exists()).resolves.toBe(true);
    }
  });

  test('keeps the split Browser MCP suites in the slow bucket', () => {
    const slowSet = bucket.getSlowSet();

    expect(slowSet.has('tests/unit/hooks/ccs-browser-mcp-server.test.ts')).toBe(false);
    for (const relativePath of browserMcpSplitSuites) {
      expect(slowSet.has(relativePath)).toBe(true);
    }
  });

  test('keeps web-server integration tests that bind ports in the slow bucket', () => {
    const slowSet = bucket.getSlowSet();

    expect(slowSet.has('tests/integration/web-server/codex-profiles-endpoint.test.ts')).toBe(true);
  });

  test('forces npm tests into the slow bucket', () => {
    expect(bucket.shouldForceSlow('tests/npm/cli.test.js')).toBe(true);
  });

  test('discovers colocated backend tests under src', () => {
    const discovered = bucket.getDiscoveredTests();

    expect(discovered).toContain('src/cliproxy/types/__tests__/types-backward-compat.test.ts');
  });

  test('keeps dist-independent javascript tests in the fast bucket', () => {
    expect(bucket.shouldForceSlow('tests/unit/flag-parsing-simple.test.js')).toBe(false);
  });

  test('keeps non-allowlisted javascript tests in the slow bucket', () => {
    expect(bucket.shouldForceSlow('tests/unit/commands/persist-command.test.js')).toBe(true);
  });

  test('still forces dist-dependent tests into the slow bucket', () => {
    expect(bucket.shouldForceSlow('tests/unit/config-dir-override.test.js')).toBe(true);
  });
});
