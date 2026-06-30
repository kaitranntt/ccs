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

  test('passes selected tests to Bun as explicit relative paths', () => {
    const args = bucket.getBunArgs('fast', [
      'tests/unit/example.test.ts',
      'src/cliproxy/types/__tests__/types-backward-compat.test.ts',
    ]);

    expect(args).toEqual([
      'test',
      './tests/unit/example.test.ts',
      './src/cliproxy/types/__tests__/types-backward-compat.test.ts',
    ]);
  });

  test('keeps slow bucket concurrency flag before explicit test paths', () => {
    const args = bucket.getBunArgs('slow', ['tests/integration/example.test.ts']);

    expect(args).toEqual(['test', '--max-concurrency=1', './tests/integration/example.test.ts']);
  });

  test('isolates src tests while keeping already-covered tests in a shared run', () => {
    const runs = bucket.getBunRuns('fast', [
      'tests/unit/scripts/run-test-bucket.test.js',
      'src/cliproxy/types/__tests__/types-backward-compat.test.ts',
      'src/errors/__tests__/error-types.test.ts',
    ]);

    expect(runs.map((run) => run.label)).toEqual([
      'shared',
      'src/cliproxy/types/__tests__/types-backward-compat.test.ts',
      'src/errors/__tests__/error-types.test.ts',
    ]);
    expect(runs[0].selected).toEqual(['tests/unit/scripts/run-test-bucket.test.js']);
    expect(runs[0].bunArgs).toEqual(['test', './tests/unit/scripts/run-test-bucket.test.js']);
    expect(runs[1].bunArgs).toEqual([
      'test',
      './src/cliproxy/types/__tests__/types-backward-compat.test.ts',
    ]);
    expect(runs[1].quietOnPass).toBe(true);
  });

  test('isolates known sticky mock suites outside src', () => {
    const runs = bucket.getBunRuns('fast', [
      'tests/unit/scripts/run-test-bucket.test.js',
      'tests/unit/targets/target-registry.test.ts',
    ]);

    expect(runs.map((run) => run.label)).toEqual([
      'shared',
      'tests/unit/targets/target-registry.test.ts',
    ]);
  });

  test('isolates standalone validation scripts that are not Bun test suites', () => {
    const runs = bucket.getBunRuns('slow', [
      'tests/integration/cursor-daemon-lifecycle.test.ts',
      'tests/integration/token-counting-test.js',
    ]);

    expect(bucket.usesBunTestRunner('tests/integration/cursor-daemon-lifecycle.test.ts')).toBe(
      true
    );
    expect(bucket.usesBunTestRunner('tests/integration/token-counting-test.js')).toBe(false);
    expect(runs.map((run) => run.label)).toEqual([
      'shared',
      'tests/integration/token-counting-test.js',
    ]);
    expect(runs[1].quietOnPass).toBe(true);
  });

  test('parses Bun file counts from test summaries', () => {
    expect(bucket.parseBunFileCount('\u001b[32mRan 2559 tests across 272 files\u001b[0m')).toBe(
      272
    );
  });

  test('detects when Bun reports fewer files than the bucket selected', () => {
    const result = bucket.verifyReportedFileCount(364, 'Ran 2559 tests across 272 files');

    expect(result.ok).toBe(false);
    expect(result.reportedCount).toBe(272);
    expect(result.selectedCount).toBe(364);
    expect(result.message).toContain('Bun ran 272 files');
  });

  test('skips Bun file-count verification for standalone validation scripts', () => {
    expect(
      bucket.shouldVerifyRunFileCount({
        selected: ['tests/integration/token-counting-test.js'],
      })
    ).toBe(false);
    expect(
      bucket.shouldVerifyRunFileCount({
        selected: ['tests/integration/cursor-daemon-lifecycle.test.ts'],
      })
    ).toBe(true);
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
