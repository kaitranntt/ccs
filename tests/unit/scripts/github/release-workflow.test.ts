import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

function resolvePath(relativePath: string) {
  return path.resolve(import.meta.dir, relativePath);
}

describe('stable release workflow', () => {
  test('uses the self-hosted runner and scoped release token path', () => {
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
    expect(workflow).toContain('runs-on: [self-hosted, linux, x64]');
    expect(workflow).not.toContain('runs-on: ubuntu-latest');
    expect(checkoutSection).toContain('persist-credentials: false');
    expect(checkoutSection).not.toContain('token: ${{ secrets.PAT_TOKEN }}');
    expect(releaseSection).toContain('echo "::add-mask::${auth_header}"');
    expect(releaseSection).toContain('GIT_CONFIG_COUNT=2');
    expect(releaseSection).toContain('GIT_CONFIG_KEY_0=http.https://github.com/kaitranntt/ccs.extraheader');
    expect(releaseSection).toContain('GIT_CONFIG_VALUE_0="AUTHORIZATION: basic ${auth_header}"');
    expect(releaseSection).toContain('GIT_CONFIG_KEY_1=http.https://github.com/kaitranntt/ccs.git.extraheader');
    expect(releaseSection).toContain('GIT_CONFIG_VALUE_1="AUTHORIZATION: basic ${auth_header}"');
    expect(releaseSection).toContain('GITHUB_TOKEN: ${{ secrets.PAT_TOKEN }}');
    expect(releaseSection).toContain('GH_TOKEN: ${{ secrets.PAT_TOKEN }}');
    expect(releaseSection).toContain('NPM_TOKEN: ${{ secrets.NPM_TOKEN }}');
  });
});
