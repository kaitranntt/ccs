import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  buildPackageManagerEnv,
  detectCurrentInstall,
  formatManualUpdateCommand,
  readInstalledPackageVersion,
} from '../../../src/utils/package-manager-detector';

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function writePackage(root: string, version: string): void {
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: '@kaitranntt/ccs', version }, null, 2)
  );
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('package-manager-detector', () => {
  it('detects npm installs from the current binary path and keeps the custom prefix', () => {
    const tempRoot = makeTempDir('ccs-install-detector-npm-');
    const packageRoot = join(tempRoot, 'prefix', 'lib', 'node_modules', '@kaitranntt', 'ccs');
    const scriptPath = join(packageRoot, 'dist', 'ccs.js');

    writePackage(packageRoot, '7.67.0-dev.5');

    const install = detectCurrentInstall(scriptPath);

    expect(install.manager).toBe('npm');
    expect(install.prefix).toBe(join(tempRoot, 'prefix'));
    expect(install.packageRoot).toBe(packageRoot);
    expect(readInstalledPackageVersion(install)).toBe('7.67.0-dev.5');
  });

  it('detects bun installs from the resolved package path', () => {
    const tempRoot = makeTempDir('ccs-install-detector-bun-');
    const packageRoot = join(
      tempRoot,
      '.bun',
      'install',
      'global',
      'node_modules',
      '@kaitranntt',
      'ccs'
    );
    const scriptPath = join(packageRoot, 'dist', 'ccs.js');

    writePackage(packageRoot, '7.67.0-dev.9');

    const install = detectCurrentInstall(scriptPath);

    expect(install.manager).toBe('bun');
    expect(install.prefix).toBe(join(tempRoot, '.bun'));
    expect(readInstalledPackageVersion(install)).toBe('7.67.0-dev.9');
  });

  it.if(process.platform !== 'win32')(
    'detects bun installs from a POSIX symlinked ~/.bun/bin/ccs entrypoint',
    () => {
      const tempRoot = makeTempDir('ccs-install-detector-bun-symlink-');
      const packageRoot = join(
        tempRoot,
        '.bun',
        'install',
        'global',
        'node_modules',
        '@kaitranntt',
        'ccs'
      );
      const scriptPath = join(packageRoot, 'dist', 'ccs.js');
      const symlinkPath = join(tempRoot, 'home', '.bun', 'bin', 'ccs');

      writePackage(packageRoot, '7.67.0-dev.9');
      mkdirSync(join(packageRoot, 'dist'), { recursive: true });
      writeFileSync(scriptPath, '#!/usr/bin/env node\n');
      mkdirSync(join(tempRoot, 'home', '.bun', 'bin'), { recursive: true });
      symlinkSync(scriptPath, symlinkPath);

      const install = detectCurrentInstall(symlinkPath);
      const resolvedTempRoot = realpathSync(tempRoot);
      const resolvedScriptPath = realpathSync(scriptPath);

      expect(install.manager).toBe('bun');
      expect(install.prefix).toBe(join(resolvedTempRoot, '.bun'));
      expect(install.resolvedScriptPath).toBe(resolvedScriptPath);
      expect(readInstalledPackageVersion(install)).toBe('7.67.0-dev.9');
    }
  );

  it('detects custom bun install roots that still use install/global/node_modules', () => {
    const tempRoot = makeTempDir('ccs-install-detector-custom-bun-');
    const packageRoot = join(
      tempRoot,
      'custom-bun-root',
      'install',
      'global',
      'node_modules',
      '@kaitranntt',
      'ccs'
    );

    writePackage(packageRoot, '7.67.0-dev.9');

    const install = detectCurrentInstall(join(packageRoot, 'dist', 'ccs.js'));

    expect(install.manager).toBe('bun');
    expect(install.prefix).toBe(join(tempRoot, 'custom-bun-root'));
  });

  it('detects custom yarn global layouts', () => {
    const tempRoot = makeTempDir('ccs-install-detector-custom-yarn-');
    const packageRoot = join(
      tempRoot,
      'custom-yarn-root',
      'global',
      'node_modules',
      '@kaitranntt',
      'ccs'
    );

    writePackage(packageRoot, '7.67.0-dev.9');

    const install = detectCurrentInstall(join(packageRoot, 'dist', 'ccs.js'));

    expect(install.manager).toBe('yarn');
    expect(install.prefix).toBe(join(tempRoot, 'custom-yarn-root'));
  });

  it('detects custom pnpm global layouts that include a store version segment', () => {
    const tempRoot = makeTempDir('ccs-install-detector-custom-pnpm-');
    const packageRoot = join(
      tempRoot,
      'custom-pnpm-root',
      'global',
      '5',
      '.pnpm',
      '@kaitranntt+ccs@7.67.0-dev.9',
      'node_modules',
      '@kaitranntt',
      'ccs'
    );

    writePackage(packageRoot, '7.67.0-dev.9');

    const install = detectCurrentInstall(join(packageRoot, 'dist', 'ccs.js'));

    expect(install.manager).toBe('pnpm');
    expect(install.prefix).toBe(join(tempRoot, 'custom-pnpm-root'));
  });

  it('detects pnpm global layouts without a visible .pnpm segment in the script path', () => {
    const tempRoot = makeTempDir('ccs-install-detector-pnpm-global-flat-');
    const packageRoot = join(
      tempRoot,
      'custom-pnpm-root',
      'global',
      '5',
      'node_modules',
      '@kaitranntt',
      'ccs'
    );

    writePackage(packageRoot, '7.67.0-dev.9');

    const install = detectCurrentInstall(join(packageRoot, 'dist', 'ccs.js'));

    expect(install.manager).toBe('pnpm');
    expect(install.prefix).toBe(join(tempRoot, 'custom-pnpm-root'));
  });

  it('detects pnpm v9+ global store layouts with version and hash segments', () => {
    const tempRoot = makeTempDir('ccs-install-detector-pnpm-global-v11-');
    const packageRoot = join(
      tempRoot,
      'Library',
      'pnpm',
      'global',
      'v11',
      '139e7-1a00df73ffb-064d180929716eff',
      'node_modules',
      '@kaitranntt',
      'ccs'
    );

    writePackage(packageRoot, '7.67.0-dev.9');

    const install = detectCurrentInstall(join(packageRoot, 'dist', 'ccs.js'));

    expect(install.manager).toBe('pnpm');
    expect(install.prefix).toBe(join(tempRoot, 'Library', 'pnpm'));
  });

  it('detects Windows pnpm v10 global store layouts with nested segments', () => {
    const install = detectCurrentInstall(
      'C:/Users/dev/AppData/Local/pnpm/global/v10/b3b1c2de-9f88-4a7e/node_modules/@kaitranntt/ccs/dist/ccs.js'
    );

    expect(install.manager).toBe('pnpm');
    expect(install.prefix).toBe('C:/Users/dev/AppData/Local/pnpm');
  });

  it('still excludes yarn global/lib/node_modules from pnpm detection', () => {
    const install = detectCurrentInstall(
      '/Users/dev/.yarn/global/lib/node_modules/@kaitranntt/ccs/dist/ccs.js'
    );

    expect(install.manager).not.toBe('pnpm');
  });

  it('detects Windows npm globals without a lib directory', () => {
    const install = detectCurrentInstall(
      'C:/Program Files/node-prefix/node_modules/@kaitranntt/ccs/dist/ccs.js'
    );

    expect(install.manager).toBe('npm');
    expect(install.prefix).toBe('C:/Program Files/node-prefix');
  });

  it('formats manual npm update commands with the current prefix', () => {
    const install = {
      manager: 'npm' as const,
      scriptPath: '/tmp/prefix/bin/ccs',
      resolvedScriptPath: '/tmp/prefix/lib/node_modules/@kaitranntt/ccs/dist/ccs.js',
      packageRoot: '/tmp/prefix/lib/node_modules/@kaitranntt/ccs',
      prefix: '/tmp/prefix',
      detectionSource: 'path' as const,
    };

    expect(formatManualUpdateCommand('dev', install)).toBe(
      'NPM_CONFIG_PREFIX=/tmp/prefix npm install -g @kaitranntt/ccs@dev'
    );
  });

  it('formats Windows-safe manual npm update commands for prefixes with spaces', () => {
    const install = {
      manager: 'npm' as const,
      scriptPath: 'C:/Tools/CCS/ccs.cmd',
      resolvedScriptPath: 'C:/Program Files/CCS/lib/node_modules/@kaitranntt/ccs/dist/ccs.js',
      packageRoot: 'C:/Program Files/CCS/lib/node_modules/@kaitranntt/ccs',
      prefix: 'C:/Program Files/CCS',
      detectionSource: 'path' as const,
    };

    expect(formatManualUpdateCommand('dev', install, 'win32')).toBe(
      `powershell -NoProfile -Command "$env:NPM_CONFIG_PREFIX='C:/Program Files/CCS'; npm install -g @kaitranntt/ccs@dev"`
    );
  });

  it('builds manager-specific env overrides for the current install', () => {
    const install = {
      manager: 'npm' as const,
      scriptPath: '/tmp/prefix/bin/ccs',
      resolvedScriptPath: '/tmp/prefix/lib/node_modules/@kaitranntt/ccs/dist/ccs.js',
      packageRoot: '/tmp/prefix/lib/node_modules/@kaitranntt/ccs',
      prefix: '/tmp/prefix',
      detectionSource: 'path' as const,
    };

    const env = buildPackageManagerEnv(install, { PATH: '/usr/bin' });

    expect(env.PATH).toBe('/usr/bin');
    expect(env.npm_config_prefix).toBe('/tmp/prefix');
    expect(env.NPM_CONFIG_PREFIX).toBe('/tmp/prefix');
  });
});
