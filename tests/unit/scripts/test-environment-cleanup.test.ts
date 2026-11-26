import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../..');
const preloadPath = path.join(repoRoot, 'tests', 'shared', 'fixtures', 'test-environment.js');

describe('test-environment cleanup', () => {
  test('cleans up bootstrapped test home after multi-file bun test execution without tearing down between files', () => {
    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-cleanup-multifile-'));
    const reportPath = path.join(fixtureDir, 'report.jsonl');
    const file1Path = path.join(fixtureDir, 'first.test.ts');
    const file2Path = path.join(fixtureDir, 'second.test.ts');

    try {
      fs.writeFileSync(
        file1Path,
        `
import { expect, test } from 'bun:test';
import fs from 'node:fs';

test('file 1 sees bootstrap home', () => {
  const bootstrapHome = process.env.CCS_TEST_BOOTSTRAP_HOME || '';
  fs.appendFileSync(
    ${JSON.stringify(reportPath)},
    JSON.stringify({ phase: 'file1-test', bootstrapHome, exists: fs.existsSync(bootstrapHome) }) + '\\n'
  );
  expect(bootstrapHome.length).toBeGreaterThan(0);
  expect(fs.existsSync(bootstrapHome)).toBe(true);
});
`
      );

      fs.writeFileSync(
        file2Path,
        `
import { afterAll, expect, test } from 'bun:test';
import fs from 'node:fs';

let seenHome = '';

test('file 2 sees same bootstrap home', () => {
  seenHome = process.env.CCS_TEST_BOOTSTRAP_HOME || '';
  fs.appendFileSync(
    ${JSON.stringify(reportPath)},
    JSON.stringify({ phase: 'file2-test', bootstrapHome: seenHome, exists: fs.existsSync(seenHome) }) + '\\n'
  );
  expect(seenHome.length).toBeGreaterThan(0);
  expect(fs.existsSync(seenHome)).toBe(true);
});

afterAll(() => {
  fs.appendFileSync(
    ${JSON.stringify(reportPath)},
    JSON.stringify({ phase: 'file2-afterAll', bootstrapHome: seenHome, exists: fs.existsSync(seenHome) }) + '\\n'
  );
  expect(fs.existsSync(seenHome)).toBe(true);
});
`
      );

      const child = spawnSync('bun', ['test', file1Path, file2Path], {
        cwd: repoRoot,
        encoding: 'utf8',
      });

      expect(child.status).toBe(0);
      const events = fs
        .readFileSync(reportPath, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as { phase: string; bootstrapHome: string; exists: boolean });

      const file1Event = events.find((e) => e.phase === 'file1-test');
      const file2Event = events.find((e) => e.phase === 'file2-test');
      const file2AfterAll = events.find((e) => e.phase === 'file2-afterAll');

      expect(file1Event?.exists).toBe(true);
      expect(file2Event?.exists).toBe(true);
      expect(file2AfterAll?.exists).toBe(true);
      expect(file1Event?.bootstrapHome).toBeTruthy();
      expect(file2Event?.bootstrapHome).toBe(file1Event?.bootstrapHome);
      expect(file1Event?.bootstrapHome).not.toBe(process.env.CCS_TEST_BOOTSTRAP_HOME);
      expect(fs.existsSync(file1Event?.bootstrapHome ?? '')).toBe(false);
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  test('cleans up both bootstrap home and uncleaned createTestEnvironment dir on node exit', () => {
    const script = `
const fs = require('node:fs');
const { createTestEnvironment } = require(${JSON.stringify(preloadPath)});
const env = createTestEnvironment();
const payload = {
  bootstrapHome: process.env.CCS_TEST_BOOTSTRAP_HOME,
  testHome: env.testHome,
  bootstrapExistsDuringRun: fs.existsSync(process.env.CCS_TEST_BOOTSTRAP_HOME),
  testHomeExistsDuringRun: fs.existsSync(env.testHome),
};
console.log(JSON.stringify(payload));
`;

    const child = spawnSync('node', ['-e', script], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    expect(child.status).toBe(0);
    const payload = JSON.parse(child.stdout.trim()) as {
      bootstrapHome: string;
      testHome: string;
      bootstrapExistsDuringRun: boolean;
      testHomeExistsDuringRun: boolean;
    };

    expect(payload.bootstrapExistsDuringRun).toBe(true);
    expect(payload.testHomeExistsDuringRun).toBe(true);
    expect(path.basename(payload.bootstrapHome)).toMatch(/^ccs-test-home-/);
    expect(path.basename(payload.testHome)).toMatch(/^ccs-test-/);
    expect(fs.existsSync(payload.bootstrapHome)).toBe(false);
    expect(fs.existsSync(payload.testHome)).toBe(false);
  });

  test('does not create a bootstrap dir when CCS_TEST_DISABLE_GLOBAL_BOOTSTRAP=1', () => {
    const isolatedTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-disabled-bootstrap-'));
    const fallbackHome = path.join(isolatedTmpDir, 'fallback-home');
    fs.mkdirSync(fallbackHome, { recursive: true });

    try {
      const childEnv: NodeJS.ProcessEnv = {
        ...process.env,
        CCS_TEST_DISABLE_GLOBAL_BOOTSTRAP: '1',
        HOME: fallbackHome,
        USERPROFILE: fallbackHome,
        TMPDIR: isolatedTmpDir,
        TEMP: isolatedTmpDir,
        TMP: isolatedTmpDir,
      };
      delete childEnv.CCS_HOME;
      delete childEnv.CCS_TEST_BOOTSTRAP_HOME;

      const script = `
const { getCcsHome } = require(${JSON.stringify(preloadPath)});
console.log(JSON.stringify({
  bootstrapHome: process.env.CCS_TEST_BOOTSTRAP_HOME || null,
  ccsHome: getCcsHome(),
}));
`;

      const child = spawnSync('node', ['-e', script], {
        cwd: repoRoot,
        env: childEnv,
        encoding: 'utf8',
      });

      expect(child.status).toBe(0);
      const payload = JSON.parse(child.stdout.trim()) as {
        bootstrapHome: string | null;
        ccsHome: string;
      };

      expect(payload.bootstrapHome).toBeNull();
      expect(payload.ccsHome).toBe(fallbackHome);
      const createdBootstrapDirs = fs
        .readdirSync(isolatedTmpDir)
        .filter((entry) => entry.startsWith('ccs-test-home-'));
      expect(createdBootstrapDirs).toEqual([]);
    } finally {
      fs.rmSync(isolatedTmpDir, { recursive: true, force: true });
    }
  });

  test('does not delete a parent process bootstrap dir when child exits', () => {
    const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-test-home-parent-sentinel-'));
    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-cleanup-parent-'));
    const childTestPath = path.join(fixtureDir, 'child.test.ts');

    try {
      fs.writeFileSync(
        childTestPath,
        `
import { expect, test } from 'bun:test';
import fs from 'node:fs';

test('child runs with its own bootstrap dir', () => {
  const childHome = process.env.CCS_TEST_BOOTSTRAP_HOME || '';
  expect(childHome).not.toBe(${JSON.stringify(parentDir)});
  expect(fs.existsSync(childHome)).toBe(true);
});
`
      );

      const child = spawnSync('bun', ['test', '--preload', preloadPath, childTestPath], {
        cwd: repoRoot,
        env: { ...process.env, CCS_TEST_BOOTSTRAP_HOME: parentDir },
        encoding: 'utf8',
      });

      expect(child.status).toBe(0);
      expect(fs.existsSync(parentDir)).toBe(true);
    } finally {
      fs.rmSync(parentDir, { recursive: true, force: true });
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});
