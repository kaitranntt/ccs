import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

function resolvePath(relativePath: string) {
  return path.resolve(import.meta.dir, relativePath);
}

describe('push ci workflow', () => {
  test('keeps dev push quality checks separate from release automation', () => {
    const workflowPath = resolvePath('../../../../.github/workflows/push-ci.yml');

    expect(fs.existsSync(workflowPath)).toBe(true);

    const workflow = fs.readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('name: Push CI');
    expect(workflow).toContain('push:');
    expect(workflow).toContain('branches: [dev]');
    expect(workflow).toContain('group: push-ci-${{ github.ref }}');
    expect(workflow).toContain('cancel-in-progress: true');
    expect(workflow).toContain('runs-on: ubuntu-latest');
    expect(workflow).toContain("key: ${{ runner.os }}-bun-cache-v2-${{ hashFiles('bun.lock', 'ui/bun.lock') }}");
    expect(workflow).not.toContain('restore-keys:');
    expect(workflow).toContain("name: ${{ matrix.check.name }}");
    expect(workflow).toContain("cmd: 'bun run typecheck'");
    expect(workflow).toContain("cmd: 'bun run lint'");
    expect(workflow).toContain("cmd: 'bun run format:check'");
    expect(workflow).toContain('run: bun run build:all');
    expect(workflow).toContain("FAST_TEST_BUDGET_SECONDS: '90'");
    expect(workflow).toContain('name: Test fast bucket with perf budget');
    expect(workflow).toContain('bun run test:fast');
    expect(workflow).toContain('test_status=$?');
    expect(workflow).toContain('exit "$test_status"');
    expect(workflow).toContain('::warning::test:fast took ${elapsed_seconds}s');
    expect(workflow).toContain('scripts/run-test-bucket.js');
    expect(workflow).toContain('run: bun run test:slow');
    expect(workflow).toContain("CCS_E2E_SKIP_BUILD: '1'");
    expect(workflow).toContain('run: bun run test:e2e');
  });
});
