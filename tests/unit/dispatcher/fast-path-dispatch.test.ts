import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isFastMetadataCommand } from '../../../src/dispatcher/cli-argument-parser';

const repoRoot = path.resolve(import.meta.dir, '../../..');
const ccsEntry = path.join(repoRoot, 'src/ccs.ts');

describe('fast-path metadata dispatch', () => {
  it('classifies fast metadata root commands without capturing normal profiles', () => {
    for (const token of ['--version', '-v', 'version', '--help', '-h', 'help', '__complete']) {
      expect(isFastMetadataCommand([token])).toBe(true);
    }

    for (const token of ['glm', 'config', 'doctor', 'migrate', 'api', '']) {
      expect(isFastMetadataCommand([token])).toBe(false);
    }
    expect(isFastMetadataCommand([])).toBe(false);
  });

  it('serves --version, --help, and __complete without creating recovery files in CCS_HOME', () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-fast-path-'));
    try {
      const env = {
        ...process.env,
        CCS_HOME: tempHome,
        NO_COLOR: '1',
      };

      const versionRun = spawnSync(process.execPath, [ccsEntry, '--version'], {
        cwd: repoRoot,
        encoding: 'utf8',
        env,
      });
      expect(versionRun.status, versionRun.stderr).toBe(0);
      expect(versionRun.stdout).toContain('CCS (Claude Codex Switch)');

      const helpRun = spawnSync(process.execPath, [ccsEntry, '--help'], {
        cwd: repoRoot,
        encoding: 'utf8',
        env,
      });
      expect(helpRun.status, helpRun.stderr).toBe(0);
      expect(helpRun.stdout).toContain('Usage');

      const completeRun = spawnSync(
        process.execPath,
        [ccsEntry, '__complete', '--shell', 'bash', '--current', 'do', '--'],
        {
          cwd: repoRoot,
          encoding: 'utf8',
          env,
        }
      );
      expect(completeRun.status, completeRun.stderr).toBe(0);
      expect(completeRun.stdout).toContain('doctor');

      expect(fs.existsSync(path.join(tempHome, '.ccs', 'config.yaml'))).toBe(false);
      expect(fs.existsSync(path.join(tempHome, '.ccs', 'profiles.json'))).toBe(false);
    } finally {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });
});
