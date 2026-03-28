/**
 * Integration-style test for Node argv alias behavior.
 *
 * This validates the runtime assumption used by target-resolver:
 * when invoked via a `ccsd` symlink, Node preserves the invoked
 * symlink path in process.argv[1].
 */
import { describe, it, expect } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';

function probeArgvPath(aliasBasename: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-ccsd-alias-'));
  const scriptPath = path.join(tmpDir, 'probe.js');
  const aliasPath = path.join(tmpDir, aliasBasename);

  try {
    fs.writeFileSync(scriptPath, 'console.log(process.argv[1]);\n', { encoding: 'utf8' });
    fs.symlinkSync(scriptPath, aliasPath);

    const result = spawnSync('node', [aliasPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    expect(result.status).toBe(0);
    return result.stdout.trim();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function probeArgvPathDirect(filename: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-ccsd-direct-'));
  const scriptPath = path.join(tmpDir, filename);

  try {
    fs.writeFileSync(scriptPath, 'console.log(process.argv[1]);\n', { encoding: 'utf8' });

    const result = spawnSync('node', [scriptPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    expect(result.status).toBe(0);
    return result.stdout.trim();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

describe('ccsd alias integration', () => {
  it('should preserve ccsd symlink basename in argv[1] under node', () => {
    if (process.platform === 'win32') {
      // Windows symlink creation requires elevated privileges/Developer Mode.
      return;
    }

    const argvPath = probeArgvPath('ccsd');
    expect(path.basename(argvPath)).toBe('ccsd');
  });

  it('should preserve ccs-droid symlink basename in argv[1] under node', () => {
    if (process.platform === 'win32') {
      return;
    }

    const argvPath = probeArgvPath('ccs-droid');
    expect(path.basename(argvPath)).toBe('ccs-droid');
  });

  it('should preserve ccs-codex symlink basename in argv[1] under node', () => {
    if (process.platform === 'win32') {
      return;
    }

    const argvPath = probeArgvPath('ccs-codex');
    expect(path.basename(argvPath)).toBe('ccs-codex');
  });

  it('should preserve ccsx symlink basename in argv[1] under node', () => {
    if (process.platform === 'win32') {
      return;
    }

    const argvPath = probeArgvPath('ccsx');
    expect(path.basename(argvPath)).toBe('ccsx');
  });

  it('should preserve extension-style alias basenames for wrapper compatibility', () => {
    const cmdArgvPath = probeArgvPathDirect('ccsd.cmd');
    const ps1ArgvPath = probeArgvPathDirect('ccsd.ps1');
    const explicitCmdArgvPath = probeArgvPathDirect('ccs-droid.cmd');
    const codexCmdArgvPath = probeArgvPathDirect('ccs-codex.cmd');
    const codexShortCmdArgvPath = probeArgvPathDirect('ccsx.cmd');

    expect(path.basename(cmdArgvPath)).toBe('ccsd.cmd');
    expect(path.basename(ps1ArgvPath)).toBe('ccsd.ps1');
    expect(path.basename(explicitCmdArgvPath)).toBe('ccs-droid.cmd');
    expect(path.basename(codexCmdArgvPath)).toBe('ccs-codex.cmd');
    expect(path.basename(codexShortCmdArgvPath)).toBe('ccsx.cmd');
  });
});
