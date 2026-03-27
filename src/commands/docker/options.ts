import { extractOption, hasAnyFlag, scanCommandArgs } from '../arg-extractor';
import type { DockerLogService } from '../../docker';

export interface ParsedDockerTarget {
  errors: string[];
  remainingArgs: string[];
  host?: string;
}

export interface ParsedDockerUpOptions extends ParsedDockerTarget {
  port?: number;
  proxyPort?: number;
}

export interface ParsedDockerLogsOptions extends ParsedDockerTarget {
  follow: boolean;
  service?: DockerLogService;
}

function parseNumberOption(
  args: string[],
  flag: string,
  knownFlags: readonly string[]
): { value?: number; remainingArgs: string[]; error?: string } {
  const extracted = extractOption(args, [flag], { knownFlags });
  if (!extracted.found) {
    return { remainingArgs: args };
  }
  if (extracted.missingValue || !extracted.value) {
    return { remainingArgs: extracted.remainingArgs, error: `Missing value for ${flag}` };
  }
  const value = Number.parseInt(extracted.value, 10);
  if (Number.isNaN(value) || value <= 0 || value >= 65536) {
    return { remainingArgs: extracted.remainingArgs, error: `Invalid value for ${flag}` };
  }
  return { value, remainingArgs: extracted.remainingArgs };
}

export function parseDockerTarget(
  args: string[],
  knownFlags: readonly string[]
): ParsedDockerTarget {
  const extracted = extractOption(args, ['--host'], { knownFlags });
  if (!extracted.found) {
    return { errors: [], remainingArgs: args };
  }
  if (extracted.missingValue || !extracted.value?.trim()) {
    return { errors: ['Missing value for --host'], remainingArgs: extracted.remainingArgs };
  }
  const host = extracted.value.trim();
  if (host.startsWith('-') || /\s/.test(host)) {
    return {
      errors: [
        'Invalid value for --host. Use a single SSH target or SSH config alias such as my-box or user@host.',
      ],
      remainingArgs: extracted.remainingArgs,
    };
  }
  return {
    errors: [],
    remainingArgs: extracted.remainingArgs,
    host,
  };
}

export function parseDockerUpOptions(
  args: string[],
  knownFlags: readonly string[]
): ParsedDockerUpOptions {
  const target = parseDockerTarget(args, knownFlags);
  const port = parseNumberOption(target.remainingArgs, '--port', knownFlags);
  const proxyPort = parseNumberOption(port.remainingArgs, '--proxy-port', knownFlags);
  const errors = [...target.errors];
  if (port.error) {
    errors.push(port.error);
  }
  if (proxyPort.error) {
    errors.push(proxyPort.error);
  }
  return {
    ...target,
    remainingArgs: proxyPort.remainingArgs,
    port: port.value,
    proxyPort: proxyPort.value,
    errors,
  };
}

export function parseDockerLogsOptions(
  args: string[],
  knownFlags: readonly string[]
): ParsedDockerLogsOptions {
  const target = parseDockerTarget(args, knownFlags);
  const service = extractOption(target.remainingArgs, ['--service'], { knownFlags });
  let parsedService: DockerLogService | undefined;
  const errors = [...target.errors];

  if (service.found) {
    if (service.missingValue || !service.value) {
      errors.push('Missing value for --service');
    } else if (service.value !== 'ccs' && service.value !== 'cliproxy') {
      errors.push('Invalid value for --service. Use: ccs or cliproxy');
    } else {
      parsedService = service.value;
    }
  }

  return {
    ...target,
    remainingArgs: service.remainingArgs,
    follow: hasAnyFlag(service.remainingArgs, ['--follow']),
    service: parsedService,
    errors,
  };
}

export function collectUnexpectedDockerArgs(
  args: string[],
  options: {
    knownFlags: readonly string[];
    valueFlags?: readonly string[];
    maxPositionals?: number;
  }
): string[] {
  const scanned = scanCommandArgs(args, {
    knownFlags: options.knownFlags,
    valueFlags: options.valueFlags,
  });
  const errors = scanned.unknownFlags.map((flag) => `Unknown option: ${flag}`);
  const maxPositionals = options.maxPositionals ?? 0;
  if (scanned.positionals.length > maxPositionals) {
    errors.push(`Unexpected arguments: ${scanned.positionals.slice(maxPositionals).join(' ')}`);
  }
  return errors;
}
