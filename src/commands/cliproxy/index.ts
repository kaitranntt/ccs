/**
 * CLIProxy Command Dispatcher
 *
 * Routes cliproxy subcommands to their respective handlers.
 * This is the main entry point for all `ccs cliproxy` commands.
 */

import { CLIProxyBackend } from '../../cliproxy/types';
import { DEFAULT_BACKEND } from '../../cliproxy/platform-detector';
import {
  type QuotaSupportedProvider,
  QUOTA_PROVIDER_HELP_TEXT,
  mapExternalProviderName,
  isQuotaSupportedProvider,
} from '../../cliproxy/provider-capabilities';
import { loadOrCreateUnifiedConfig } from '../../config/unified-config-loader';
import { handleSync } from '../cliproxy-sync-handler';
import { extractOption, hasAnyFlag } from '../arg-extractor';

// Import subcommand handlers
import { handleList } from './auth-subcommand';
import {
  handleQuotaStatus,
  handleDoctor,
  handleSetDefault,
  handlePauseAccount,
  handleResumeAccount,
} from './quota-subcommand';
import { handleCreate, handleRemove, handleEdit } from './variant-subcommand';
import {
  handleProxyStatus,
  handleStart,
  handleStop,
  handleRestart,
} from './proxy-lifecycle-subcommand';
import { showStatus, handleInstallVersion, handleInstallLatest } from './install-subcommand';
import { showHelp } from './help-subcommand';
import { handleRoutingStatus, handleRoutingExplain, handleRoutingSet } from './routing-subcommand';
import {
  handleCatalogStatus,
  handleCatalogRefresh,
  handleCatalogReset,
  handleCatalogJson,
} from './catalog-subcommand';

/**
 * Parse --backend flag from args
 * Returns the backend value and remaining args without --backend flag
 */
function parseBackendArg(args: string[]): {
  backend: CLIProxyBackend | undefined;
  remainingArgs: string[];
} {
  const extracted = extractOption(args, ['--backend']);
  if (!extracted.found) {
    return { backend: undefined, remainingArgs: args };
  }

  if (extracted.missingValue || !extracted.value) {
    console.warn(`Invalid backend ''. Valid options: original, plus`);
    return { backend: undefined, remainingArgs: extracted.remainingArgs };
  }

  const value = extracted.value as CLIProxyBackend;
  if (value !== 'original' && value !== 'plus') {
    console.warn(`Invalid backend '${value}'. Valid options: original, plus`);
    return { backend: undefined, remainingArgs: extracted.remainingArgs };
  }

  return { backend: value, remainingArgs: extracted.remainingArgs };
}

/**
 * Get effective backend (CLI flag > config.yaml > default)
 */
function getEffectiveBackend(cliBackend?: CLIProxyBackend): CLIProxyBackend {
  if (cliBackend) return cliBackend;
  const config = loadOrCreateUnifiedConfig();
  return config.cliproxy?.backend ?? DEFAULT_BACKEND;
}

/**
 * Parse --provider flag from args for quota command
 * Returns the provider filter value and remaining args
 * Accepts canonical + aliases from quota-supported providers, and `all`
 */
type QuotaProviderFilter = QuotaSupportedProvider | 'all';

function normalizeQuotaProvider(value: string): QuotaProviderFilter | null {
  if (value === 'all') {
    return 'all';
  }

  const canonicalProvider = mapExternalProviderName(value);
  if (!canonicalProvider || !isQuotaSupportedProvider(canonicalProvider)) {
    return null;
  }

  return canonicalProvider;
}

export function parseProviderArg(args: string[]): {
  provider: QuotaProviderFilter;
  remainingArgs: string[];
  invalid: boolean;
} {
  const extracted = extractOption(args, ['--provider']);
  if (!extracted.found) {
    return { provider: 'all', remainingArgs: args, invalid: false };
  }

  if (extracted.missingValue || !extracted.value) {
    console.error(
      `Invalid provider value. --provider requires a value. Valid options: ${QUOTA_PROVIDER_HELP_TEXT}`
    );
    return { provider: 'all', remainingArgs: extracted.remainingArgs, invalid: true };
  }

  const value = extracted.value.toLowerCase();
  const normalized = normalizeQuotaProvider(value);
  if (!normalized) {
    console.error(`Invalid provider '${value}'. Valid options: ${QUOTA_PROVIDER_HELP_TEXT}`);
    return { provider: 'all', remainingArgs: extracted.remainingArgs, invalid: true };
  }
  return {
    provider: normalized,
    remainingArgs: extracted.remainingArgs,
    invalid: false,
  };
}

/**
 * Main router for cliproxy commands
 */
export async function handleCliproxyCommand(args: string[]): Promise<void> {
  // Parse --backend flag first (before other processing)
  const { backend: cliBackend, remainingArgs } = parseBackendArg(args);
  const effectiveBackend = getEffectiveBackend(cliBackend);

  const verbose = hasAnyFlag(remainingArgs, ['--verbose', '-v']);
  const command = remainingArgs[0];

  if (hasAnyFlag(remainingArgs, ['--help', '-h'])) {
    await showHelp();
    return;
  }

  // Catalog commands
  if (command === 'catalog') {
    if (hasAnyFlag(remainingArgs, ['--json'])) {
      handleCatalogJson();
      return;
    }
    const subcommand = remainingArgs[1];
    if (subcommand === 'refresh') {
      await handleCatalogRefresh(verbose);
      return;
    }
    if (subcommand === 'reset') {
      await handleCatalogReset();
      return;
    }
    await handleCatalogStatus(verbose);
    return;
  }

  // Sync command
  if (command === 'sync') {
    await handleSync(remainingArgs.slice(1));
    return;
  }

  if (command === 'quota') {
    const { provider: providerFilter, invalid } = parseProviderArg(remainingArgs.slice(1));
    if (invalid) {
      process.exitCode = 1;
      return;
    }
    await handleQuotaStatus(verbose, providerFilter);
    return;
  }

  if (command === 'routing') {
    const subcommand = remainingArgs[1];
    if (subcommand === 'set') {
      await handleRoutingSet(remainingArgs.slice(2));
      return;
    }
    if (subcommand === 'explain') {
      await handleRoutingExplain();
      return;
    }
    await handleRoutingStatus();
    return;
  }

  const commandHandlers: Record<string, () => Promise<void>> = {
    create: async () => handleCreate(remainingArgs.slice(1), effectiveBackend),
    edit: async () => handleEdit(remainingArgs.slice(1), effectiveBackend),
    list: async () => handleList(),
    ls: async () => handleList(),
    remove: async () => handleRemove(remainingArgs.slice(1)),
    delete: async () => handleRemove(remainingArgs.slice(1)),
    rm: async () => handleRemove(remainingArgs.slice(1)),
    start: async () => handleStart(verbose),
    stop: async () => handleStop(),
    restart: async () => handleRestart(verbose),
    status: async () => handleProxyStatus(),
    doctor: async () => handleDoctor(verbose),
    diag: async () => handleDoctor(verbose),
    default: async () => handleSetDefault(remainingArgs.slice(1)),
    pause: async () => handlePauseAccount(remainingArgs.slice(1)),
    resume: async () => handleResumeAccount(remainingArgs.slice(1)),
  };

  const commandHandler = command ? commandHandlers[command] : undefined;
  if (commandHandler) {
    await commandHandler();
    return;
  }

  // Binary installation commands
  const installIdx = remainingArgs.indexOf('--install');
  if (installIdx !== -1) {
    let version = remainingArgs[installIdx + 1];
    if (!version || version.startsWith('-')) {
      console.error('Missing version argument for --install');
      console.error('    Usage: ccs cliproxy --install <version>');
      console.error('    Example: ccs cliproxy --install 6.6.80-0');
      process.exit(1);
    }
    // Strip leading 'v' prefix and whitespace (user may type " v6.6.80-0 ")
    version = version.trim().replace(/^v/, '');
    await handleInstallVersion(version, verbose, effectiveBackend);
    return;
  }

  if (remainingArgs.includes('--latest') || remainingArgs.includes('--update')) {
    await handleInstallLatest(verbose, effectiveBackend);
    return;
  }

  // Default: show status
  await showStatus(verbose, effectiveBackend);
}
