import * as path from 'path';
import * as os from 'os';
import { getCcsDir } from '../utils/config-manager';
import { getCodexProfileNameError } from './types';

export function getCodexAuthRegistryPath(): string {
  return path.join(getCcsDir(), 'codex-profiles.yaml');
}

export function getCodexInstancesDir(): string {
  return path.join(getCcsDir(), 'codex-instances');
}

export function resolveCodexProfileDir(name: string): string {
  const nameError = getCodexProfileNameError(name);
  if (nameError) {
    throw new Error(nameError);
  }

  const instancesDir = path.resolve(getCodexInstancesDir());
  const profileDir = path.resolve(path.join(instancesDir, name));
  if (profileDir !== instancesDir && profileDir.startsWith(`${instancesDir}${path.sep}`)) {
    return profileDir;
  }

  throw new Error('Profile directory resolved outside codex-instances.');
}

// Uses os.homedir() intentionally — this is the upstream Codex location,
// not a CCS-owned path. Tests must override the shared config path explicitly.
export function getSharedCodexConfigPath(): string {
  return path.join(os.homedir(), '.codex', 'config.toml');
}
