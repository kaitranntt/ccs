import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

/**
 * Publish complete JSON by same-directory rename, preserving destination permissions.
 * Readers see either document, never a partial write. Callers own writer locking.
 * This guarantees atomic visibility, not fsync-backed crash durability.
 * @param filePath Destination file.
 * @param value JSON-serializable object to publish.
 */
export function writeAtomicJsonFile(filePath: string, value: Record<string, unknown>): void {
  const content = JSON.stringify(value, null, 2) + '\n';
  let mode = 0o600;
  try {
    mode = fs.statSync(filePath).mode & 0o777;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const tempPath = path.join(
    path.dirname(filePath),
    `${path.basename(filePath)}.tmp-${randomUUID()}`
  );
  let descriptor: number | undefined;
  let ownsTemp = false;
  try {
    descriptor = fs.openSync(tempPath, 'wx', 0o600);
    ownsTemp = true;
    fs.writeFileSync(descriptor, content, 'utf8');
    fs.fchmodSync(descriptor, mode);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(tempPath, filePath);
  } finally {
    // Never recover by writing/truncating the destination itself.
    try {
      if (descriptor !== undefined) fs.closeSync(descriptor);
    } finally {
      if (ownsTemp) {
        try {
          fs.unlinkSync(tempPath);
        } catch {
          // Rename already removed the temp, or cleanup is unavailable.
        }
      }
    }
  }
}
