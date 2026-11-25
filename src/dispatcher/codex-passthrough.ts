import { resolveTargetType, stripTargetFlag } from '../targets/target-resolver';

export const CODEX_NATIVE_PASSTHROUGH_FLAGS = new Set(['--help', '-h', '--version', '-v']);
export const CODEX_NATIVE_PASSTHROUGH_SUBCOMMANDS = new Set([
  'a',
  'app',
  'app-server',
  'apply',
  'cloud',
  'completion',
  'debug',
  'e',
  'exec',
  'exec-server',
  'features',
  'fork',
  'help',
  'login',
  'logout',
  'mcp',
  'mcp-server',
  'plugin',
  'remote-control',
  'resume',
  'review',
  'sandbox',
]);

export function shouldPassthroughNativeCodexCommand(args: string[]): boolean {
  return getNativeCodexPassthroughArgs(args) !== null;
}

export function getNativeCodexPassthroughArgs(args: string[]): string[] | null {
  const targetArgs = stripTargetFlag(args);
  if (resolveTargetType(args) !== 'codex' || targetArgs.length === 0) {
    return null;
  }

  const firstArg = targetArgs[0] || '';
  if (CODEX_NATIVE_PASSTHROUGH_FLAGS.has(firstArg)) {
    return targetArgs;
  }
  if (CODEX_NATIVE_PASSTHROUGH_SUBCOMMANDS.has(firstArg)) {
    return targetArgs;
  }

  const secondArg = targetArgs[1] || '';
  if (firstArg === 'codex' && CODEX_NATIVE_PASSTHROUGH_FLAGS.has(secondArg)) {
    return targetArgs.slice(1);
  }
  if (firstArg === 'codex' && CODEX_NATIVE_PASSTHROUGH_SUBCOMMANDS.has(secondArg)) {
    return targetArgs.slice(1);
  }

  return null;
}
