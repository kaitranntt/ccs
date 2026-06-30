#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const rootDir = path.resolve(__dirname, '..');
const candidateRoots = ['tests/unit', 'tests/integration', 'tests/npm', 'src'];
// Add a `.ts` test to `slowTests` when ANY of these apply:
//   1. It spawns a child process (CLI, bun test, node, gh, etc.).
//   2. It binds a port, starts a server, or talks to localhost.
//   3. It reads a real file from `dist/` or the repo root at runtime.
//   4. It waits on a timer > 500ms or a filesystem watcher.
//   5. A single run consistently takes > 1500ms on reference hardware.
// Tests that literally reference `dist/` in source are auto-forced slow by
// `readsBuiltDist`. This list is the manual catch-all for `.ts` tests that
// meet the criteria above without the literal `dist/` string.
// `tests/unit/scripts/run-test-bucket.test.js` verifies every path here exists
// (catches deletion drift) but CANNOT detect new undeclared slow tests.
// Automated perf-budget enforcement tracked in issue #1071.
const slowTests = [
  'tests/integration/cursor-daemon-lifecycle.test.ts',
  'tests/integration/logging-request-context.test.ts',
  'tests/integration/proxy/daemon-lifecycle.test.ts',
  'tests/integration/web-server/codex-profiles-endpoint.test.ts',
  'tests/unit/commands/persist-command-handler.test.ts',
  'tests/unit/hooks/browser-mcp-advanced-interactions.test.ts',
  'tests/unit/hooks/browser-mcp-downloads-and-files.test.ts',
  'tests/unit/hooks/browser-mcp-navigation-and-query.test.ts',
  'tests/unit/hooks/browser-mcp-orchestration-and-artifacts.test.ts',
  'tests/unit/hooks/browser-mcp-recording-and-replay.test.ts',
  'tests/unit/hooks/browser-mcp-session-and-intercepts.test.ts',
  'tests/unit/targets/codex-runtime-integration.test.ts',
  'tests/unit/targets/codex-settings-bridge-launch.test.ts',
  'tests/unit/targets/droid-command-routing-integration.test.ts',
  'tests/unit/targets/droid-config-manager.test.ts',
  'tests/unit/targets/native-claude-effort-launch.test.ts',
  'tests/unit/targets/settings-profile-browser-launch.test.ts',
  'tests/unit/targets/settings-profile-image-analysis-launch.test.ts',
  'tests/unit/targets/settings-profile-websearch-launch.test.ts',
  'tests/unit/web-server/cursor-routes.test.ts',
  'tests/unit/web-server/websearch-routes.test.ts',
];
// CommonJS-heavy JS suites stay slow by default because many of them mutate
// module cache or process state. Opt them into `test:fast` only after they are
// proven stable in the mixed fast bucket.
const fastJsTests = new Set(['tests/unit/flag-parsing-simple.test.js']);

const isolatedTests = new Set([
  'tests/unit/targets/codex-adapter-exec.test.ts',
  'tests/unit/targets/codex-adapter.test.ts',
  'tests/unit/targets/droid-adapter.test.ts',
  'tests/unit/targets/target-registry.test.ts',
  'tests/unit/utils/fetch-proxy-setup.test.ts',
  'tests/unit/web-server/usage/account-attribution.test.ts',
]);

const filePattern = /(\.test\.(c|m)?[jt]s|\.spec\.(c|m)?[jt]s|-test\.(c|m)?[jt]s)$/;

function collectFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, files);
      continue;
    }

    if (filePattern.test(entry.name)) {
      files.push(path.relative(rootDir, fullPath).split(path.sep).join('/'));
    }
  }

  return files;
}

function readsBuiltDist(relativePath) {
  const source = fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
  return source.includes('dist/');
}

function getDiscoveredTests() {
  return candidateRoots
    .flatMap((relativeDir) => collectFiles(path.join(rootDir, relativeDir)))
    .sort();
}

function shouldForceSlow(file) {
  if (file.startsWith('tests/npm/')) {
    return true;
  }

  if (/\.(c|m)?js$/.test(file) && !fastJsTests.has(file)) {
    return true;
  }

  return readsBuiltDist(file);
}

function usesBunTestRunner(relativePath) {
  const source = fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
  return source.includes('bun:test') || /(^|[^\w.])(?:describe|it)\s*\(/m.test(source);
}

function getSlowSet() {
  const discovered = getDiscoveredTests();
  const forceSlow = discovered.filter((file) => shouldForceSlow(file));
  return new Set([...slowTests, ...forceSlow]);
}

function selectBucket(name) {
  const discovered = getDiscoveredTests();
  const slowSet = getSlowSet();

  return name === 'slow' ? [...slowSet].sort() : discovered.filter((file) => !slowSet.has(file));
}

function toBunTestPath(relativePath) {
  if (
    relativePath.startsWith('./') ||
    relativePath.startsWith('../') ||
    path.isAbsolute(relativePath)
  ) {
    return relativePath;
  }

  return `./${relativePath}`;
}

function getBunArgs(name, selected = selectBucket(name)) {
  const testPaths = selected.map(toBunTestPath);

  // Slow bucket forces sequential execution because it spawns subprocesses,
  // binds ports, and touches shared state — parallelism causes flakes.
  // Fast bucket keeps bun's default parallelism for speed.
  return name === 'slow' ? ['test', '--max-concurrency=1', ...testPaths] : ['test', ...testPaths];
}

function shouldRunIsolated(file) {
  return file.startsWith('src/') || isolatedTests.has(file) || !usesBunTestRunner(file);
}

function getBunRuns(name, selected = selectBucket(name)) {
  const shared = selected.filter((file) => !shouldRunIsolated(file));
  const isolated = selected.filter(shouldRunIsolated);
  const runs = [];

  if (shared.length > 0) {
    runs.push({
      label: 'shared',
      selected: shared,
      bunArgs: getBunArgs(name, shared),
      quietOnPass: false,
    });
  }

  for (const file of isolated) {
    runs.push({
      label: file,
      selected: [file],
      bunArgs: getBunArgs(name, [file]),
      quietOnPass: true,
    });
  }

  return runs;
}

function stripAnsi(value) {
  return value.replace(/\x1b\[[0-9;]*m/g, '');
}

function parseBunFileCount(output) {
  const match = stripAnsi(output).match(/Ran\s+\d+\s+tests?\s+across\s+(\d+)\s+files?/i);
  return match ? Number(match[1]) : null;
}

function verifyReportedFileCount(selectedCount, output) {
  const reportedCount = parseBunFileCount(output);

  if (reportedCount === null) {
    return {
      ok: false,
      message: '[X] Could not find Bun test file count in output.',
      reportedCount,
      selectedCount,
    };
  }

  if (reportedCount !== selectedCount) {
    return {
      ok: false,
      message:
        `[X] Bun ran ${reportedCount} files, but the bucket selected ${selectedCount} files. ` +
        'Check test path arguments for filter/path ambiguity.',
      reportedCount,
      selectedCount,
    };
  }

  return {
    ok: true,
    reportedCount,
    selectedCount,
  };
}

function shouldVerifyRunFileCount(run) {
  return run.selected.every((file) => usesBunTestRunner(file));
}

function ensureBuildForSlowBucket() {
  if (fs.existsSync(path.join(rootDir, 'dist', 'ccs.js'))) {
    return 0;
  }

  const build = spawnSync('bun', ['run', 'build'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  return build.status ?? 1;
}

function runBunTest(run) {
  const result = spawnSync('bun', run.bunArgs, {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === 'win32',
  });

  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const writeOutput = () => {
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
  };

  if (result.error) {
    writeOutput();
    console.error(`[X] Failed to run bun test: ${result.error.message}`);
    return 1;
  }

  const exitCode = result.status ?? 1;
  if (exitCode !== 0) {
    writeOutput();
    return exitCode;
  }

  if (shouldVerifyRunFileCount(run)) {
    const countCheck = verifyReportedFileCount(run.selected.length, output);
    if (!countCheck.ok) {
      writeOutput();
      console.error(countCheck.message);
      return 1;
    }
  }

  if (run.quietOnPass) {
    console.log(`[OK] ${run.label}`);
  } else {
    writeOutput();
  }

  return 0;
}

function runBucket(name) {
  const selected = selectBucket(name);

  if (selected.length === 0) {
    console.error(`[X] No tests matched the '${name}' bucket.`);
    return 1;
  }

  if (name === 'slow') {
    const buildStatus = ensureBuildForSlowBucket();
    if (buildStatus !== 0) {
      return buildStatus;
    }
  }

  const runs = getBunRuns(name, selected);
  const isolatedCount = runs.filter((run) => run.quietOnPass).length;
  if (isolatedCount > 0) {
    console.log(`[i] Running ${isolatedCount} test file(s) in isolated Bun processes.`);
  }

  let exitCode = 0;
  for (const run of runs) {
    const status = runBunTest(run);
    if (status !== 0) {
      exitCode = status;
    }
  }

  if (exitCode === 0) {
    console.log(`[OK] Bucket '${name}' ran ${selected.length} selected test files.`);
  }

  return exitCode;
}

function main(args = process.argv.slice(2)) {
  const bucket = args[0];

  if (!['fast', 'slow', 'all'].includes(bucket)) {
    console.error('[X] Usage: node scripts/run-test-bucket.js <fast|slow|all>');
    return 1;
  }

  if (bucket === 'all') {
    let exitCode = 0;

    for (const name of ['fast', 'slow']) {
      const status = runBucket(name);
      if (status !== 0) {
        exitCode = status;
      }
    }

    return exitCode;
  }

  return runBucket(bucket);
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  slowTests,
  fastJsTests,
  isolatedTests,
  readsBuiltDist,
  shouldForceSlow,
  getDiscoveredTests,
  getSlowSet,
  selectBucket,
  toBunTestPath,
  getBunArgs,
  usesBunTestRunner,
  shouldRunIsolated,
  getBunRuns,
  parseBunFileCount,
  verifyReportedFileCount,
  shouldVerifyRunFileCount,
  main,
};
