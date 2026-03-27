import { describe, expect, it } from 'bun:test';
import { DockerExecutor } from '../../../src/docker/docker-executor';
import type { DockerCommandResult } from '../../../src/docker/docker-types';

const fakeAssets = {
  dockerDir: '/tmp/ccs-docker',
  composeFile: '/tmp/ccs-docker/docker-compose.integrated.yml',
  dockerfile: '/tmp/ccs-docker/Dockerfile.integrated',
  supervisordConfig: '/tmp/ccs-docker/supervisord.conf',
  entrypoint: '/tmp/ccs-docker/entrypoint-integrated.sh',
};

type SyncCall = {
  command: string;
  args: string[];
  options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    remote?: boolean;
  };
};

function okResult(remote = false): DockerCommandResult {
  return {
    command: '',
    exitCode: 0,
    stdout: '',
    stderr: '',
    remote,
  };
}

describe('docker executor', () => {
  it('passes compose env and bundled compose file when bringing the stack up locally', async () => {
    const calls: SyncCall[] = [];
    const executor = new DockerExecutor({
      assets: fakeAssets,
      getInstalledCcsVersion: () => '7.59.0',
      resolveLocalComposePrefix: () => ['docker', 'compose'],
      runSync: (command, args, options) => {
        calls.push({ command, args, options });
        return okResult(options?.remote ?? false);
      },
    });

    await executor.up({ port: 4000, proxyPort: 9317 });

    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe('docker');
    expect(calls[0].args).toEqual([
      'compose',
      '-f',
      fakeAssets.composeFile,
      'up',
      '-d',
      '--build',
    ]);
    expect(calls[0].options?.cwd).toBe(fakeAssets.dockerDir);
    expect(calls[0].options?.env?.CCS_NPM_VERSION).toBe('7.59.0');
    expect(calls[0].options?.env?.CCS_DASHBOARD_PORT).toBe('4000');
    expect(calls[0].options?.env?.CCS_CLIPROXY_PORT).toBe('9317');
  });

  it('stages bundled assets before remote compose startup', async () => {
    const calls: SyncCall[] = [];
    const executor = new DockerExecutor({
      assets: fakeAssets,
      getInstalledCcsVersion: () => '7.59.0',
      runSync: (command, args, options) => {
        calls.push({ command, args, options });
        return okResult(options?.remote ?? false);
      },
    });

    await executor.up({ host: 'docker', port: 3000, proxyPort: 8317 });

    expect(calls).toHaveLength(3);
    expect(calls[0]).toEqual({
      command: 'ssh',
      args: ['docker', 'mkdir -p ~/.ccs/docker'],
      options: { remote: true },
    });
    expect(calls[1].command).toBe('scp');
    expect(calls[1].args).toEqual([
      fakeAssets.composeFile,
      fakeAssets.dockerfile,
      fakeAssets.supervisordConfig,
      fakeAssets.entrypoint,
      'docker:~/.ccs/docker/',
    ]);
    expect(calls[1].options).toEqual({ remote: true });
    expect(calls[2].command).toBe('ssh');
    expect(calls[2].args[0]).toBe('docker');
    expect(calls[2].args[1]).toContain("CCS_NPM_VERSION='7.59.0'");
    expect(calls[2].args[1]).toContain("CCS_DASHBOARD_PORT='3000'");
    expect(calls[2].args[1]).toContain("CCS_CLIPROXY_PORT='8317'");
    expect(calls[2].args[1]).toContain('docker-compose version >/dev/null 2>&1');
  });

  it('uses npm install latest rather than npm update during in-container updates', async () => {
    const calls: SyncCall[] = [];
    const executor = new DockerExecutor({
      assets: fakeAssets,
      runSync: (command, args, options) => {
        calls.push({ command, args, options });
        return okResult(options?.remote ?? false);
      },
    });

    await executor.update({});

    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe('docker');
    expect(calls[0].args[0]).toBe('exec');
    expect(calls[0].args[1]).toBe('ccs-cliproxy');
    expect(calls[0].args[4]).toContain('npm install -g @kaitranntt/ccs@latest --force');
    expect(calls[0].args[4]).toContain('ccs cliproxy --latest');
    expect(calls[0].args[4]).toContain(
      'supervisorctl -c /etc/supervisord.conf restart ccs-dashboard cliproxy'
    );
  });

  it('preserves supervisorctl failures in status results for CLI rendering', async () => {
    let callCount = 0;
    const executor = new DockerExecutor({
      assets: fakeAssets,
      resolveLocalComposePrefix: () => ['docker', 'compose'],
      runSync: (_command, args, options) => {
        callCount++;
        if (callCount === 1) {
          expect(args).toEqual(['compose', '-f', fakeAssets.composeFile, 'ps']);
          return {
            command: '',
            exitCode: 0,
            stdout: 'NAME STATUS',
            stderr: '',
            remote: options?.remote ?? false,
          };
        }

        expect(args).toEqual([
          'exec',
          'ccs-cliproxy',
          'supervisorctl',
          '-c',
          '/etc/supervisord.conf',
          'status',
        ]);
        return {
          command: '',
          exitCode: 7,
          stdout: '',
          stderr: 'unix:///var/run/supervisor.sock no such file',
          remote: options?.remote ?? false,
        };
      },
    });

    const status = await executor.status({});

    expect(status.compose.exitCode).toBe(0);
    expect(status.supervisor?.exitCode).toBe(7);
    expect(status.supervisor?.stderr).toContain('supervisor.sock');
  });
});
