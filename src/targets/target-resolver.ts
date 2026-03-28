/**
 * Target Resolver
 *
 * Resolves which CLI target to use based on:
 * 1. --target flag (highest priority)
 * 2. Runtime alias entrypoint / argv[0] detection
 * 3. Per-profile config
 * 4. Default: 'claude'
 */

import * as path from 'path';
import { TargetType } from './target-adapter';
import {
  getBuiltinArgv0TargetMap,
  getLegacyTargetAliasEnvVars,
  getRuntimeTargetChoices,
  isPersistedTargetType,
  isRuntimeTargetType,
} from './target-metadata';

/**
 * Built-in argv[0] aliases for explicit runtime entrypoints.
 * Droid and Codex install dedicated runtime aliases alongside the base `ccs` bin.
 */
const BUILTIN_ARGV0_TARGET_MAP: Record<string, TargetType> = getBuiltinArgv0TargetMap();
const ALIAS_NAME_REGEX = /^[a-z0-9._-]+$/;
const INTERNAL_ENTRY_TARGET_ENV_VAR = 'CCS_INTERNAL_ENTRY_TARGET';
const GENERIC_TARGET_ALIAS_ENV_VAR = 'CCS_TARGET_ALIASES';
const LEGACY_TARGET_ALIAS_ENV_VARS: Partial<Record<TargetType, string>> =
  getLegacyTargetAliasEnvVars();
const RESERVED_BIN_NAMES = new Set<string>(['ccs', ...Object.keys(BUILTIN_ARGV0_TARGET_MAP)]);

function addAliasToMap(map: Record<string, TargetType>, alias: string, target: TargetType): void {
  const normalizedAlias = alias.trim().toLowerCase();
  if (
    !normalizedAlias ||
    !ALIAS_NAME_REGEX.test(normalizedAlias) ||
    RESERVED_BIN_NAMES.has(normalizedAlias)
  ) {
    return;
  }

  map[normalizedAlias] = target;
}

function addAliasListToMap(
  map: Record<string, TargetType>,
  target: TargetType,
  rawAliases: string
): void {
  for (const rawAlias of rawAliases.split(',')) {
    addAliasToMap(map, rawAlias, target);
  }
}

function parseGenericTargetAliasConfig(map: Record<string, TargetType>, rawConfig: string): void {
  for (const rawEntry of rawConfig.split(';')) {
    const entry = rawEntry.trim();
    if (!entry) {
      continue;
    }

    const separatorIndex = entry.indexOf('=');
    if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
      continue;
    }

    const rawTarget = entry.slice(0, separatorIndex).trim().toLowerCase();
    const rawAliases = entry.slice(separatorIndex + 1).trim();
    if (!rawAliases || !isRuntimeTargetType(rawTarget)) {
      continue;
    }

    addAliasListToMap(map, rawTarget, rawAliases);
  }
}

function buildArgv0TargetMap(): Record<string, TargetType> {
  const map: Record<string, TargetType> = { ...BUILTIN_ARGV0_TARGET_MAP };
  const genericAliasConfig = process.env[GENERIC_TARGET_ALIAS_ENV_VAR];
  if (genericAliasConfig) {
    parseGenericTargetAliasConfig(map, genericAliasConfig);
  }

  for (const [target, envVar] of Object.entries(LEGACY_TARGET_ALIAS_ENV_VARS) as Array<
    [TargetType, string]
  >) {
    const rawAliases = process.env[envVar];
    if (!rawAliases) {
      continue;
    }

    addAliasListToMap(map, target, rawAliases);
  }

  return map;
}

function resolveEntrypointTarget(): TargetType | null {
  const rawTarget = process.env[INTERNAL_ENTRY_TARGET_ENV_VAR];
  if (!rawTarget) {
    return null;
  }

  const normalizedTarget = rawTarget.trim().toLowerCase();
  return isRuntimeTargetType(normalizedTarget) ? normalizedTarget : null;
}

interface ParsedTargetFlags {
  targetOverride?: TargetType;
  cleanedArgs: string[];
}

function normalizeTargetValue(value: string): TargetType {
  const normalized = value.toLowerCase();
  if (isRuntimeTargetType(normalized)) {
    return normalized as TargetType;
  }

  const available = getRuntimeTargetChoices();
  throw new Error(`Unknown target "${value}". Available: ${available}`);
}

/**
 * Parse and strip all --target flags from args.
 * Supports both "--target value" and "--target=value" forms.
 * For repeated flags, last one wins (common CLI precedence behavior).
 */
function parseTargetFlags(args: string[]): ParsedTargetFlags {
  const cleanedArgs: string[] = [];
  let targetOverride: TargetType | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // POSIX option terminator: everything after `--` is positional.
    if (arg === '--') {
      cleanedArgs.push(...args.slice(i));
      break;
    }

    if (arg === '--target') {
      const value = args[i + 1];
      if (!value || value.startsWith('-')) {
        throw new Error(`--target requires a value (${getRuntimeTargetChoices()})`);
      }
      targetOverride = normalizeTargetValue(value);
      i += 1; // Skip value
      continue;
    }

    if (arg.startsWith('--target=')) {
      const value = arg.slice('--target='.length).trim();
      if (!value) {
        throw new Error(`--target requires a value (${getRuntimeTargetChoices()})`);
      }
      targetOverride = normalizeTargetValue(value);
      continue;
    }

    cleanedArgs.push(arg);
  }

  return { targetOverride, cleanedArgs };
}

/**
 * Resolve target type from multiple sources with priority ordering.
 *
 * @param args - CLI arguments (may contain --target flag)
 * @param profileConfig - Per-profile config with optional target field
 * @returns Resolved target type
 */
export function resolveTargetType(
  args: string[],
  profileConfig?: { target?: TargetType }
): TargetType {
  const parsed = parseTargetFlags(args);

  // 1. Check --target flag (highest priority)
  if (parsed.targetOverride) {
    return parsed.targetOverride;
  }

  // 2. Check runtime alias entrypoint / argv[0]
  const entrypointTarget = resolveEntrypointTarget();
  if (entrypointTarget) {
    return entrypointTarget;
  }

  const rawBin = path.basename(process.argv[1] || process.argv0 || '');
  const binName = rawBin.replace(/\.(cmd|bat|ps1|exe)$/i, '').toLowerCase();
  const argv0TargetMap = buildArgv0TargetMap();
  const argv0Target = argv0TargetMap[binName];
  if (argv0Target) {
    return argv0Target;
  }

  // 3. Check per-profile config
  if (profileConfig?.target !== undefined) {
    return isPersistedTargetType(profileConfig.target) ? profileConfig.target : 'claude';
  }

  // 4. Default
  return 'claude';
}

/**
 * Strip --target flag and its value from args array.
 * Returns new array without the flag (so it's not passed to target CLI).
 */
export function stripTargetFlag(args: string[]): string[] {
  return parseTargetFlags(args).cleanedArgs;
}
