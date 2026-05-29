import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dir, '../../..');

describe('docker release workflow context', () => {
  test('builds the integrated Dockerfile with the context its COPY paths expect', () => {
    const workflow = readFileSync(join(repoRoot, '.github/workflows/docker-release.yml'), 'utf8');
    const dockerfile = readFileSync(join(repoRoot, 'docker/Dockerfile.integrated'), 'utf8');

    expect(workflow).toMatch(
      /Build and push integrated image[\s\S]*context: docker[\s\S]*file: docker\/Dockerfile\.integrated/,
    );
    expect(dockerfile).toContain('COPY supervisord.conf /etc/supervisord.conf');
    expect(dockerfile).toContain('COPY entrypoint-integrated.sh /entrypoint-integrated.sh');
    expect(existsSync(join(repoRoot, 'docker/supervisord.conf'))).toBe(true);
    expect(existsSync(join(repoRoot, 'docker/entrypoint-integrated.sh'))).toBe(true);
  });

  test('keeps integrated smoke tests independent from legacy dashboard publish', () => {
    const workflow = readFileSync(join(repoRoot, '.github/workflows/docker-release.yml'), 'utf8');

    expect(workflow).not.toMatch(/publish-integrated:[\s\S]*?needs:\s*\[?publish-dashboard/);
    expect(workflow).toMatch(/smoke-test:[\s\S]*?needs:\s*\[publish-integrated\]/);
  });

  test('verifies immutable and promoted tags without registry credentials', () => {
    const workflow = readFileSync(join(repoRoot, '.github/workflows/docker-release.yml'), 'utf8');

    expect(workflow).toMatch(
      /Verify anonymous pull access[\s\S]*DOCKER_CONFIG="\$\{CLEAN_DOCKER_CONFIG\}" docker pull/
    );
    expect(workflow).toMatch(
      /Verify promoted tags are anonymously pullable[\s\S]*DOCKER_CONFIG="\$\{CLEAN_DOCKER_CONFIG\}" docker pull/
    );
  });
});
