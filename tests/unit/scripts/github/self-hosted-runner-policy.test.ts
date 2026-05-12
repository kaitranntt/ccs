import { describe, expect, test } from 'bun:test';
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
});
