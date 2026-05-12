import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

function workflowsDir() {
  return path.resolve(import.meta.dir, '../../../../.github/workflows');
}

describe('self-hosted runner policy', () => {
  test('keeps active workflows on local runners', () => {
    const hostedRunnerLabels = [
      'ubuntu-latest',
      'ubuntu-24.04',
      'ubuntu-22.04',
      'macos-latest',
      'windows-latest',
    ];
    const workflowFiles = fs
      .readdirSync(workflowsDir())
      .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'));

    expect(workflowFiles.length).toBeGreaterThan(0);

    for (const file of workflowFiles) {
      const workflow = fs.readFileSync(path.join(workflowsDir(), file), 'utf8');

      for (const label of hostedRunnerLabels) {
        expect(workflow, `${file} must not use GitHub-hosted runner ${label}`).not.toContain(
          `runs-on: ${label}`
        );
      }

      expect(workflow, `${file} must target a self-hosted runner`).toContain('self-hosted');
    }
  });

  test('gates pull-request self-hosted worker deploys to trusted authors', () => {
    const workflow = fs.readFileSync(path.join(workflowsDir(), 'deploy-ccs-worker.yml'), 'utf8');

    expect(workflow).toContain("github.event_name != 'pull_request'");
    expect(workflow).toContain(
      'contains(fromJSON(\'["COLLABORATOR","MEMBER","OWNER"]\'), github.event.pull_request.author_association)'
    );
  });

  test('gates pull-request workflows that check out code on self-hosted runners', () => {
    const trustedAuthorGate =
      'contains(fromJSON(\'["COLLABORATOR","MEMBER","OWNER"]\'), github.event.pull_request.author_association)';
    const workflowFiles = fs
      .readdirSync(workflowsDir())
      .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'));

    for (const file of workflowFiles) {
      const workflow = fs.readFileSync(path.join(workflowsDir(), file), 'utf8');

      if (workflow.includes('pull_request_target:')) {
        expect(workflow, `${file} must not check out code from pull_request_target`).not.toContain(
          'uses: actions/checkout'
        );
      }

      if (
        workflow.includes('pull_request:') &&
        workflow.includes('self-hosted') &&
        workflow.includes('uses: actions/checkout')
      ) {
        expect(workflow, `${file} must gate self-hosted PR checkout to trusted authors`).toContain(
          trustedAuthorGate
        );
      }
    }
  });

  test('scoped PAT headers match repository URL forms used by git', () => {
    const header = 'AUTHORIZATION: basic test-token';
    const env = {
      ...process.env,
      GIT_CONFIG_COUNT: '2',
      GIT_CONFIG_KEY_0: 'http.https://github.com/kaitranntt/ccs.extraheader',
      GIT_CONFIG_VALUE_0: header,
      GIT_CONFIG_KEY_1: 'http.https://github.com/kaitranntt/ccs.git.extraheader',
      GIT_CONFIG_VALUE_1: header,
    };

    for (const url of ['https://github.com/kaitranntt/ccs', 'https://github.com/kaitranntt/ccs.git']) {
      const result = spawnSync('git', ['config', '--get-urlmatch', 'http.extraheader', url], {
        env,
        encoding: 'utf8',
      });

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout.trim()).toBe(header);
    }

    for (const file of ['release.yml', 'dev-release.yml', 'sync-dev-after-release.yml']) {
      const workflow = fs.readFileSync(path.join(workflowsDir(), file), 'utf8');

      expect(workflow).toContain('echo "::add-mask::${auth_header}"');
      expect(workflow).toContain('http.https://github.com/kaitranntt/ccs.extraheader');
      expect(workflow).toContain('http.https://github.com/kaitranntt/ccs.git.extraheader');
    }
  });
});
