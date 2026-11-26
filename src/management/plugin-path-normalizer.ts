import * as path from 'path';
import { getCcsHome } from '../shared/ccs-paths';

function getPluginPathModule(
  targetConfigDir: string,
  input: string
): typeof path.posix | typeof path.win32 {
  return targetConfigDir.includes('\\') || input.includes('\\') ? path.win32 : path.posix;
}

function normalizeTargetConfigDir(targetConfigDir: string, input: string): string {
  const pathModule = getPluginPathModule(targetConfigDir, input);
  return pathModule.normalize(
    pathModule === path.win32
      ? targetConfigDir.replace(/\//g, '\\')
      : targetConfigDir.replace(/\\/g, '/')
  );
}

export function normalizePluginMetadataPathString(
  input: string,
  targetConfigDir = path.join(getCcsHome(), '.claude')
): string {
  const match = input.match(
    /^(.*?)([\\/])(?:\.claude|\.ccs\2shared|\.ccs\2instances\2[^\\/]+)\2plugins(?:(\2.*))?$/
  );

  if (!match) {
    return input;
  }

  const pathModule = getPluginPathModule(targetConfigDir, input);
  const normalizedTargetConfigDir = normalizeTargetConfigDir(targetConfigDir, input);
  const suffix = match[3] ?? '';
  const suffixSegments = suffix.split(/[\\/]+/).filter(Boolean);

  return pathModule.join(normalizedTargetConfigDir, 'plugins', ...suffixSegments);
}

export function normalizePluginMetadataValue(
  value: unknown,
  targetConfigDir: string
): { normalized: unknown; changed: boolean } {
  if (typeof value === 'string') {
    const normalized = normalizePluginMetadataPathString(value, targetConfigDir);
    return { normalized, changed: normalized !== value };
  }

  if (Array.isArray(value)) {
    let changed = false;
    const normalized = value.map((item) => {
      const result = normalizePluginMetadataValue(item, targetConfigDir);
      changed = changed || result.changed;
      return result.normalized;
    });
    return { normalized, changed };
  }

  if (value && typeof value === 'object') {
    let changed = false;
    const normalized = Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => {
        const result = normalizePluginMetadataValue(item, targetConfigDir);
        changed = changed || result.changed;
        return [key, result.normalized];
      })
    );
    return { normalized, changed };
  }

  return { normalized: value, changed: false };
}

export function normalizePluginMetadataContent(
  original: string,
  targetConfigDir = path.join(getCcsHome(), '.claude')
): string {
  const parsed = JSON.parse(original) as unknown;
  const result = normalizePluginMetadataValue(parsed, targetConfigDir);
  return result.changed ? JSON.stringify(result.normalized, null, 2) : original;
}
