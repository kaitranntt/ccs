import * as fs from 'fs';
import * as path from 'path';

import { info, warn } from '../../utils/ui';
import { getLstatSync } from './fs-helpers';

export type DivergedFileAdoption = 'not-claimed' | 'claimed';

let adoptionClaimSequence = 0;

function resolveLexicalSymlinkChain(targetPath: string): string {
  let currentPath = path.resolve(targetPath);
  const visited = new Set<string>();
  while (true) {
    if (visited.has(currentPath)) {
      throw Object.assign(new TypeError(`Symlink loop while resolving ${targetPath}`), {
        code: 'ELOOP',
      });
    }
    visited.add(currentPath);

    const stats = getLstatSync(currentPath);
    if (!stats?.isSymbolicLink()) return currentPath;
    currentPath = path.resolve(path.dirname(currentPath), fs.readlinkSync(currentPath));
  }
}

export function assertAdoptionPathAbsent(
  managedPath: string,
  adoption: DivergedFileAdoption
): void {
  if (adoption === 'claimed' && getLstatSync(managedPath)) {
    throw Object.assign(new TypeError(`Path reappeared during reconciliation: ${managedPath}`), {
      code: 'EEXIST',
    });
  }
}

export function recoverOrphanedCanonicalClaim(canonicalPath: string): boolean {
  const writePath = resolveLexicalSymlinkChain(canonicalPath);
  const directory = path.dirname(writePath);
  const prefix = `${path.basename(writePath)}.ccs-canonical-claim-`;
  let candidates: string[];
  try {
    candidates = fs
      .readdirSync(directory)
      .filter((entry) => entry.startsWith(prefix))
      .map((entry) => path.join(directory, entry))
      .filter((entryPath) => fs.lstatSync(entryPath).isFile())
      .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
  const claimPath = candidates[0];
  if (!claimPath) return false;

  let recovered = false;
  if (!getLstatSync(writePath)) {
    fs.linkSync(claimPath, writePath);
    fs.unlinkSync(claimPath);
    candidates.shift();
    recovered = true;
    console.log(warn(`Recovered interrupted canonical adoption at ${canonicalPath}`));
  }

  for (const leftoverClaim of candidates) {
    const recoveryBase = `${writePath}.ccs-canonical-recovery`;
    let sequence = 0;
    while (true) {
      const recoveryPath = sequence === 0 ? recoveryBase : `${recoveryBase}-${sequence}`;
      try {
        fs.linkSync(leftoverClaim, recoveryPath);
        fs.unlinkSync(leftoverClaim);
        console.log(warn(`Quarantined interrupted canonical claim at ${recoveryPath}`));
        break;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
        sequence++;
      }
    }
  }
  return recovered;
}

function preserveClaim(claimPath: string, divergedPath: string, reason: string): string {
  const recoveryBase = `${divergedPath}.ccs-adopt-recovery`;
  let sequence = 0;
  while (true) {
    const recoveryPath = sequence === 0 ? recoveryBase : `${recoveryBase}-${sequence}`;
    try {
      // link() is an atomic no-replace operation, so concurrent CCS
      // processes cannot overwrite each other's recovery artifacts.
      fs.linkSync(claimPath, recoveryPath);
      try {
        fs.unlinkSync(claimPath);
      } catch {
        // Both names preserve the same bytes; leaving the claim is safe.
      }
      console.log(warn(`${reason}; preserved content at ${recoveryPath}`));
      return recoveryPath;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EEXIST') {
        sequence++;
        continue;
      }
      console.log(warn(`${reason}; content remains at ${claimPath}${code ? ` (${code})` : ''}`));
      return claimPath;
    }
  }
}

function validateManagedJson(filePath: string, content: Buffer): boolean {
  if (path.extname(filePath).toLowerCase() !== '.json') {
    return true;
  }

  try {
    const parsed = JSON.parse(content.toString('utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return false;
    }

    if (path.basename(filePath) === 'installed_plugins.json') {
      const registry = parsed as Record<string, unknown>;
      return (
        typeof registry.plugins === 'object' &&
        registry.plugins !== null &&
        !Array.isArray(registry.plugins)
      );
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Identity of the canonical inode as it was read. Publication compares it
 * again immediately before replacing the file, so a concurrent writer is
 * detected instead of silently overwritten.
 */
interface CanonicalIdentity {
  ino: number;
  mtimeMs: number;
  size: number;
}

function canonicalIdentityOf(stats: fs.Stats): CanonicalIdentity {
  return { ino: stats.ino, mtimeMs: stats.mtimeMs, size: stats.size };
}

function canonicalIdentityMatches(
  expected: CanonicalIdentity | null,
  current: CanonicalIdentity | null
): boolean {
  if (!expected || !current) return expected === current;
  return (
    expected.ino === current.ino &&
    expected.mtimeMs === current.mtimeMs &&
    expected.size === current.size
  );
}

/**
 * Create a file only if the path is free, writing the content atomically.
 *
 * link() is an atomic no-replace operation, so concurrent CCS processes
 * cannot overwrite each other's sidecar artifacts.
 */
function createFileNoReplace(targetPath: string, content: Buffer, mode: number): void {
  const tempPath = `${targetPath}.ccs-write-${process.pid}-${Date.now()}-${adoptionClaimSequence++}`;
  let descriptor: number | null = null;
  try {
    descriptor = fs.openSync(tempPath, 'wx', mode);
    fs.fchmodSync(descriptor, mode);
    fs.writeFileSync(descriptor, content);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    fs.linkSync(tempPath, targetPath);
    fs.unlinkSync(tempPath);
  } catch (err) {
    if (descriptor !== null) {
      fs.closeSync(descriptor);
    }
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // The temp file may not have been created or may already have been renamed.
    }
    throw err;
  }
}

/**
 * Publish a sidecar next to a managed file, never replacing an existing one.
 * Numbered suffixes keep every concurrent writer's artifact recoverable.
 */
function publishSidecarNoReplace(basePath: string, content: Buffer, mode: number): string {
  let sequence = 0;
  while (true) {
    const sidecarPath = sequence === 0 ? basePath : `${basePath}-${sequence}`;
    try {
      createFileNoReplace(sidecarPath, content, mode);
      return sidecarPath;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      sequence++;
    }
  }
}

/**
 * Publish adopted content onto the canonical path by replacement.
 *
 * The canonical path is never emptied: a fully written temp file is renamed
 * over it, so no window exists in which Claude Code or a second `ccs` can
 * observe the path as missing and seed an empty placeholder there.
 *
 * A compare-and-swap guard runs as late as possible - after the temp file is
 * durable, immediately before the rename. When the canonical inode changed
 * since it was read, publication is refused rather than clobbering a writer
 * that got there first; the adopted bytes stay in the sidecars the caller
 * published. A pure chmod is not a content change, so the mode the inode
 * carries at publication time wins.
 */
function publishCanonicalContent(
  writePath: string,
  content: Buffer,
  mode: number,
  expected: CanonicalIdentity | null
): void {
  const tempPath = `${writePath}.ccs-write-${process.pid}-${Date.now()}-${adoptionClaimSequence++}`;
  let descriptor: number | null = null;
  try {
    descriptor = fs.openSync(tempPath, 'wx', mode);
    fs.fchmodSync(descriptor, mode);
    fs.writeFileSync(descriptor, content);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;

    const currentStats = getLstatSync(writePath);
    const current = currentStats?.isFile() ? canonicalIdentityOf(currentStats) : null;
    if (!canonicalIdentityMatches(expected, current)) {
      throw Object.assign(new TypeError(`Canonical file changed during adoption: ${writePath}`), {
        code: 'EEXIST',
      });
    }

    const publishMode = currentStats ? currentStats.mode & 0o777 : mode;
    if (publishMode !== mode) {
      fs.chmodSync(tempPath, publishMode);
    }
    fs.renameSync(tempPath, writePath);
  } catch (err) {
    if (descriptor !== null) {
      fs.closeSync(descriptor);
    }
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // The temp file may not have been created or may already have been renamed.
    }
    throw err;
  }
}

function getCanonicalFile(canonicalPath: string): {
  content: Buffer | null;
  identity: CanonicalIdentity | null;
  mode: number;
  mtimeMs: number | null;
  writePath: string;
} {
  const canonicalLstat = getLstatSync(canonicalPath);
  if (!canonicalLstat) {
    return { content: null, identity: null, mode: 0o600, mtimeMs: null, writePath: canonicalPath };
  }

  let writePath = canonicalPath;
  if (canonicalLstat.isSymbolicLink()) {
    writePath = fs.realpathSync.native(canonicalPath);
  }

  const canonicalStats = fs.statSync(canonicalPath);
  if (!canonicalStats.isFile()) {
    throw Object.assign(new TypeError(`Canonical path is not a regular file: ${canonicalPath}`), {
      code: 'EINVAL',
    });
  }

  // The identity describes the inode as of the stat above, taken before the
  // content read: a write landing in between leaves us holding newer bytes
  // than the identity describes, and publication fails closed.
  return {
    content: fs.readFileSync(writePath),
    identity: canonicalIdentityOf(canonicalStats),
    mode: canonicalStats.mode & 0o777,
    mtimeMs: canonicalStats.mtimeMs,
    writePath,
  };
}

export function adoptDivergedFileContent(
  divergedPath: string,
  canonicalPath: string
): DivergedFileAdoption {
  const initialStats = getLstatSync(divergedPath);
  if (!initialStats?.isFile()) {
    return 'not-claimed';
  }

  const claimPath = `${divergedPath}.ccs-adopt-claim-${process.pid}-${Date.now()}-${adoptionClaimSequence++}`;
  try {
    fs.renameSync(divergedPath, claimPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    console.log(
      warn(
        `Unable to claim diverged ${divergedPath}; preserving original${code ? ` (${code})` : ''}`
      )
    );
    throw err;
  }

  let divergencePreserved = false;
  try {
    const claimedStats = fs.lstatSync(claimPath);
    if (!claimedStats.isFile()) {
      preserveClaim(claimPath, divergedPath, `Refusing non-regular divergence at ${divergedPath}`);
      divergencePreserved = true;
      throw Object.assign(new TypeError(`Refusing non-regular divergence at ${divergedPath}`), {
        code: 'EINVAL',
      });
    }

    if (getLstatSync(divergedPath)) {
      preserveClaim(claimPath, divergedPath, `Concurrent replacement detected at ${divergedPath}`);
      divergencePreserved = true;
      throw Object.assign(new TypeError(`Concurrent replacement detected at ${divergedPath}`), {
        code: 'EEXIST',
      });
    }

    const diverged = fs.readFileSync(claimPath);
    if (!validateManagedJson(divergedPath, diverged)) {
      preserveClaim(claimPath, divergedPath, `Refusing malformed managed JSON at ${divergedPath}`);
      return 'claimed';
    }

    const canonical = getCanonicalFile(canonicalPath);
    if (canonical.content) {
      if (diverged.equals(canonical.content)) {
        fs.unlinkSync(claimPath);
        return 'claimed';
      }
      if (claimedStats.mtimeMs <= (canonical.mtimeMs ?? 0)) {
        preserveClaim(
          claimPath,
          divergedPath,
          `Refusing stale or ambiguously-timed divergence at ${divergedPath}`
        );
        return 'claimed';
      }
      // Publish the pre-image before the canonical file is replaced, so an
      // interruption mid-publication still leaves the old content recoverable.
      publishSidecarNoReplace(`${canonicalPath}.bak-ccs-adopt`, canonical.content, canonical.mode);
    }
    publishSidecarNoReplace(
      `${divergedPath}.ccs-adopted-recovery`,
      diverged,
      claimedStats.mode & 0o777
    );

    publishCanonicalContent(canonical.writePath, diverged, canonical.mode, canonical.identity);
    if (!fs.readFileSync(canonicalPath).equals(diverged)) {
      throw Object.assign(
        new TypeError(`Canonical adoption postcondition failed: ${canonicalPath}`),
        {
          code: 'EAGAIN',
        }
      );
    }
    if (getLstatSync(divergedPath)) {
      preserveClaim(claimPath, divergedPath, `Concurrent replacement detected at ${divergedPath}`);
      divergencePreserved = true;
      throw Object.assign(new TypeError(`Concurrent replacement detected at ${divergedPath}`), {
        code: 'EEXIST',
      });
    }
    fs.unlinkSync(claimPath);
    console.log(
      info(`Adopted diverged ${path.basename(divergedPath)} content into ${canonicalPath}`)
    );
    return 'claimed';
  } catch (err) {
    if (divergencePreserved) {
      throw err;
    }
    if (!getLstatSync(divergedPath)) {
      try {
        fs.renameSync(claimPath, divergedPath);
      } catch {
        preserveClaim(claimPath, divergedPath, `Unable to restore diverged ${divergedPath}`);
      }
    } else {
      preserveClaim(claimPath, divergedPath, `Unable to restore diverged ${divergedPath}`);
    }
    throw err;
  }
}
