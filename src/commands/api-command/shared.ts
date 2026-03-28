import type { ModelMapping } from '../../api/services';
import type { TargetType } from '../../targets/target-adapter';
import { getPersistedTargetChoices, isPersistedTargetType } from '../../targets/target-metadata';
import {
  applyExtendedContextSuffix,
  hasExtendedContextSuffix,
  isClaudeModelId,
  likelySupportsClaudeExtendedContext,
  stripExtendedContextSuffix,
} from '../../shared/extended-context-utils';
import { fail } from '../../utils/ui';
import { extractOption, hasAnyFlag, scanCommandArgs } from '../arg-extractor';

export interface ApiCommandArgs {
  name?: string;
  positionals: string[];
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  preset?: string;
  cliproxyProvider?: string;
  target?: TargetType;
  extendedContext?: boolean;
  force?: boolean;
  yes?: boolean;
  errors: string[];
}

const MODEL_MAPPING_KEYS = ['default', 'opus', 'sonnet', 'haiku'] as const;

export const API_BOOLEAN_FLAGS = ['--force', '--yes', '-y', '--1m', '--no-1m'] as const;
export const API_VALUE_FLAGS = [
  '--base-url',
  '--api-key',
  '--model',
  '--preset',
  '--cliproxy-provider',
  '--target',
] as const;
export const API_KNOWN_FLAGS: readonly string[] = [...API_BOOLEAN_FLAGS, ...API_VALUE_FLAGS];

const API_VALUE_FLAG_SET = new Set<string>(API_VALUE_FLAGS);

export interface ParseApiCommandArgsOptions {
  maxPositionals?: number;
}

export function sanitizeHelpText(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function applyRepeatedOption(
  args: string[],
  flags: readonly string[],
  onValue: (value: string) => void,
  onMissing: () => void,
  allowDashValue = false
): string[] {
  let remaining = [...args];

  while (true) {
    const extracted = extractOption(remaining, flags, {
      allowDashValue,
      knownFlags: API_KNOWN_FLAGS,
    });
    if (!extracted.found) {
      return remaining;
    }

    if (extracted.missingValue || !extracted.value) {
      onMissing();
    } else {
      onValue(extracted.value);
    }

    remaining = extracted.remainingArgs;
  }
}

export function extractPositionalArgs(args: string[]): string[] {
  const positionals: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === '--') {
      positionals.push(...args.slice(i + 1));
      break;
    }

    if (token.startsWith('-')) {
      if (!token.includes('=') && API_VALUE_FLAG_SET.has(token)) {
        const next = args[i + 1];
        if (next && !next.startsWith('-')) {
          i++;
        }
      }
      continue;
    }

    positionals.push(token);
  }

  return positionals;
}

function parseTargetValue(value: string): TargetType | null {
  const normalized = value.trim().toLowerCase();
  if (isPersistedTargetType(normalized)) {
    return normalized;
  }
  return null;
}

export function parseOptionalTargetFlag(
  args: string[],
  knownFlags: readonly string[]
): { target?: TargetType; remainingArgs: string[]; errors: string[] } {
  const extracted = extractOption(args, ['--target'], {
    knownFlags,
  });
  if (!extracted.found) {
    return { remainingArgs: args, errors: [] };
  }
  if (extracted.missingValue || !extracted.value) {
    return { remainingArgs: extracted.remainingArgs, errors: ['Missing value for --target'] };
  }

  const target = parseTargetValue(extracted.value);
  if (!target) {
    return {
      remainingArgs: extracted.remainingArgs,
      errors: [`Invalid --target value "${extracted.value}". Use: ${getPersistedTargetChoices()}`],
    };
  }

  return { target, remainingArgs: extracted.remainingArgs, errors: [] };
}

export function collectUnexpectedApiArgs(
  args: string[],
  options: {
    knownFlags?: readonly string[];
    maxPositionals: number;
  }
): { positionals: string[]; errors: string[] } {
  const scanned = scanCommandArgs(args, {
    knownFlags: options.knownFlags ?? [],
  });
  const errors = scanned.unknownFlags.map((flag) => `Unknown option: ${flag}`);
  if (scanned.positionals.length > options.maxPositionals) {
    errors.push(
      `Unexpected arguments: ${scanned.positionals.slice(options.maxPositionals).join(' ')}`
    );
  }

  return {
    positionals: scanned.positionals,
    errors,
  };
}

export function parseApiCommandArgs(
  args: string[],
  options: ParseApiCommandArgsOptions = {}
): ApiCommandArgs {
  const enableExtendedContext = hasAnyFlag(args, ['--1m']);
  const disableExtendedContext = hasAnyFlag(args, ['--no-1m']);
  const result: ApiCommandArgs = {
    positionals: [],
    force: hasAnyFlag(args, ['--force']),
    yes: hasAnyFlag(args, ['--yes', '-y']),
    errors: [],
  };

  if (enableExtendedContext && disableExtendedContext) {
    result.errors.push('Cannot combine --1m and --no-1m');
  } else if (enableExtendedContext) {
    result.extendedContext = true;
  } else if (disableExtendedContext) {
    result.extendedContext = false;
  }

  let remaining = [...args];

  remaining = applyRepeatedOption(
    remaining,
    ['--base-url'],
    (value) => {
      result.baseUrl = value;
    },
    () => {
      result.errors.push('Missing value for --base-url');
    },
    false
  );

  remaining = applyRepeatedOption(
    remaining,
    ['--api-key'],
    (value) => {
      result.apiKey = value;
    },
    () => {
      result.errors.push('Missing value for --api-key');
    },
    false
  );

  remaining = applyRepeatedOption(
    remaining,
    ['--model'],
    (value) => {
      result.model = value;
    },
    () => {
      result.errors.push('Missing value for --model');
    },
    true
  );

  remaining = applyRepeatedOption(
    remaining,
    ['--preset'],
    (value) => {
      result.preset = value;
    },
    () => {
      result.errors.push('Missing value for --preset');
    },
    false
  );

  remaining = applyRepeatedOption(
    remaining,
    ['--cliproxy-provider'],
    (value) => {
      result.cliproxyProvider = value.trim().toLowerCase();
    },
    () => {
      result.errors.push('Missing value for --cliproxy-provider');
    },
    false
  );

  remaining = applyRepeatedOption(
    remaining,
    ['--target'],
    (value) => {
      const target = parseTargetValue(value);
      if (!target) {
        result.errors.push(
          `Invalid --target value "${value}". Use: ${getPersistedTargetChoices()}`
        );
        return;
      }
      result.target = target;
    },
    () => {
      result.errors.push('Missing value for --target');
    },
    false
  );

  const unexpected = collectUnexpectedApiArgs(remaining, {
    knownFlags: API_BOOLEAN_FLAGS,
    maxPositionals: options.maxPositionals ?? 1,
  });
  result.positionals = unexpected.positionals;
  result.name = unexpected.positionals[0];
  result.errors.push(...unexpected.errors);
  return result;
}

export function hasClaudeModelMapping(models: ModelMapping): boolean {
  return MODEL_MAPPING_KEYS.some((key) => isClaudeModelId(models[key]));
}

export function hasExplicitClaudeExtendedContext(models: ModelMapping): boolean {
  return MODEL_MAPPING_KEYS.some(
    (key) => isClaudeModelId(models[key]) && hasExtendedContextSuffix(models[key])
  );
}

export function applyClaudeExtendedContextPreference(
  models: ModelMapping,
  enabled: boolean
): ModelMapping {
  const nextModels = { ...models };

  for (const key of MODEL_MAPPING_KEYS) {
    const value = nextModels[key];
    if (!isClaudeModelId(value)) {
      continue;
    }

    nextModels[key] =
      enabled && likelySupportsClaudeExtendedContext(value)
        ? applyExtendedContextSuffix(value)
        : stripExtendedContextSuffix(value);
  }

  return nextModels;
}

export function exitOnApiCommandErrors(errors: string[]): void {
  if (errors.length === 0) {
    return;
  }

  errors.forEach((errorMessage) => {
    console.log(fail(errorMessage));
  });
  process.exit(1);
}
