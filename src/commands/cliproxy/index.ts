/**
 * CLIProxy Command Dispatcher
 *
 * Routes cliproxy subcommands to their respective handlers.
 * This is the main entry point for all `ccs cliproxy` commands.
 */

import { CLIProxyBackend } from '../../cliproxy/types';
import { DEFAULT_BACKEND } from '../../cliproxy/platform-detector';
import { loadOrCreateUnifiedConfig } from '../../config/unified-config-loader';
import { handleSync } from '../cliproxy-sync-handler';

// Import subcommand handlers
import { handleList } from './auth-subcommand';
import {
  handleQuotaStatus,
  handleDoctor,
  handleSetDefault,
  handlePauseAccount,
  handleResumeAccount,
} from './quota-subcommand';
import { handleCreate, handleRemove } from './variant-subcommand';
import { handleProxyStatus, handleStop } from './proxy-lifecycle-subcommand';
import { showStatus, handleInstallVersion, handleInstallLatest } from './install-subcommand';
import { showHelp } from './help-subcommand';
import {
  handleCatalogStatus,
  handleCatalogRefresh,
  handleCatalogReset,
} from './catalog-subcommand';

/**
 * Parse --backend flag from args
 * Returns the backend value and remaining args without --backend flag
 */
function parseBackendArg(args: string[]): {
  backend: CLIProxyBackend | undefined;
  remainingArgs: string[];
} {
  const backendIdx = args.indexOf('--backend');
  if (backendIdx === -1) {
    // Also check for --backend=value format
    const backendEqualsIdx = args.findIndex((a) => a.startsWith('--backend='));
    if (backendEqualsIdx !== -1) {
      const value = args[backendEqualsIdx].split('=')[1] as CLIProxyBackend;
      if (value !== 'original' && value !== 'plus') {
        console.warn(`Invalid backend '${value}'. Valid options: original, plus`);
        return { backend: undefined, remainingArgs: args };
      }
      const remainingArgs = [...args];
      remainingArgs.splice(backendEqualsIdx, 1);
      return { backend: value, remainingArgs };
    }
    return { backend: undefined, remainingArgs: args };
  }
  const value = args[backendIdx + 1];
  if (value !== 'original' && value !== 'plus') {
    console.warn(`Invalid backend '${value}'. Valid options: original, plus`);
    return { backend: undefined, remainingArgs: args };
  }
  const remainingArgs = [...args];
  remainingArgs.splice(backendIdx, 2);
  return { backend: value, remainingArgs };
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
 * Accepts: agy, codex, gemini, gemini-cli, all
 */
function parseProviderArg(args: string[]): {
  provider: 'agy' | 'codex' | 'gemini' | 'all';
  remainingArgs: string[];
} {
  const providerIdx = args.indexOf('--provider');
  if (providerIdx === -1) {
    // Also check for --provider=value format
    const providerEqualsIdx = args.findIndex((a) => a.startsWith('--provider='));
    if (providerEqualsIdx !== -1) {
      const value = args[providerEqualsIdx].split('=')[1]?.toLowerCase() || '';
      const remainingArgs = [...args];
      remainingArgs.splice(providerEqualsIdx, 1);
      // Handle empty value
      if (!value) {
        console.error(
          'Warning: --provider requires a value. Valid options: agy, codex, gemini, gemini-cli, all'
        );
        return { provider: 'all', remainingArgs };
      }
      // Normalize gemini-cli to gemini
      const normalized = value === 'gemini-cli' ? 'gemini' : value;
      if (
        normalized !== 'agy' &&
        normalized !== 'codex' &&
        normalized !== 'gemini' &&
        normalized !== 'all'
      ) {
        console.error(
          `Invalid provider '${value}'. Valid options: agy, codex, gemini, gemini-cli, all`
        );
        return { provider: 'all', remainingArgs };
      }
      return { provider: normalized as 'agy' | 'codex' | 'gemini' | 'all', remainingArgs };
    }
    return { provider: 'all', remainingArgs: args };
  }
  const rawValue = args[providerIdx + 1];
  // Warn if no value or value looks like another flag
  if (!rawValue || rawValue.startsWith('-')) {
    console.error(
      'Warning: --provider requires a value. Valid options: agy, codex, gemini, gemini-cli, all'
    );
  }
  const value = rawValue?.toLowerCase() || 'all';
  const remainingArgs = [...args];
  remainingArgs.splice(providerIdx, 2);
  // Normalize gemini-cli to gemini
  const normalized = value === 'gemini-cli' ? 'gemini' : value;
  if (
    normalized !== 'agy' &&
    normalized !== 'codex' &&
    normalized !== 'gemini' &&
    normalized !== 'all'
  ) {
    console.error(
      `Invalid provider '${value}'. Valid options: agy, codex, gemini, gemini-cli, all`
    );
    return { provider: 'all', remainingArgs };
  }
  return { provider: normalized as 'agy' | 'codex' | 'gemini' | 'all', remainingArgs };
}

/**
 * Main router for cliproxy commands
 */
export async function handleCliproxyCommand(args: string[]): Promise<void> {
  // Parse --backend flag first (before other processing)
  const { backend: cliBackend, remainingArgs } = parseBackendArg(args);
  const effectiveBackend = getEffectiveBackend(cliBackend);

  const verbose = remainingArgs.includes('--verbose') || remainingArgs.includes('-v');
  const command = remainingArgs[0];

  if (remainingArgs.includes('--help') || remainingArgs.includes('-h')) {
    await showHelp();
    return;
  }

  // Profile commands
  if (command === 'create') {
    await handleCreate(remainingArgs.slice(1), effectiveBackend);
    return;
  }

  if (command === 'list' || command === 'ls') {
    await handleList();
    return;
  }

  if (command === 'remove' || command === 'delete' || command === 'rm') {
    await handleRemove(remainingArgs.slice(1));
    return;
  }

  // Catalog commands
  if (command === 'catalog') {
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

  // Proxy lifecycle commands
  if (command === 'stop') {
    await handleStop();
    return;
  }

  if (command === 'status') {
    await handleProxyStatus();
    return;
  }

  // Diagnostics
  if (command === 'doctor' || command === 'diag') {
    await handleDoctor(verbose);
    return;
  }

  // Quota management commands
  if (command === 'default') {
    await handleSetDefault(remainingArgs.slice(1));
    return;
  }

  if (command === 'pause') {
    await handlePauseAccount(remainingArgs.slice(1));
    return;
  }

  if (command === 'resume') {
    await handleResumeAccount(remainingArgs.slice(1));
    return;
  }

  if (command === 'quota') {
    const { provider: providerFilter } = parseProviderArg(remainingArgs.slice(1));
    await handleQuotaStatus(verbose, providerFilter);
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
