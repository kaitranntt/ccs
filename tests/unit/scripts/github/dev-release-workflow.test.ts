import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

function resolvePath(relativePath: string) {
  return path.resolve(import.meta.dir, relativePath);
}

describe('dev release workflow', () => {
  test('uses PAT_TOKEN for protected dev branch release pushes', () => {
    const workflowPath = resolvePath('../../../../.github/workflows/dev-release.yml');

    expect(fs.existsSync(workflowPath)).toBe(true);

    const workflow = fs.readFileSync(workflowPath, 'utf8');
    const checkoutSection = workflow.slice(
      workflow.indexOf('- name: Checkout'),
      workflow.indexOf('- name: Setup Bun')
    );
    const releaseSection = workflow.slice(
      workflow.indexOf('- name: Release'),
      workflow.indexOf('- name: Notify Discord')
    );

    expect(workflow).toContain('name: Dev Release');
    expect(workflow).toContain('branches: [dev]');
    expect(workflow.match(/runs-on: \[self-hosted, linux, x64\]/g)).toHaveLength(2);
    expect(workflow).not.toContain('runs-on: ubuntu-latest');
    expect(checkoutSection).toContain("token: ${{ secrets.PAT_TOKEN }}");
    expect(checkoutSection).not.toContain('token: ${{ github.token }}');
    expect(releaseSection).toContain('GITHUB_TOKEN: ${{ secrets.PAT_TOKEN }}');
    expect(releaseSection).toContain('GH_TOKEN: ${{ secrets.PAT_TOKEN }}');
    expect(releaseSection).not.toContain('GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    expect(releaseSection).not.toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
  });

  test('keeps release commits visible to promotion PR CI', () => {
    const workflowPath = resolvePath('../../../../.github/workflows/dev-release.yml');
    const scriptPath = resolvePath('../../../../scripts/dev-release.sh');

    const workflow = fs.readFileSync(workflowPath, 'utf8');
    const script = fs.readFileSync(scriptPath, 'utf8');

    expect(workflow).toContain('should_release: ${{ steps.release-guard.outputs.should_release }}');
    expect(workflow).toContain('"chore(release): "*)');
    expect(workflow).toContain("needs.guard.outputs.should_release == 'true'");
    expect(workflow).not.toContain('github.event.head_commit.message');
    expect(workflow).not.toContain('!startsWith(');
    expect(workflow).not.toContain("contains(github.event.head_commit.message, '[skip ci]')");
    expect(script).toContain('LEGACY_CURRENT_RELEASE_SUBJECT="${CURRENT_RELEASE_SUBJECT} [skip ci]"');
    expect(script).toContain('[[ "$HEAD_SUBJECT" == "$CURRENT_RELEASE_SUBJECT" ]]');
    expect(script).toContain('[[ "$HEAD_SUBJECT" == "$LEGACY_CURRENT_RELEASE_SUBJECT" ]]');
    expect(script).toContain('git commit -m "chore(release): ${VERSION}"');
    expect(script).not.toContain('git commit -m "chore(release): ${VERSION} [skip ci]"');
  });
});
