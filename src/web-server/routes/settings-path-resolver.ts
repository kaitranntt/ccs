/**
 * Settings path resolution, symlink-safe CCS confinement, file locking, and access guards.
 */

import { Request, Response } from 'express';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { withSyncLockRetry } from '../../utils/sync-lock-retry';
import { listVariants } from '../../cliproxy/services/variant-service';
import {
  isLoopbackRemoteAddress,
  requireLocalAccessWhenAuthDisabled,
} from '../middleware/auth-middleware';
import type { Settings } from '../../types/config';
import type { CLIProxyProvider } from '../../cliproxy/types';
import { mapExternalProviderName } from '../../cliproxy/provider-capabilities';
import { resolveProviderSettingsPath } from '../../cliproxy/config/env-builder';
import { expandPath } from '../../utils/helpers';
import { extractProviderFromPathname } from '../../cliproxy/ai-providers/model-id-normalizer';
import { ConfigError, ValidationError } from '../../errors/error-types';
import {
  getCcsDir,
  isDashboardAuthEnabled,
  loadConfigSafe,
} from '../../config/config-loader-facade';

const SETTINGS_IDENTIFIER_PATTERN = /^[a-zA-Z][a-zA-Z0-9._-]*$/;

function resolvePathWithin(basePath: string, targetPath: string): string {
  const resolvedBase = path.resolve(basePath);
  const resolvedTarget = path.resolve(
    path.isAbsolute(targetPath) ? targetPath : path.join(resolvedBase, targetPath)
  );
  if (!isPathWithin(resolvedBase, resolvedTarget)) {
    throw new ConfigError('Invalid settings path', targetPath);
  }
  return resolvedTarget;
}

function normalizePathForComparison(targetPath: string): string {
  const resolvedPath = path.resolve(targetPath);
  return process.platform === 'win32' ? resolvedPath.toLowerCase() : resolvedPath;
}

function isPathWithin(basePath: string, targetPath: string): boolean {
  const normalizedBase = normalizePathForComparison(basePath);
  const normalizedTarget = normalizePathForComparison(targetPath);
  const relative = path.relative(normalizedBase, normalizedTarget);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function safeRealPath(targetPath: string): string | null {
  try {
    return fs.realpathSync.native(targetPath);
  } catch {
    return null;
  }
}

function getRealCcsDir(): string {
  return safeRealPath(getCcsDir()) ?? path.resolve(getCcsDir());
}

function requirePathWithinRealCcsDir(targetPath: string): void {
  if (!isPathWithin(getRealCcsDir(), targetPath)) {
    throw new ConfigError('Invalid settings path', targetPath);
  }
}

export function requireExistingSettingsPathWithinCcs(settingsPath: string): boolean {
  const realSettingsPath = safeRealPath(settingsPath);
  if (!realSettingsPath) {
    return false;
  }

  requirePathWithinRealCcsDir(realSettingsPath);
  return true;
}

function findExistingParentRealPath(targetPath: string): string | null {
  let currentPath = path.dirname(targetPath);

  while (true) {
    const realParentPath = safeRealPath(currentPath);
    if (realParentPath) {
      return realParentPath;
    }

    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return null;
    }
    currentPath = parentPath;
  }
}

export function requireWritableSettingsPathWithinCcs(settingsPath: string): void {
  const realSettingsPath = safeRealPath(settingsPath);
  if (realSettingsPath) {
    requirePathWithinRealCcsDir(realSettingsPath);
    return;
  }

  const realParentPath = findExistingParentRealPath(settingsPath);
  if (!realParentPath) {
    throw new ConfigError('Invalid settings path', settingsPath);
  }
  requirePathWithinRealCcsDir(realParentPath);
}

function resolveSettingsCandidatePath(ccsDir: string, settingsPath: string): string {
  return resolvePathWithin(ccsDir, expandPath(settingsPath));
}

export function requireSensitiveLocalAccess(req: Request, res: Response): boolean {
  return requireLocalAccessWhenAuthDisabled(
    req,
    res,
    'Sensitive settings endpoints require localhost access when dashboard auth is disabled.'
  );
}

export function canResolveSensitiveRuntimeStatus(req: Request): boolean {
  if (isDashboardAuthEnabled()) {
    return true;
  }

  return isLoopbackRemoteAddress(req.socket.remoteAddress);
}

export function classifyConfigSaveFailure(error: unknown): { statusCode: number; message: string } {
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  if (message.includes('failed to acquire config lock')) {
    return { statusCode: 409, message: 'Configuration is busy. Retry in a moment.' };
  }
  if (message.includes('eacces') || message.includes('eperm') || message.includes('permission')) {
    return { statusCode: 403, message: 'Insufficient permission to update configuration.' };
  }
  if (message.includes('enospc') || message.includes('no space left')) {
    return { statusCode: 507, message: 'Insufficient disk space to update configuration.' };
  }

  return { statusCode: 500, message: 'Failed to update Antigravity power user mode.' };
}

/**
 * Resolve settings path for profile or variant.
 * Variants have settings paths in config; regular profiles use {name}.settings.json.
 */
export function resolveSettingsPath(profileOrVariant: string): string {
  if (!SETTINGS_IDENTIFIER_PATTERN.test(profileOrVariant)) {
    throw new ValidationError('Invalid profile name', 'profile');
  }

  const ccsDir = getCcsDir();
  const resolvedCcsDir = path.resolve(ccsDir);

  const directProvider = mapExternalProviderName(profileOrVariant);
  if (directProvider) {
    if (profileOrVariant !== directProvider) {
      return resolvePathWithin(
        resolvedCcsDir,
        path.join(resolvedCcsDir, `${profileOrVariant}.settings.json`)
      );
    }
    return resolvePathWithin(resolvedCcsDir, resolveProviderSettingsPath(directProvider));
  }

  const variants = listVariants();
  const variant = variants[profileOrVariant];
  if (variant?.settings) {
    return resolveSettingsCandidatePath(resolvedCcsDir, variant.settings);
  }

  let configuredSettingsPath: string | undefined;
  try {
    configuredSettingsPath = loadConfigSafe().profiles[profileOrVariant];
  } catch {
    // Fall back to the conventional ~/.ccs/<profile>.settings.json path below.
  }
  if (typeof configuredSettingsPath === 'string' && configuredSettingsPath.trim().length > 0) {
    return resolveSettingsCandidatePath(resolvedCcsDir, configuredSettingsPath);
  }

  return resolvePathWithin(
    resolvedCcsDir,
    path.join(resolvedCcsDir, `${profileOrVariant}.settings.json`)
  );
}

export function resolveProviderForProfile(profileOrVariant: string): CLIProxyProvider | null {
  const directProvider = mapExternalProviderName(profileOrVariant);
  if (directProvider) {
    return directProvider;
  }

  const variants = listVariants();
  const variantProvider = variants[profileOrVariant]?.provider;
  if (typeof variantProvider === 'string') {
    return mapExternalProviderName(variantProvider);
  }

  return null;
}

function resolveProviderFromBaseUrl(baseUrl: unknown): CLIProxyProvider | null {
  if (typeof baseUrl !== 'string' || baseUrl.trim().length === 0) {
    return null;
  }

  try {
    const parsed = new URL(baseUrl);
    const extracted = extractProviderFromPathname(parsed.pathname);
    return extracted ? mapExternalProviderName(extracted) : null;
  } catch {
    const extracted = extractProviderFromPathname(baseUrl);
    return extracted ? mapExternalProviderName(extracted) : null;
  }
}

export function resolveProviderForSettings(
  profileOrVariant: string,
  settings?: Pick<Settings, 'env'>
): CLIProxyProvider | null {
  const providerFromProfile = resolveProviderForProfile(profileOrVariant);
  if (providerFromProfile) {
    return providerFromProfile;
  }

  const baseUrl =
    settings?.env && typeof settings.env === 'object' ? settings.env.ANTHROPIC_BASE_URL : undefined;
  return resolveProviderFromBaseUrl(baseUrl);
}

export function writeSettingsTextAtomically(settingsPath: string, content: string): void {
  requireWritableSettingsPathWithinCcs(settingsPath);
  const tempPath = `${settingsPath}.tmp.${process.pid}.${crypto.randomUUID()}`;
  requireWritableSettingsPathWithinCcs(tempPath);
  try {
    fs.writeFileSync(tempPath, content, { flag: 'wx' });
    fs.renameSync(tempPath, settingsPath);
  } catch (error) {
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // Best-effort cleanup
      }
    }
    throw error;
  }
}

export function writeSettingsAtomically(settingsPath: string, settings: Settings): void {
  writeSettingsTextAtomically(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

export function withSettingsFileLock<T>(settingsPath: string, callback: () => T): T {
  requireWritableSettingsPathWithinCcs(settingsPath);
  const lockTarget = safeRealPath(settingsPath)
    ? settingsPath
    : findExistingParentRealPath(settingsPath);
  if (!lockTarget) {
    throw new ConfigError('Invalid settings path', settingsPath);
  }

  return withSyncLockRetry(lockTarget, callback, {
    description: 'settings file lock',
    staleMs: 10000,
  });
}
