/**
 * CLIProxy Executor Arg Parser
 *
 * Extracted from index.ts (Concern A):
 *   - readOptionValue
 *   - hasGitLabTokenLoginFlag / getGitLabTokenLoginFlagName
 *   - CCS_FLAGS constant + filterCcsFlags()
 *   - parseExecutorFlags() — flag extraction block (lines ~411-639 in original)
 *   - validateFlagCombinations() — cross-flag guard block (lines ~531-585)
 *
 * IMPORTANT: process.exit semantics are kept identical to original index.ts,
 * with explicit parseFailed/validation return state for callers that must not
 * depend on ambient process.exitCode.
 * All console.error messages are byte-identical.
 */

import { fail } from '../../utils/ui/indicators';
import {
  isKiroAuthMethod,
  isKiroIDCFlow,
  type KiroAuthMethod,
  type KiroIDCFlow,
  normalizeKiroAuthMethod,
  normalizeKiroIDCFlow,
} from '../auth/auth-types';
import type { UnifiedConfig } from '../../config/unified-config-types';
import { PROXY_CLI_FLAGS } from '../proxy/proxy-config-resolver';
import { parseThinkingOverride } from './thinking-arg-parser';

// Inlined from antigravity-responsibility.ts to avoid pulling in unified-config-loader
// (which requires js-yaml at runtime). Keep in sync if ANTIGRAVITY_ACCEPT_RISK_FLAGS changes.
const ANTIGRAVITY_ACCEPT_RISK_FLAGS_LOCAL = [
  '--accept-agr-risk',
  '--accept-antigravity-risk',
] as const;

function hasAntigravityRiskAcceptanceFlag(args: string[]): boolean {
  return args.some((arg) =>
    (ANTIGRAVITY_ACCEPT_RISK_FLAGS_LOCAL as readonly string[]).includes(arg)
  );
}

// ── Simple Helpers ────────────────────────────────────────────────────────────

/**
 * Parse a flag value from args supporting both `--flag value` and `--flag=value` forms.
 * Returns the shape used throughout the executor:
 *   { present, value?, missingValue }
 */
export function readOptionValue(
  args: string[],
  flag: string
): { present: boolean; value?: string; missingValue: boolean } {
  const inlinePrefix = `${flag}=`;
  const inlineArg = args.find((arg) => arg.startsWith(inlinePrefix));
  if (inlineArg !== undefined) {
    const value = inlineArg.slice(inlinePrefix.length).trim();
    return {
      present: true,
      value: value.length > 0 ? value : undefined,
      missingValue: value.length === 0,
    };
  }

  const index = args.indexOf(flag);
  if (index === -1) {
    return { present: false, missingValue: false };
  }

  const next = args[index + 1];
  if (!next || next.startsWith('-')) {
    return { present: true, missingValue: true };
  }

  return { present: true, value: next.trim(), missingValue: false };
}

/** Returns true if args contain a GitLab token-login flag. */
export function hasGitLabTokenLoginFlag(args: string[]): boolean {
  return args.includes('--gitlab-token-login') || args.includes('--token-login');
}

/** Returns the specific flag name present in args (used for error messages). */
export function getGitLabTokenLoginFlagName(
  args: string[]
): '--gitlab-token-login' | '--token-login' {
  return args.includes('--gitlab-token-login') ? '--gitlab-token-login' : '--token-login';
}

// ── CCS Flags Filter ──────────────────────────────────────────────────────────

/**
 * CCS-specific flags that must not be forwarded to the underlying Claude CLI.
 * The list is kept here as the single source of truth (previously inlined in index.ts).
 */
export const CCS_FLAGS: readonly string[] = [
  '--auth',
  '--paste-callback',
  '--port-forward',
  '--headless',
  '--logout',
  '--config',
  '--add',
  '--accounts',
  '--use',
  '--nickname',
  '--kiro-auth-method',
  '--kiro-idc-start-url',
  '--kiro-idc-region',
  '--kiro-idc-flow',
  '--thinking',
  '--effort',
  '--1m',
  '--no-1m',
  '--incognito',
  '--no-incognito',
  '--import',
  '--accept-agr-risk',
  '--accept-antigravity-risk',
  '--settings',
  ...PROXY_CLI_FLAGS,
] as const;

/**
 * Filter all CCS-specific flags (and their value arguments) from args
 * before forwarding to the Claude CLI.
 * Mirrors the filter logic from index.ts lines ~1328-1349.
 */
export function filterCcsFlags(args: string[]): string[] {
  return args.filter((arg, idx) => {
    if (CCS_FLAGS.includes(arg)) return false;
    if (arg.startsWith('--kiro-auth-method=')) return false;
    if (arg.startsWith('--kiro-idc-start-url=')) return false;
    if (arg.startsWith('--kiro-idc-region=')) return false;
    if (arg.startsWith('--kiro-idc-flow=')) return false;
    if (arg.startsWith('--thinking=')) return false;
    if (arg.startsWith('--effort=')) return false;
    if (arg.startsWith('--1m=') || arg.startsWith('--no-1m=')) return false;
    if (
      args[idx - 1] === '--use' ||
      args[idx - 1] === '--nickname' ||
      args[idx - 1] === '--kiro-auth-method' ||
      args[idx - 1] === '--kiro-idc-start-url' ||
      args[idx - 1] === '--kiro-idc-region' ||
      args[idx - 1] === '--kiro-idc-flow' ||
      args[idx - 1] === '--thinking' ||
      args[idx - 1] === '--effort'
    )
      return false;
    return true;
  });
}

// ── ParsedExecutorFlags ───────────────────────────────────────────────────────

/** Result of parsing CCS executor flags from args. */
export interface ParsedExecutorFlags {
  parseFailed?: boolean;
  forceAuth: boolean;
  pasteCallback: boolean;
  portForward: boolean;
  forceHeadless: boolean;
  forceLogout: boolean;
  forceConfig: boolean;
  addAccount: boolean;
  showAccounts: boolean;
  forceImport: boolean;
  gitlabTokenLogin: boolean;
  acceptAgyRisk: boolean;
  incognitoFlag: boolean;
  noIncognitoFlag: boolean;
  noIncognito: boolean;
  useAccount: string | undefined;
  setNickname: string | undefined;
  kiroAuthMethod: KiroAuthMethod | undefined;
  kiroIDCStartUrl: string | undefined;
  kiroIDCRegion: string | undefined;
  kiroIDCFlow: KiroIDCFlow | undefined;
  gitlabBaseUrl: string | undefined;
  extendedContextOverride: boolean | undefined;
  thinkingParse: ReturnType<typeof parseThinkingOverride>;
}

/**
 * Parse all CCS executor flags from args.
 *
 * Exits with code 1 (process.exitCode = 1 + parseFailed return) on invalid flag values.
 * Exits with process.exit(1) on conflicting flag combinations — identical to
 * the original index.ts behavior.
 *
 * @param args     args AFTER proxy flags have been stripped (argsWithoutProxy)
 * @param context  provider context needed for kiro/incognito defaults
 */
export function parseExecutorFlags(
  args: string[],
  context: {
    provider: string;
    compositeProviders: string[];
    unifiedConfig: UnifiedConfig;
  }
): ParsedExecutorFlags {
  const { provider, unifiedConfig } = context;

  const forceAuth = args.includes('--auth');
  const pasteCallback = args.includes('--paste-callback');
  const portForward = args.includes('--port-forward');
  const forceHeadless = args.includes('--headless');

  if (pasteCallback && portForward) {
    process.stderr.write(String(fail('Cannot use --paste-callback with --port-forward')) + '\n');
    process.stderr.write('    --paste-callback: Manually paste OAuth redirect URL\n');
    process.stderr.write('    --port-forward: Use SSH port forwarding for callback\n');
    process.exit(1);
  }

  const forceLogout = args.includes('--logout');
  const forceConfig = args.includes('--config');
  const addAccount = args.includes('--add');
  const showAccounts = args.includes('--accounts');
  const forceImport = args.includes('--import');
  const gitlabTokenLogin = hasGitLabTokenLoginFlag(args);
  const acceptAgyRisk = hasAntigravityRiskAcceptanceFlag(args);

  const incognitoFlag = args.includes('--incognito');
  const noIncognitoFlag = args.includes('--no-incognito');
  const kiroNoIncognitoConfig =
    provider === 'kiro' ? (unifiedConfig.cliproxy?.kiro_no_incognito ?? true) : false;
  const noIncognito = incognitoFlag ? false : noIncognitoFlag || kiroNoIncognitoConfig;

  // Parse --use flag
  let useAccount: string | undefined;
  const useIdx = args.indexOf('--use');
  if (useIdx !== -1 && args[useIdx + 1] && !args[useIdx + 1].startsWith('-')) {
    useAccount = args[useIdx + 1];
  }

  // Parse --nickname flag
  let setNickname: string | undefined;
  const nicknameIdx = args.indexOf('--nickname');
  if (nicknameIdx !== -1 && args[nicknameIdx + 1] && !args[nicknameIdx + 1].startsWith('-')) {
    setNickname = args[nicknameIdx + 1];
  }

  // Parse --kiro-auth-method flag
  let kiroAuthMethod: KiroAuthMethod | undefined;
  const kiroMethodValue = readOptionValue(args, '--kiro-auth-method');
  if (kiroMethodValue.present) {
    const rawMethod = kiroMethodValue.value;
    if (kiroMethodValue.missingValue || !rawMethod) {
      process.stderr.write(String(fail('--kiro-auth-method requires a value')) + '\n');
      process.stderr.write('    Supported values: aws, aws-authcode, google, github, idc\n');
      process.exitCode = 1;
      // Caller must check parseFailed and bail — matching original return behavior
      return buildPartialFlags({
        forceAuth,
        pasteCallback,
        portForward,
        forceHeadless,
        forceLogout,
        forceConfig,
        addAccount,
        showAccounts,
        forceImport,
        gitlabTokenLogin,
        acceptAgyRisk,
        incognitoFlag,
        noIncognitoFlag,
        noIncognito,
        useAccount,
        setNickname,
        kiroAuthMethod: undefined,
        kiroIDCStartUrl: undefined,
        kiroIDCRegion: undefined,
        kiroIDCFlow: undefined,
        gitlabBaseUrl: undefined,
        extendedContextOverride: undefined,
        thinkingParse: parseThinkingOverride(args),
        parseFailed: true,
      });
    }
    const normalized = rawMethod.trim().toLowerCase();
    if (!isKiroAuthMethod(normalized)) {
      process.stderr.write(String(fail(`Invalid --kiro-auth-method value: ${rawMethod}`)) + '\n');
      process.stderr.write('    Supported values: aws, aws-authcode, google, github, idc\n');
      process.exitCode = 1;
      return buildPartialFlags({
        forceAuth,
        pasteCallback,
        portForward,
        forceHeadless,
        forceLogout,
        forceConfig,
        addAccount,
        showAccounts,
        forceImport,
        gitlabTokenLogin,
        acceptAgyRisk,
        incognitoFlag,
        noIncognitoFlag,
        noIncognito,
        useAccount,
        setNickname,
        kiroAuthMethod: undefined,
        kiroIDCStartUrl: undefined,
        kiroIDCRegion: undefined,
        kiroIDCFlow: undefined,
        gitlabBaseUrl: undefined,
        extendedContextOverride: undefined,
        thinkingParse: parseThinkingOverride(args),
        parseFailed: true,
      });
    }
    kiroAuthMethod = normalizeKiroAuthMethod(normalized);
  }

  let kiroIDCStartUrl: string | undefined;
  const kiroIDCStartUrlValue = readOptionValue(args, '--kiro-idc-start-url');
  if (kiroIDCStartUrlValue.present && kiroIDCStartUrlValue.value) {
    kiroIDCStartUrl = kiroIDCStartUrlValue.value;
  } else if (kiroIDCStartUrlValue.present) {
    process.stderr.write(String(fail('--kiro-idc-start-url requires a value')) + '\n');
    process.exitCode = 1;
    return buildPartialFlags({
      forceAuth,
      pasteCallback,
      portForward,
      forceHeadless,
      forceLogout,
      forceConfig,
      addAccount,
      showAccounts,
      forceImport,
      gitlabTokenLogin,
      acceptAgyRisk,
      incognitoFlag,
      noIncognitoFlag,
      noIncognito,
      useAccount,
      setNickname,
      kiroAuthMethod,
      kiroIDCStartUrl: undefined,
      kiroIDCRegion: undefined,
      kiroIDCFlow: undefined,
      gitlabBaseUrl: undefined,
      extendedContextOverride: undefined,
      thinkingParse: parseThinkingOverride(args),
      parseFailed: true,
    });
  }

  let kiroIDCRegion: string | undefined;
  const kiroIDCRegionValue = readOptionValue(args, '--kiro-idc-region');
  if (kiroIDCRegionValue.present && kiroIDCRegionValue.value) {
    kiroIDCRegion = kiroIDCRegionValue.value;
  } else if (kiroIDCRegionValue.present) {
    process.stderr.write(String(fail('--kiro-idc-region requires a value')) + '\n');
    process.exitCode = 1;
    return buildPartialFlags({
      forceAuth,
      pasteCallback,
      portForward,
      forceHeadless,
      forceLogout,
      forceConfig,
      addAccount,
      showAccounts,
      forceImport,
      gitlabTokenLogin,
      acceptAgyRisk,
      incognitoFlag,
      noIncognitoFlag,
      noIncognito,
      useAccount,
      setNickname,
      kiroAuthMethod,
      kiroIDCStartUrl,
      kiroIDCRegion: undefined,
      kiroIDCFlow: undefined,
      gitlabBaseUrl: undefined,
      extendedContextOverride: undefined,
      thinkingParse: parseThinkingOverride(args),
      parseFailed: true,
    });
  }

  let kiroIDCFlow: KiroIDCFlow | undefined;
  const kiroIDCFlowValue = readOptionValue(args, '--kiro-idc-flow');
  if (kiroIDCFlowValue.present) {
    const rawFlow = kiroIDCFlowValue.value;
    if (kiroIDCFlowValue.missingValue || !rawFlow) {
      process.stderr.write(String(fail('--kiro-idc-flow requires a value')) + '\n');
      process.stderr.write('    Supported values: authcode, device\n');
      process.exitCode = 1;
      return buildPartialFlags({
        forceAuth,
        pasteCallback,
        portForward,
        forceHeadless,
        forceLogout,
        forceConfig,
        addAccount,
        showAccounts,
        forceImport,
        gitlabTokenLogin,
        acceptAgyRisk,
        incognitoFlag,
        noIncognitoFlag,
        noIncognito,
        useAccount,
        setNickname,
        kiroAuthMethod,
        kiroIDCStartUrl,
        kiroIDCRegion,
        kiroIDCFlow: undefined,
        gitlabBaseUrl: undefined,
        extendedContextOverride: undefined,
        thinkingParse: parseThinkingOverride(args),
        parseFailed: true,
      });
    }
    const normalized = rawFlow.trim().toLowerCase();
    if (!isKiroIDCFlow(normalized)) {
      process.stderr.write(String(fail(`Invalid --kiro-idc-flow value: ${rawFlow}`)) + '\n');
      process.stderr.write('    Supported values: authcode, device\n');
      process.exitCode = 1;
      return buildPartialFlags({
        forceAuth,
        pasteCallback,
        portForward,
        forceHeadless,
        forceLogout,
        forceConfig,
        addAccount,
        showAccounts,
        forceImport,
        gitlabTokenLogin,
        acceptAgyRisk,
        incognitoFlag,
        noIncognitoFlag,
        noIncognito,
        useAccount,
        setNickname,
        kiroAuthMethod,
        kiroIDCStartUrl,
        kiroIDCRegion,
        kiroIDCFlow: undefined,
        gitlabBaseUrl: undefined,
        extendedContextOverride: undefined,
        thinkingParse: parseThinkingOverride(args),
        parseFailed: true,
      });
    }
    kiroIDCFlow = normalizeKiroIDCFlow(normalized);
  }

  let gitlabBaseUrl: string | undefined;
  const gitlabBaseUrlValue = readOptionValue(args, '--gitlab-url');
  if (gitlabBaseUrlValue.present && gitlabBaseUrlValue.value) {
    gitlabBaseUrl = gitlabBaseUrlValue.value.trim();
  } else if (gitlabBaseUrlValue.present) {
    process.stderr.write(String(fail('--gitlab-url requires a value')) + '\n');
    process.exitCode = 1;
    return buildPartialFlags({
      forceAuth,
      pasteCallback,
      portForward,
      forceHeadless,
      forceLogout,
      forceConfig,
      addAccount,
      showAccounts,
      forceImport,
      gitlabTokenLogin,
      acceptAgyRisk,
      incognitoFlag,
      noIncognitoFlag,
      noIncognito,
      useAccount,
      setNickname,
      kiroAuthMethod,
      kiroIDCStartUrl,
      kiroIDCRegion,
      kiroIDCFlow,
      gitlabBaseUrl: undefined,
      extendedContextOverride: undefined,
      thinkingParse: parseThinkingOverride(args),
      parseFailed: true,
    });
  }

  // Parse --thinking / --effort flags (aliases; first occurrence wins)
  const thinkingParse = parseThinkingOverride(args);
  if (thinkingParse.error) {
    const { flag } = thinkingParse.error;
    process.stderr.write(String(fail(`${flag} requires a value`)) + '\n');

    if (provider === 'codex') {
      process.stderr.write('    Codex examples: --effort xhigh, --effort high, --effort medium\n');
      process.stderr.write('    Alias: --thinking xhigh (same behavior)\n');
    } else {
      process.stderr.write('    Examples: --thinking low, --thinking 8192, --thinking off\n');
      process.stderr.write('    Levels: minimal, low, medium, high, xhigh, max, auto\n');
    }

    process.exit(1);
  }

  // Parse --1m / --no-1m flags for extended context (1M token window)
  let extendedContextOverride: boolean | undefined;
  const has1mFlag = args.includes('--1m') || args.some((arg) => arg.startsWith('--1m='));
  const hasNo1mFlag = args.includes('--no-1m') || args.some((arg) => arg.startsWith('--no-1m='));

  if (has1mFlag && hasNo1mFlag) {
    process.stderr.write(String(fail('Cannot use both --1m and --no-1m flags')) + '\n');
    process.exit(1);
  } else if (has1mFlag) {
    extendedContextOverride = true;
  } else if (hasNo1mFlag) {
    extendedContextOverride = false;
  }

  // Auto-set kiroAuthMethod = 'idc' if IDC sub-flags present without explicit method
  if (!kiroAuthMethod && (kiroIDCStartUrl || kiroIDCRegion || kiroIDCFlow)) {
    kiroAuthMethod = 'idc';
  }

  return {
    forceAuth,
    pasteCallback,
    portForward,
    forceHeadless,
    forceLogout,
    forceConfig,
    addAccount,
    showAccounts,
    forceImport,
    gitlabTokenLogin,
    acceptAgyRisk,
    incognitoFlag,
    noIncognitoFlag,
    noIncognito,
    useAccount,
    setNickname,
    kiroAuthMethod,
    kiroIDCStartUrl,
    kiroIDCRegion,
    kiroIDCFlow,
    gitlabBaseUrl,
    extendedContextOverride,
    thinkingParse,
    parseFailed: false,
  };
}

/** Internal helper — builds a ParsedExecutorFlags from raw fields (avoids repeating the full struct). */
function buildPartialFlags(fields: ParsedExecutorFlags): ParsedExecutorFlags {
  return fields;
}

// ── Cross-Flag Validation ─────────────────────────────────────────────────────

/**
 * Validate flag combinations that are mutually exclusive or provider-scoped.
 * Sets process.exitCode=1 and returns false on any violation.
 * Call AFTER parseExecutorFlags() and only if parseFailed is false.
 *
 * @param parsed   Result of parseExecutorFlags()
 * @param context  Provider context (provider string + compositeProviders list)
 * @param args     Raw argsWithoutProxy (needed for getGitLabTokenLoginFlagName)
 */
export function validateFlagCombinations(
  parsed: ParsedExecutorFlags,
  context: { provider: string; compositeProviders: string[] },
  args: string[]
): boolean {
  const { provider, compositeProviders } = context;
  const {
    kiroAuthMethod,
    kiroIDCStartUrl,
    kiroIDCRegion,
    kiroIDCFlow,
    gitlabTokenLogin,
    gitlabBaseUrl,
  } = parsed;

  if (kiroAuthMethod && provider !== 'kiro' && !compositeProviders.includes('kiro')) {
    process.stderr.write(String(fail('--kiro-auth-method is only valid for ccs kiro')) + '\n');
    process.exitCode = 1;
    return false;
  }

  if (
    (kiroIDCStartUrl || kiroIDCRegion || kiroIDCFlow) &&
    provider !== 'kiro' &&
    !compositeProviders.includes('kiro')
  ) {
    process.stderr.write(
      String(
        fail(
          '--kiro-idc-start-url, --kiro-idc-region, and --kiro-idc-flow are only valid for ccs kiro'
        )
      ) + '\n'
    );
    process.exitCode = 1;
    return false;
  }

  if (kiroAuthMethod === 'idc' && !kiroIDCStartUrl) {
    process.stderr.write(String(fail('Kiro IDC login requires --kiro-idc-start-url')) + '\n');
    process.stderr.write(
      '    Example: ccs kiro --auth --kiro-auth-method idc --kiro-idc-start-url https://d-xxx.awsapps.com/start\n'
    );
    process.exitCode = 1;
    return false;
  }

  if (
    kiroAuthMethod &&
    kiroAuthMethod !== 'idc' &&
    (kiroIDCStartUrl || kiroIDCRegion || kiroIDCFlow)
  ) {
    process.stderr.write(
      String(
        fail(
          '--kiro-idc-start-url, --kiro-idc-region, and --kiro-idc-flow require --kiro-auth-method idc'
        )
      ) + '\n'
    );
    process.exitCode = 1;
    return false;
  }

  if ((gitlabTokenLogin || gitlabBaseUrl) && provider !== 'gitlab') {
    const flagName = gitlabTokenLogin ? getGitLabTokenLoginFlagName(args) : '--gitlab-url';
    process.stderr.write(String(fail(`${flagName} is only valid for ccs gitlab`)) + '\n');
    process.exitCode = 1;
    return false;
  }

  return true;
}
