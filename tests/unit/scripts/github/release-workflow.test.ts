import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

function resolvePath(relativePath: string) {
  return path.resolve(import.meta.dir, relativePath);
}

describe('stable release workflow', () => {
  test('uses an ephemeral hosted runner and release token path', () => {
    const workflowPath = resolvePath('../../../../.github/workflows/release.yml');

    expect(fs.existsSync(workflowPath)).toBe(true);

    const workflow = fs.readFileSync(workflowPath, 'utf8');
    const checkoutSection = workflow.slice(
      workflow.indexOf('- name: Checkout code'),
      workflow.indexOf('- name: Setup Node.js')
    );
    const releaseSection = workflow.slice(
      workflow.indexOf('- name: Release'),
      workflow.indexOf('- name: Notify Discord')
    );

    expect(workflow).toContain('name: Release');
    expect(workflow).toContain('branches: [main]');
    expect(workflow).toContain('runs-on: ubuntu-latest');
    expect(workflow).not.toContain('runs-on: [self-hosted, linux, x64]');
    expect(checkoutSection).toContain('token: ${{ secrets.PAT_TOKEN }}');
    expect(releaseSection).toContain('GITHUB_TOKEN: ${{ secrets.PAT_TOKEN }}');
    expect(releaseSection).toContain('GH_TOKEN: ${{ secrets.PAT_TOKEN }}');
    expect(releaseSection).toContain('NPM_TOKEN: ${{ secrets.NPM_TOKEN }}');
  });
});
