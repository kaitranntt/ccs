import type { TargetType } from './target-adapter';

export interface TargetMetadata {
  displayName: string;
  runtimeAliases: readonly string[];
  legacyAliasEnvVar?: string;
  persistedTarget: boolean;
}

export const TARGET_METADATA: Record<TargetType, TargetMetadata> = {
  claude: {
    displayName: 'Claude Code',
    runtimeAliases: [],
    persistedTarget: true,
  },
  droid: {
    displayName: 'Factory Droid',
    runtimeAliases: ['ccs-droid', 'ccsd'],
    legacyAliasEnvVar: 'CCS_DROID_ALIASES',
    persistedTarget: true,
  },
  codex: {
    displayName: 'Codex CLI',
    runtimeAliases: ['ccs-codex', 'ccsx'],
    legacyAliasEnvVar: 'CCS_CODEX_ALIASES',
    persistedTarget: false,
  },
} satisfies Record<TargetType, TargetMetadata>;

export const RUNTIME_TARGET_TYPES = Object.freeze(
  Object.keys(TARGET_METADATA) as TargetType[]
) as readonly TargetType[];

export const PERSISTED_TARGET_TYPES = Object.freeze(
  RUNTIME_TARGET_TYPES.filter((target) => TARGET_METADATA[target].persistedTarget)
) as readonly TargetType[];

const RUNTIME_TARGET_SET = new Set<TargetType>(RUNTIME_TARGET_TYPES);
const PERSISTED_TARGET_SET = new Set<TargetType>(PERSISTED_TARGET_TYPES);

export function isRuntimeTargetType(value: unknown): value is TargetType {
  return typeof value === 'string' && RUNTIME_TARGET_SET.has(value as TargetType);
}

export function isPersistedTargetType(value: unknown): value is TargetType {
  return typeof value === 'string' && PERSISTED_TARGET_SET.has(value as TargetType);
}

export function formatTargetChoices(
  targets: readonly TargetType[],
  conjunction: 'or' | 'comma' = 'comma'
): string {
  if (targets.length === 0) return '';
  if (targets.length === 1) return targets[0];
  if (conjunction === 'comma') return targets.join(', ');
  if (targets.length === 2) return `${targets[0]} or ${targets[1]}`;
  return `${targets.slice(0, -1).join(', ')}, or ${targets[targets.length - 1]}`;
}

export function getPersistedTargetChoices(): string {
  return formatTargetChoices(PERSISTED_TARGET_TYPES, 'or');
}

export function getRuntimeTargetChoices(): string {
  return formatTargetChoices(RUNTIME_TARGET_TYPES, 'comma');
}

export function getBuiltinArgv0TargetMap(): Record<string, TargetType> {
  const map: Record<string, TargetType> = {};
  for (const target of RUNTIME_TARGET_TYPES) {
    for (const alias of TARGET_METADATA[target].runtimeAliases) {
      map[alias] = target;
    }
  }
  return map;
}

export function getLegacyTargetAliasEnvVars(): Partial<Record<TargetType, string>> {
  const result: Partial<Record<TargetType, string>> = {};
  for (const target of RUNTIME_TARGET_TYPES) {
    const envVar = TARGET_METADATA[target].legacyAliasEnvVar;
    if (envVar) {
      result[target] = envVar;
    }
  }
  return result;
}
