import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

function resolvePath(relativePath: string) {
  return path.resolve(import.meta.dir, relativePath);
}

describe('pr ci workflow', () => {
  test('keeps full coverage on pull requests', () => {
    const workflowPath = resolvePath('../../../../.github/workflows/ci.yml');
    const trustedAuthorGate =
      'contains(fromJSON(\'["COLLABORATOR","MEMBER","OWNER"]\'), github.event.pull_request.author_association)';

    expect(fs.existsSync(workflowPath)).toBe(true);

    const workflow = fs.readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('name: CI');
    expect(workflow).toContain('pull_request:');
    expect(workflow).toContain('branches: [main, dev]');
    expect(workflow.split(trustedAuthorGate).length - 1).toBe(3);
    expect(workflow).toContain('group: ci-${{ github.ref }}');
    expect(workflow).toContain('cancel-in-progress: true');
    expect(workflow).toContain('fail-fast: false');
    expect(workflow).toContain('runs-on: [self-hosted, linux, x64]');
    expect(workflow).toContain("cmd: 'bun run typecheck'");
    expect(workflow).toContain("cmd: 'bun run lint'");
    expect(workflow).toContain("cmd: 'bun run format:check'");
    expect(workflow).toContain("key: ${{ runner.os }}-bun-cache-v2-${{ hashFiles('bun.lock', 'ui/bun.lock') }}");
    expect(workflow).not.toContain('restore-keys:');
    expect(workflow).toContain('name: dist');
    expect(workflow).toContain('path: dist/');
    expect(workflow).toContain('needs: [build]');
    expect(workflow).toContain('run: bun run test:all');
    expect(workflow).toContain("CCS_E2E_SKIP_BUILD: '1'");
    expect(workflow).toContain('run: bun run test:e2e');
  });
});
