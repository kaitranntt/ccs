import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { adoptDivergedFileContent } from '../../../src/management/shared-manager/diverged-file-adopter';

function setMtime(filePath: string, mtimeMs: number): void {
  const timestamp = new Date(mtimeMs);
  fs.utimesSync(filePath, timestamp, timestamp);
}

describe('diverged-file-adopter sidecar optimization and retention (Issue #1838)', () => {
  let tempRoot = '';
  let canonicalDir = '';
  let instanceDir = '';

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-adopter-1838-'));
    canonicalDir = path.join(tempRoot, 'claude');
    instanceDir = path.join(tempRoot, 'instance');
    fs.mkdirSync(canonicalDir, { recursive: true });
    fs.mkdirSync(instanceDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('performs O(1) durable temp writes when 100+ sidecars already exist', () => {
    const canonicalPath = path.join(canonicalDir, 'settings.json');
    const divergedPath = path.join(instanceDir, 'settings.json');

    fs.writeFileSync(canonicalPath, JSON.stringify({ theme: 'light' }), 'utf8');
    fs.writeFileSync(divergedPath, JSON.stringify({ theme: 'dark' }), 'utf8');
    setMtime(divergedPath, fs.statSync(canonicalPath).mtimeMs + 5_000);

    // Pre-populate 105 sidecar backups (.bak-ccs-adopt and -1..-104)
    fs.writeFileSync(`${canonicalPath}.bak-ccs-adopt`, JSON.stringify({ gen: 0 }), 'utf8');
    for (let i = 1; i <= 104; i++) {
      fs.writeFileSync(`${canonicalPath}.bak-ccs-adopt-${i}`, JSON.stringify({ gen: i }), 'utf8');
    }

    const originalOpenSync = fs.openSync;
    const originalFsyncSync = fs.fsyncSync;
    const durableTempOpens: string[] = [];
    let fsyncCount = 0;

    const openSpy = spyOn(fs, 'openSync').mockImplementation(((
      openPath: fs.PathLike,
      flags: number | string,
      mode?: fs.Mode
    ) => {
      if (String(openPath).includes('.ccs-write-')) {
        durableTempOpens.push(String(openPath));
      }
      return originalOpenSync(openPath, flags, mode);
    }) as typeof fs.openSync);

    const fsyncSpy = spyOn(fs, 'fsyncSync').mockImplementation(((fd: number) => {
      fsyncCount++;
      return originalFsyncSync(fd);
    }) as typeof fs.fsyncSync);

    try {
      expect(adoptDivergedFileContent(divergedPath, canonicalPath)).toBe('claimed');
    } finally {
      openSpy.mockRestore();
      fsyncSpy.mockRestore();
    }

    // Only 3 durable writes total: 1 canonical backup sidecar + 1 diverged recovery + 1 canonical publish.
    // Crucially, NOT 105+ probing writes.
    expect(durableTempOpens.length).toBe(3);
    expect(fsyncCount).toBe(3);
    expect(JSON.parse(fs.readFileSync(canonicalPath, 'utf8'))).toEqual({ theme: 'dark' });
    // New sidecar jumped directly to index 105
    expect(fs.existsSync(`${canonicalPath}.bak-ccs-adopt-105`)).toBe(true);
    expect(JSON.parse(fs.readFileSync(`${canonicalPath}.bak-ccs-adopt-105`, 'utf8'))).toEqual({
      theme: 'light',
    });
  });

  it('caps retained .bak-ccs-adopt* sidecars at 5 per base file and leaves sibling base files intact', () => {
    const canonicalPath = path.join(canonicalDir, 'settings.json');
    const siblingBackup = path.join(canonicalDir, 'CLAUDE.md.bak-ccs-adopt');
    const divergedPath = path.join(instanceDir, 'settings.json');

    fs.writeFileSync(siblingBackup, 'unrelated-canonical-backup', 'utf8');
    fs.writeFileSync(canonicalPath, JSON.stringify({ generation: 100 }), 'utf8');
    fs.writeFileSync(`${canonicalPath}.bak-ccs-adopt`, JSON.stringify({ generation: 0 }), 'utf8');
    for (let i = 1; i <= 10; i++) {
      fs.writeFileSync(
        `${canonicalPath}.bak-ccs-adopt-${i}`,
        JSON.stringify({ generation: i }),
        'utf8'
      );
    }

    fs.writeFileSync(divergedPath, JSON.stringify({ generation: 101 }), 'utf8');
    setMtime(divergedPath, fs.statSync(canonicalPath).mtimeMs + 5_000);

    expect(adoptDivergedFileContent(divergedPath, canonicalPath)).toBe('claimed');

    const remainingSidecars = fs
      .readdirSync(canonicalDir)
      .filter((entry) => entry.startsWith('settings.json.bak-ccs-adopt'))
      .sort();

    expect(remainingSidecars.length).toBe(5);
    expect(remainingSidecars).toEqual([
      'settings.json.bak-ccs-adopt-10',
      'settings.json.bak-ccs-adopt-11',
      'settings.json.bak-ccs-adopt-7',
      'settings.json.bak-ccs-adopt-8',
      'settings.json.bak-ccs-adopt-9',
    ]);
    expect(fs.existsSync(siblingBackup)).toBe(true);
  });

  it('maintains retention cap <= 5 across repeated sequential adoptions', () => {
    const canonicalPath = path.join(canonicalDir, 'settings.json');
    const divergedPath = path.join(instanceDir, 'settings.json');
    fs.writeFileSync(canonicalPath, JSON.stringify({ step: 0 }), 'utf8');
    let nextMtime = fs.statSync(canonicalPath).mtimeMs + 2_000;

    for (let step = 1; step <= 8; step++) {
      fs.writeFileSync(divergedPath, JSON.stringify({ step }), 'utf8');
      setMtime(divergedPath, nextMtime);
      nextMtime += 2_000;
      expect(adoptDivergedFileContent(divergedPath, canonicalPath)).toBe('claimed');
    }

    const sidecars = fs
      .readdirSync(canonicalDir)
      .filter((entry) => entry.startsWith('settings.json.bak-ccs-adopt'));
    expect(sidecars.length).toBeLessThanOrEqual(5);
    expect(sidecars.sort()).toEqual([
      'settings.json.bak-ccs-adopt-3',
      'settings.json.bak-ccs-adopt-4',
      'settings.json.bak-ccs-adopt-5',
      'settings.json.bak-ccs-adopt-6',
      'settings.json.bak-ccs-adopt-7',
    ]);
    expect(JSON.parse(fs.readFileSync(canonicalPath, 'utf8'))).toEqual({ step: 8 });
  });

  it('adopts .last_inuse_sweep safely without creating sidecar backup files', () => {
    const canonicalPath = path.join(canonicalDir, '.last_inuse_sweep');
    const divergedPath = path.join(instanceDir, '.last_inuse_sweep');

    fs.writeFileSync(canonicalPath, '2026-10-01T00:00:00.000Z', 'utf8');
    fs.writeFileSync(divergedPath, '2026-10-20T00:00:00.000Z', 'utf8');
    setMtime(divergedPath, fs.statSync(canonicalPath).mtimeMs + 5_000);

    expect(adoptDivergedFileContent(divergedPath, canonicalPath)).toBe('claimed');

    expect(fs.readFileSync(canonicalPath, 'utf8')).toBe('2026-10-20T00:00:00.000Z');
    expect(fs.existsSync(divergedPath)).toBe(false);
    expect(
      fs.readdirSync(canonicalDir).filter((entry) => entry.includes('bak-ccs-adopt'))
    ).toEqual([]);
    expect(
      fs.readdirSync(instanceDir).filter((entry) => entry.includes('ccs-adopted-recovery'))
    ).toEqual([]);
  });

  it('drops stale .last_inuse_sweep without creating recovery sidecars', () => {
    const canonicalPath = path.join(canonicalDir, '.last_inuse_sweep');
    const divergedPath = path.join(instanceDir, '.last_inuse_sweep');

    fs.writeFileSync(canonicalPath, '2026-10-20T00:00:00.000Z', 'utf8');
    fs.writeFileSync(divergedPath, '2026-10-01T00:00:00.000Z', 'utf8');
    setMtime(divergedPath, fs.statSync(canonicalPath).mtimeMs - 5_000);

    expect(adoptDivergedFileContent(divergedPath, canonicalPath)).toBe('claimed');

    expect(fs.readFileSync(canonicalPath, 'utf8')).toBe('2026-10-20T00:00:00.000Z');
    expect(
      fs
        .readdirSync(instanceDir)
        .filter(
          (entry) => entry.includes('ccs-adopt-recovery') || entry.includes('ccs-adopted-recovery')
        )
    ).toEqual([]);
    expect(
      fs.readdirSync(canonicalDir).filter((entry) => entry.includes('bak-ccs-adopt'))
    ).toEqual([]);
  });
});
