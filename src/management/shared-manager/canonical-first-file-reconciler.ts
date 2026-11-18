import * as fs from 'fs';
import * as path from 'path';

import { info, warn } from '../../utils/ui';
import ProfileRegistry from '../../auth/profile-registry';
import { isProfileLocalSharedResourceMode } from '../../auth/shared-resource-policy';
import {
  isSafeAccountInstancePath,
  listAccountInstancePaths,
  normalizeAccountInstanceName,
} from '../instance-directory';
import { adoptDivergedFileContent } from './diverged-file-adopter';
import { getLstatSync } from './fs-helpers';
import {
  claimCanonicalFirstCopy,
  readRegularFileContent,
  recoverInterruptedClaims,
} from './canonical-first-file-claims';

interface CanonicalFirstRoots {
  claudeDir: string;
  sharedDir: string;
  instancesDir: string;
}

function candidatePaths(roots: CanonicalFirstRoots, fileName: string): string[] {
  const profiles = new ProfileRegistry().getAllProfilesMerged();
  const profilesByInstanceName = new Map<string, Array<(typeof profiles)[string]>>();
  for (const [profileName, profile] of Object.entries(profiles)) {
    const instanceName = normalizeAccountInstanceName(profileName);
    const matches = profilesByInstanceName.get(instanceName) ?? [];
    matches.push(profile);
    profilesByInstanceName.set(instanceName, matches);
  }

  return [
    path.join(roots.sharedDir, fileName),
    ...listAccountInstancePaths(roots.instancesDir)
      .filter((instancePath) => {
        const instanceName = normalizeAccountInstanceName(path.basename(instancePath));
        const matches = profilesByInstanceName.get(instanceName) ?? [];
        if (matches.length > 1) return false;
        return matches.length === 0 || !isProfileLocalSharedResourceMode(matches[0]);
      })
      .map((instancePath) => path.join(instancePath, fileName)),
  ];
}

/**
 * True when this regular file is the one the canonical path resolves to. Such a
 * file is not a copy of the canonical content; it is that content, so it always
 * compares equal to itself and claiming it would delete it. Real paths are
 * compared as bytes from the native resolver: the JS resolver collapses `..`
 * before following links, and decoded strings can collide on invalid UTF-8.
 */
function isCanonicalTarget(filePath: string, canonicalPath: string): boolean {
  try {
    return (
      fs.lstatSync(filePath).isFile() &&
      fs.realpathSync
        .native(filePath, 'buffer')
        .equals(fs.realpathSync.native(canonicalPath, 'buffer'))
    );
  } catch {
    return false;
  }
}

function reconcileCandidatesAgainstCanonical(
  canonicalPath: string,
  candidates: readonly string[]
): void {
  let canonicalContent: Buffer | null = null;
  try {
    canonicalContent = fs.readFileSync(canonicalPath);
  } catch {
    // A present but unreadable or dangling canonical path still owns precedence.
  }

  for (const candidatePath of candidates) {
    if (isCanonicalTarget(candidatePath, canonicalPath)) continue;
    claimCanonicalFirstCopy(
      candidatePath,
      canonicalContent,
      `Canonical ${path.basename(canonicalPath)} wins over divergent copy at ${candidatePath}`
    );
  }
}

/**
 * Reconcile a canonical-first shared file before any seed or symlink mutation.
 * Existing canonical content always wins. With no canonical, one unique byte
 * variant is adopted; conflicting variants are all quarantined for recovery.
 */
export function reconcileCanonicalFirstFile(roots: CanonicalFirstRoots, fileName: string): void {
  const canonicalPath = path.join(roots.claudeDir, fileName);
  const candidates = candidatePaths(roots, fileName);
  for (const candidatePath of candidates) {
    if (candidatePath !== path.join(roots.sharedDir, fileName)) {
      const instancePath = path.dirname(candidatePath);
      if (!isSafeAccountInstancePath(roots.instancesDir, instancePath)) continue;
    }
    recoverInterruptedClaims(candidatePath);
  }

  if (getLstatSync(canonicalPath)) {
    reconcileCandidatesAgainstCanonical(canonicalPath, candidates);
    return;
  }

  const variants: Array<{ path: string; content: Buffer }> = [];
  for (const candidatePath of candidates) {
    const content = readRegularFileContent(candidatePath);
    if (content) variants.push({ path: candidatePath, content });
  }
  if (variants.length === 0) return;

  const uniqueContents: Buffer[] = [];
  for (const variant of variants) {
    if (!uniqueContents.some((content) => content.equals(variant.content))) {
      uniqueContents.push(variant.content);
    }
  }

  if (uniqueContents.length === 1) {
    adoptDivergedFileContent(variants[0].path, canonicalPath);
    reconcileCandidatesAgainstCanonical(canonicalPath, candidates);
    console.log(info(`Adopted the only existing ${fileName} variant as canonical content`));
    return;
  }

  for (const variant of variants) {
    claimCanonicalFirstCopy(
      variant.path,
      null,
      `Conflicting ${fileName} variants found while no canonical file exists`
    );
  }
  console.log(
    warn(
      `No ${fileName} variant was selected; recover one of the .ccs-shared-conflict files explicitly`
    )
  );
}

/**
 * Preserve a later divergent copy without allowing it to replace canonical content.
 * Returns true when the caller must not remove the path: it was claimed, or it is
 * the file the canonical path resolves to.
 */
export function preserveCanonicalFirstDivergence(
  divergedPath: string,
  canonicalPath: string
): boolean {
  if (isCanonicalTarget(divergedPath, canonicalPath)) {
    console.log(warn(`Keeping ${divergedPath}: ${canonicalPath} resolves to it`));
    return true;
  }

  let canonicalContent: Buffer | null = null;
  try {
    canonicalContent = fs.readFileSync(canonicalPath);
  } catch {
    // Preserve the divergence when canonical cannot be compared safely.
  }

  return claimCanonicalFirstCopy(
    divergedPath,
    canonicalContent,
    `Canonical ${path.basename(canonicalPath)} wins over divergent copy at ${divergedPath}`
  );
}
