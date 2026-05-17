/**
 * Synchronous hot-path resolver for the active codex auth profile. <5ms typical.
 * Precedence: CCS_CODEX_PROFILE env → registry.default → null (legacy ~/.codex).
 * Legacy fallback is allowed only when no explicit CCS_CODEX_PROFILE was requested.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { getCodexAuthRegistryPath, resolveCodexProfileDir } from './codex-profile-paths';
import { getCcsDirSource } from '../utils/config-manager';
import { getCodexProfileNameError } from './types';
import { validateCodexProfileRegistryData } from './codex-profile-registry';
import type { CodexProfileData } from './types';

export interface ResolvedProfile {
  name: string;
  dir: string;
  source: 'env' | 'default';
}

export class CodexAuthProfileResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CodexAuthProfileResolutionError';
  }
}

function quoteDiagnosticValue(value: string): string {
  const escaped = value
    .replace(/[\x00-\x1f\x7f]/g, (char) => `\\x${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
    .replace(/'/g, "\\'");
  return `'${escaped.length > 96 ? `${escaped.slice(0, 96)}...` : escaped}'`;
}

function registryDisplayPath(registryPath: string): string {
  const [source] = getCcsDirSource();
  if (source === 'default') {
    return process.platform === 'win32'
      ? '%USERPROFILE%\\.ccs\\codex-profiles.yaml'
      : '~/.ccs/codex-profiles.yaml';
  }
  if (source === 'CCS_HOME' || source === 'scoped:CCS_HOME') {
    return '$CCS_HOME/.ccs/codex-profiles.yaml';
  }
  if (source === 'CCS_DIR' || source === 'scoped:CCS_DIR') {
    return '$CCS_DIR/codex-profiles.yaml';
  }
  return registryPath;
}

function resolutionFailure(message: string, envName: string, displayEnvName: string): never {
  const prefix = envName ? `CCS_CODEX_PROFILE=${displayEnvName} is set but ` : '';
  throw new CodexAuthProfileResolutionError(
    `${prefix}${message}. Refusing to fall back to ~/.codex.`
  );
}

function assertValidProfileNameForResolution(
  name: string,
  envName: string,
  displayEnvName: string
): void {
  const nameError = getCodexProfileNameError(name);
  if (nameError) {
    resolutionFailure(
      `profile name ${quoteDiagnosticValue(name)} is invalid: ${nameError}`,
      envName,
      displayEnvName
    );
  }
}

function assertValidProfileEntry(
  name: string,
  profiles: Record<string, unknown>,
  envName: string,
  displayEnvName: string,
  displayRegistryPath: string
): void {
  assertValidProfileNameForResolution(name, envName, displayEnvName);
  const profile = profiles[name];
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    resolutionFailure(
      `registry profile ${quoteDiagnosticValue(name)} at ${displayRegistryPath} is not a valid object`,
      envName,
      displayEnvName
    );
  }
  const type = (profile as { type?: unknown }).type;
  if (type !== 'codex') {
    resolutionFailure(
      `registry profile ${quoteDiagnosticValue(name)} at ${displayRegistryPath} is not a Codex profile`,
      envName,
      displayEnvName
    );
  }
}

/** @param env - Process env map; defaults to process.env. Injectable for tests. */
export function resolveActiveProfile(env: NodeJS.ProcessEnv = process.env): ResolvedProfile | null {
  const registryPath = getCodexAuthRegistryPath();
  const envName = (env.CCS_CODEX_PROFILE ?? '').trim();
  const displayEnvName = quoteDiagnosticValue(envName);
  const displayRegistryPath = registryDisplayPath(registryPath);

  // F4: silent fallback — no registry means no profiles, legacy mode
  if (!fs.existsSync(registryPath)) {
    if (envName) {
      throw new CodexAuthProfileResolutionError(
        `CCS_CODEX_PROFILE=${displayEnvName} is set but ${displayRegistryPath} does not exist. Refusing to fall back to ~/.codex.`
      );
    }
    return null;
  }

  let parsed: unknown;
  try {
    const raw = fs.readFileSync(registryPath, 'utf8');
    parsed = yaml.load(raw);
  } catch (err) {
    if (err instanceof CodexAuthProfileResolutionError) throw err;
    const msg = `registry YAML could not be parsed at ${displayRegistryPath}`;
    resolutionFailure(msg, envName, displayEnvName);
  }

  let registry: CodexProfileData;
  try {
    registry = validateCodexProfileRegistryData(parsed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    resolutionFailure(
      `registry at ${displayRegistryPath} is invalid: ${msg}`,
      envName,
      displayEnvName
    );
  }

  const profiles = registry.profiles;
  if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) {
    resolutionFailure(
      `registry at ${displayRegistryPath} is missing a valid profiles map`,
      envName,
      displayEnvName
    );
  }
  for (const profileName of Object.keys(profiles)) {
    assertValidProfileEntry(profileName, profiles, envName, displayEnvName, displayRegistryPath);
  }

  // F2: explicit env override
  if (envName) {
    assertValidProfileNameForResolution(envName, envName, displayEnvName);
    if (!Object.prototype.hasOwnProperty.call(profiles, envName)) {
      throw new CodexAuthProfileResolutionError(
        `CCS_CODEX_PROFILE=${displayEnvName} not found in registry. Refusing to fall back to ~/.codex.`
      );
    }
    assertValidProfileEntry(envName, profiles, envName, displayEnvName, displayRegistryPath);
    return {
      name: envName,
      dir: path.resolve(resolveCodexProfileDir(envName)),
      source: 'env',
    };
  }

  // F3: registry default
  const defaultName = registry.default;
  if (defaultName !== null) {
    if (typeof defaultName !== 'string') {
      resolutionFailure(
        `registry default at ${displayRegistryPath} is not a valid profile name`,
        envName,
        displayEnvName
      );
    }
    assertValidProfileNameForResolution(defaultName, envName, displayEnvName);
    if (!Object.prototype.hasOwnProperty.call(profiles, defaultName)) {
      resolutionFailure(
        `registry default ${quoteDiagnosticValue(defaultName)} is missing from profiles map`,
        envName,
        displayEnvName
      );
    }
    assertValidProfileEntry(defaultName, profiles, envName, displayEnvName, displayRegistryPath);
    return {
      name: defaultName,
      dir: path.resolve(resolveCodexProfileDir(defaultName)),
      source: 'default',
    };
  }

  // F4: no profile configured
  return null;
}
