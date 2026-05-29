import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
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

  test('gives the raw integrated image a Docker healthcheck for release smoke tests', () => {
    const dockerfile = readFileSync(join(repoRoot, 'docker/Dockerfile.integrated'), 'utf8');

    expect(dockerfile).toContain('HEALTHCHECK');
    expect(dockerfile).toContain('127.0.0.1:3000');
    expect(dockerfile).toContain('127.0.0.1:8317');
  });

  test('lets network-contract smoke tests avoid fixed host port collisions', () => {
    const compose = readFileSync(join(repoRoot, 'docker/compose.yaml'), 'utf8');
    const contractScript = readFileSync(join(repoRoot, 'tests/docker/network-contract.sh'), 'utf8');

    expect(compose).toContain('${CCS_DASHBOARD_PORT:-3000}:3000');
    expect(compose).toContain('${CCS_CLIPROXY_PORT:-8317}:8317');
    expect(contractScript).toContain('CCS_NETWORK_CONTRACT_DASHBOARD_PORT:-${CCS_DASHBOARD_PORT:-13001}');
    expect(contractScript).toContain('CCS_NETWORK_CONTRACT_CLIPROXY_PORT:-${CCS_CLIPROXY_PORT:-18318}');
    expect(contractScript).toContain('up -d --remove-orphans');
  });

  test('passes collision-safe compose env through network-contract calls', () => {
    const result = spawnSync('bash', ['tests/docker/network-contract-env.test.sh'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    expect(result.status, result.stdout + result.stderr).toBe(0);
  });
});
