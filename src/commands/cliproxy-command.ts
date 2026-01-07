/**
 * CLIProxy Command Handler
 *
 * Manages CLIProxyAPI binary installation and profile variants.
 *
 * Binary commands:
 *   ccs cliproxy                  Show current version
 *   ccs cliproxy --install <ver>  Install specific version
 *   ccs cliproxy --latest         Install latest version
 *
 * Profile commands:
 *   ccs cliproxy create <name>    Create CLIProxy variant profile
 *   ccs cliproxy list             List all CLIProxy variant profiles
 *   ccs cliproxy remove <name>    Remove CLIProxy variant profile
 *
 * Supports dual-mode configuration:
 * - Unified YAML format (config.yaml) when CCS_UNIFIED_CONFIG=1 or config.yaml exists
 * - Legacy JSON format (config.json) as fallback
 */

import * as path from 'path';
import { getAllAuthStatus, getOAuthConfig, triggerOAuth } from '../cliproxy/auth-handler';
import {
  getProviderAccounts,
  setDefaultAccount,
  pauseAccount,
  resumeAccount,
  findAccountByQuery,
} from '../cliproxy/account-manager';
import { fetchAllProviderQuotas } from '../cliproxy/quota-fetcher';
import { isOnCooldown } from '../cliproxy/quota-manager';
import { CLIPROXY_FALLBACK_VERSION } from '../cliproxy/platform-detector';
import { CLIPROXY_PROFILES, CLIProxyProfileName } from '../auth/profile-detector';
import { supportsModelConfig, getProviderCatalog, ModelEntry } from '../cliproxy/model-catalog';
import { CLIProxyProvider } from '../cliproxy/types';
import { isUnifiedMode } from '../config/unified-config-loader';
import {
  initUI,
  header,
  subheader,
  color,
  dim,
  ok,
  fail,
  warn,
  info,
  table,
  infoBox,
} from '../utils/ui';
import { InteractivePrompt } from '../utils/prompt';

// Import services
import {
  validateProfileName,
  variantExists,
  listVariants,
  createVariant,
  removeVariant,
  getProxyStatus,
  stopProxy,
  getBinaryStatus,
  checkLatestVersion,
  installVersion,
  installLatest,
} from '../cliproxy/services';

// ============================================================================
// ARGUMENT PARSING
// ============================================================================

interface CliproxyProfileArgs {
  name?: string;
  provider?: CLIProxyProfileName;
  model?: string;
  account?: string;
  force?: boolean;
  yes?: boolean;
}

function parseProfileArgs(args: string[]): CliproxyProfileArgs {
  const result: CliproxyProfileArgs = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--provider' && args[i + 1]) {
      result.provider = args[++i] as CLIProxyProfileName;
    } else if (arg === '--model' && args[i + 1]) {
      result.model = args[++i];
    } else if (arg === '--account' && args[i + 1]) {
      result.account = args[++i];
    } else if (arg === '--force') {
      result.force = true;
    } else if (arg === '--yes' || arg === '-y') {
      result.yes = true;
    } else if (!arg.startsWith('-') && !result.name) {
      result.name = arg;
    }
  }
  return result;
}

function formatModelOption(model: ModelEntry): string {
  const tierBadge = model.tier === 'paid' ? color(' [Paid Tier]', 'warning') : '';
  return `${model.name}${tierBadge}`;
}

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

async function handleCreate(args: string[]): Promise<void> {
  await initUI();
  const parsedArgs = parseProfileArgs(args);
  console.log(header('Create CLIProxy Plus Variant'));
  console.log('');

  // Step 1: Profile name
  let name = parsedArgs.name;
  if (!name) {
    name = await InteractivePrompt.input('Variant name (e.g., g3, flash, pro)', {
      validate: validateProfileName,
    });
  } else {
    const error = validateProfileName(name);
    if (error) {
      console.log(fail(error));
      process.exit(1);
    }
  }

  if (variantExists(name) && !parsedArgs.force) {
    console.log(fail(`Variant '${name}' already exists`));
    console.log(`    Use ${color('--force', 'command')} to overwrite`);
    process.exit(1);
  }

  // Step 2: Provider selection
  let provider = parsedArgs.provider;
  if (!provider) {
    const providerOptions = CLIPROXY_PROFILES.map((p) => ({
      id: p,
      label: p.charAt(0).toUpperCase() + p.slice(1),
    }));
    provider = (await InteractivePrompt.selectFromList(
      'Select provider:',
      providerOptions
    )) as CLIProxyProfileName;
  } else if (!CLIPROXY_PROFILES.includes(provider)) {
    console.log(fail(`Invalid provider: ${provider}`));
    console.log(`    Available: ${CLIPROXY_PROFILES.join(', ')}`);
    process.exit(1);
  }

  // Step 2.5: Account selection
  let account = parsedArgs.account;
  const providerAccounts = getProviderAccounts(provider as CLIProxyProvider);

  if (!account) {
    if (providerAccounts.length === 0) {
      console.log('');
      console.log(warn(`No accounts authenticated for ${provider}`));
      console.log('');
      const shouldAuth = await InteractivePrompt.confirm(`Authenticate with ${provider} now?`, {
        default: true,
      });
      if (!shouldAuth) {
        console.log('');
        console.log(info('Run authentication first:'));
        console.log(`  ${color(`ccs ${provider} --auth`, 'command')}`);
        process.exit(0);
      }
      console.log('');
      const newAccount = await triggerOAuth(provider as CLIProxyProvider, {
        add: true,
        verbose: args.includes('--verbose'),
      });
      if (!newAccount) {
        console.log(fail('Authentication failed'));
        process.exit(1);
      }
      account = newAccount.id;
      console.log('');
      console.log(ok(`Authenticated as ${newAccount.email || newAccount.id}`));
    } else if (providerAccounts.length === 1) {
      account = providerAccounts[0].id;
    } else {
      const ADD_NEW_ID = '__add_new__';
      const accountOptions = [
        ...providerAccounts.map((acc) => ({
          id: acc.id,
          label: `${acc.email || acc.id}${acc.isDefault ? ' (default)' : ''}`,
        })),
        { id: ADD_NEW_ID, label: color('[+ Add new account...]', 'info') },
      ];
      const defaultIdx = providerAccounts.findIndex((a) => a.isDefault);
      const selectedAccount = await InteractivePrompt.selectFromList(
        'Select account:',
        accountOptions,
        { defaultIndex: defaultIdx >= 0 ? defaultIdx : 0 }
      );
      if (selectedAccount === ADD_NEW_ID) {
        console.log('');
        const newAccount = await triggerOAuth(provider as CLIProxyProvider, {
          add: true,
          verbose: args.includes('--verbose'),
        });
        if (!newAccount) {
          console.log(fail('Authentication failed'));
          process.exit(1);
        }
        account = newAccount.id;
        console.log('');
        console.log(ok(`Authenticated as ${newAccount.email || newAccount.id}`));
      } else {
        account = selectedAccount;
      }
    }
  } else {
    const exists = providerAccounts.find((a) => a.id === account);
    if (!exists) {
      console.log(fail(`Account '${account}' not found for ${provider}`));
      console.log('');
      console.log('Available accounts:');
      providerAccounts.forEach((a) =>
        console.log(`  - ${a.email || a.id}${a.isDefault ? ' (default)' : ''}`)
      );
      process.exit(1);
    }
  }

  // Step 3: Model selection
  let model = parsedArgs.model;
  if (!model) {
    if (supportsModelConfig(provider as CLIProxyProvider)) {
      const catalog = getProviderCatalog(provider as CLIProxyProvider);
      if (catalog) {
        const modelOptions = catalog.models.map((m) => ({ id: m.id, label: formatModelOption(m) }));
        const defaultIdx = catalog.models.findIndex((m) => m.id === catalog.defaultModel);
        model = await InteractivePrompt.selectFromList('Select model:', modelOptions, {
          defaultIndex: defaultIdx >= 0 ? defaultIdx : 0,
        });
      }
    }
    if (!model) {
      model = await InteractivePrompt.input('Model name', {
        validate: (val) => (val ? null : 'Model is required'),
      });
    }
  }

  // Create variant
  console.log('');
  console.log(info('Creating CLIProxy Plus variant...'));
  const result = createVariant(name, provider, model, account);

  if (!result.success) {
    console.log(fail(`Failed to create variant: ${result.error}`));
    process.exit(1);
  }

  console.log('');
  const configType = isUnifiedMode()
    ? 'CLIProxy Variant Created (Unified Config)'
    : 'CLIProxy Variant Created';
  const settingsDisplay = isUnifiedMode()
    ? '~/.ccs/config.yaml'
    : `~/.ccs/${path.basename(result.settingsPath || '')}`;
  const portInfo = result.variant?.port ? `Port:     ${result.variant.port}\n` : '';
  console.log(
    infoBox(
      `Variant:  ${name}\nProvider: ${provider}\nModel:    ${model}\n${portInfo}${account ? `Account:  ${account}\n` : ''}${isUnifiedMode() ? 'Config' : 'Settings'}:   ${settingsDisplay}`,
      configType
    )
  );
  console.log('');
  console.log(header('Usage'));
  console.log(`  ${color(`ccs ${name} "your prompt"`, 'command')}`);
  console.log('');
  console.log(dim('To change model later:'));
  console.log(`  ${color(`ccs ${name} --config`, 'command')}`);
  console.log('');
}

async function handleList(): Promise<void> {
  await initUI();
  console.log(header('CLIProxy Profiles'));
  console.log('');

  // Built-in profiles
  console.log(subheader('Built-in Profiles'));
  const authStatuses = getAllAuthStatus();
  for (const status of authStatuses) {
    const oauthConfig = getOAuthConfig(status.provider);
    const icon = status.authenticated ? ok('') : warn('');
    const authLabel = status.authenticated
      ? color('authenticated', 'success')
      : dim('not authenticated');
    const lastAuthStr = status.lastAuth ? dim(` (${status.lastAuth.toLocaleDateString()})`) : '';
    console.log(
      `  ${icon} ${color(status.provider, 'command').padEnd(18)} ${oauthConfig.displayName.padEnd(16)} ${authLabel}${lastAuthStr}`
    );
  }
  console.log('');
  console.log(dim('  To authenticate: ccs <provider> --auth'));
  console.log(dim('  To logout:       ccs <provider> --logout'));
  console.log('');

  // Custom variants
  const variants = listVariants();
  const variantNames = Object.keys(variants);

  if (variantNames.length > 0) {
    console.log(subheader('Custom Variants'));
    const rows = variantNames.map((name) => {
      const variant = variants[name];
      const portStr = variant.port ? String(variant.port) : '-';
      return [name, variant.provider, portStr, variant.settings || '-'];
    });
    console.log(
      table(rows, { head: ['Variant', 'Provider', 'Port', 'Settings'], colWidths: [15, 12, 8, 30] })
    );
    console.log('');
    console.log(dim(`Total: ${variantNames.length} custom variant(s)`));
    console.log('');
  }

  console.log(dim('To create a custom variant:'));
  console.log(`  ${color('ccs cliproxy create', 'command')}`);
  console.log('');
}

async function handleRemove(args: string[]): Promise<void> {
  await initUI();
  const parsedArgs = parseProfileArgs(args);
  const variants = listVariants();
  const variantNames = Object.keys(variants);

  if (variantNames.length === 0) {
    console.log(warn('No CLIProxy variants to remove'));
    process.exit(0);
  }

  let name = parsedArgs.name;
  if (!name) {
    console.log(header('Remove CLIProxy Variant'));
    console.log('');
    console.log('Available variants:');
    variantNames.forEach((n, i) => console.log(`  ${i + 1}. ${n} (${variants[n].provider})`));
    console.log('');
    name = await InteractivePrompt.input('Variant name to remove', {
      validate: (val) => {
        if (!val) return 'Variant name is required';
        if (!variantNames.includes(val)) return `Variant '${val}' not found`;
        return null;
      },
    });
  }

  if (!variantNames.includes(name)) {
    console.log(fail(`Variant '${name}' not found`));
    console.log('');
    console.log('Available variants:');
    variantNames.forEach((n) => console.log(`  - ${n}`));
    process.exit(1);
  }

  const variant = variants[name];
  console.log('');
  console.log(`Variant '${color(name, 'command')}' will be removed.`);
  console.log(`  Provider: ${variant.provider}`);
  if (variant.port) {
    console.log(`  Port:     ${variant.port}`);
  }
  console.log(`  Settings: ${variant.settings || '-'}`);
  console.log('');

  const confirmed =
    parsedArgs.yes || (await InteractivePrompt.confirm('Delete this variant?', { default: false }));
  if (!confirmed) {
    console.log(info('Cancelled'));
    process.exit(0);
  }

  const result = removeVariant(name);
  if (!result.success) {
    console.log(fail(`Failed to remove variant: ${result.error}`));
    process.exit(1);
  }

  console.log(ok(`Variant removed: ${name}`));
  console.log('');
}

async function handleStop(): Promise<void> {
  await initUI();
  console.log(header('Stop CLIProxy'));
  console.log('');

  const result = await stopProxy();
  if (result.stopped) {
    console.log(ok(`CLIProxy stopped (PID ${result.pid})`));
    if (result.sessionCount && result.sessionCount > 0) {
      console.log(info(`${result.sessionCount} active session(s) were disconnected`));
    }
  } else {
    console.log(warn(result.error || 'Failed to stop CLIProxy'));
  }
  console.log('');
}

async function handleProxyStatus(): Promise<void> {
  await initUI();
  console.log(header('CLIProxy Status'));
  console.log('');

  const status = getProxyStatus();
  if (status.running) {
    console.log(`  Status:     ${color('Running', 'success')}`);
    console.log(`  PID:        ${status.pid}`);
    console.log(`  Port:       ${status.port}`);
    console.log(`  Sessions:   ${status.sessionCount || 0} active`);
    if (status.startedAt) {
      console.log(`  Started:    ${new Date(status.startedAt).toLocaleString()}`);
    }
    console.log('');
    console.log(dim('To stop: ccs cliproxy stop'));
  } else {
    console.log(`  Status:     ${color('Not running', 'warning')}`);
    console.log('');
    console.log(dim('CLIProxy starts automatically when you run ccs gemini, codex, etc.'));
  }
  console.log('');
}

async function showStatus(verbose: boolean): Promise<void> {
  await initUI();
  const status = getBinaryStatus();

  console.log('');
  console.log(color('CLIProxy Plus Status', 'primary'));
  console.log('');

  if (status.installed) {
    console.log(`  Installed:  ${color('Yes', 'success')}`);
    const versionLabel = status.pinnedVersion
      ? `${color(`v${status.currentVersion}`, 'info')} ${color('(pinned)', 'warning')}`
      : color(`v${status.currentVersion}`, 'info');
    console.log(`  Version:    ${versionLabel}`);
    console.log(`  Binary:     ${dim(status.binaryPath)}`);
  } else {
    console.log(`  Installed:  ${color('No', 'error')}`);
    console.log(`  Fallback:   ${color(`v${status.fallbackVersion}`, 'info')}`);
    console.log(`  ${dim('Run "ccs gemini" or any provider to auto-install')}`);
  }

  const latestCheck = await checkLatestVersion();
  if (latestCheck.success && latestCheck.latestVersion) {
    console.log('');
    if (latestCheck.updateAvailable) {
      if (status.pinnedVersion) {
        console.log(
          `  Latest:     ${color(`v${latestCheck.latestVersion}`, 'success')} ${dim('(pinned to v' + status.pinnedVersion + ')')}`
        );
        console.log('');
        console.log(`  ${dim('Run "ccs cliproxy --update" to unpin and update')}`);
      } else {
        console.log(
          `  Latest:     ${color(`v${latestCheck.latestVersion}`, 'success')} ${dim('(update available)')}`
        );
        console.log('');
        console.log(`  ${dim('Run "ccs cliproxy --latest" to update')}`);
      }
    } else {
      console.log(
        `  Latest:     ${color(`v${latestCheck.latestVersion}`, 'success')} ${dim('(up to date)')}`
      );
    }
  } else if (verbose && latestCheck.error) {
    console.log(`  Latest:     ${dim(`Could not fetch (${latestCheck.error})`)}`);
  }

  console.log('');
  console.log(dim('Run "ccs cliproxy --help" for all available commands'));
  console.log('');
}

async function handleInstallVersion(version: string, verbose: boolean): Promise<void> {
  console.log(info(`Installing CLIProxy Plus v${version}...`));
  console.log('');

  const result = await installVersion(version, verbose);
  if (!result.success) {
    console.error('');
    console.error(fail(`Failed to install CLIProxy Plus v${version}`));
    console.error(`    ${result.error}`);
    console.error('');
    console.error('Possible causes:');
    console.error('  1. Version does not exist on GitHub');
    console.error('  2. Network connectivity issues');
    console.error('  3. GitHub API rate limiting');
    console.error('');
    console.error('Check available versions at:');
    console.error('  https://github.com/router-for-me/CLIProxyAPIPlus/releases');
    process.exit(1);
  }

  console.log('');
  console.log(ok(`CLIProxy Plus v${version} installed (pinned)`));
  console.log('');
  console.log(dim('This version will be used until you run:'));
  console.log(
    `  ${color('ccs cliproxy --update', 'command')}  ${dim('# Update to latest and unpin')}`
  );
  console.log('');
}

async function handleInstallLatest(verbose: boolean): Promise<void> {
  console.log(info('Fetching latest CLIProxy Plus version...'));

  const result = await installLatest(verbose);
  if (!result.success) {
    console.error(fail(`Failed to install latest version: ${result.error}`));
    process.exit(1);
  }

  if (result.error?.startsWith('Already')) {
    console.log(ok(result.error));
    return;
  }

  console.log('');
  console.log(ok(`CLIProxy Plus updated to v${result.version}`));
  console.log(dim('Auto-update is now enabled.'));
  console.log('');
}

async function showHelp(): Promise<void> {
  await initUI();
  console.log('');
  console.log(header('CLIProxy Management'));
  console.log('');
  console.log(subheader('Usage:'));
  console.log(`  ${color('ccs cliproxy', 'command')} <command> [options]`);
  console.log('');

  const sections: [string, [string, string][]][] = [
    [
      'Profile Commands:',
      [
        ['create [name]', 'Create new CLIProxy variant profile'],
        ['list', 'List all CLIProxy variant profiles'],
        ['remove <name>', 'Remove a CLIProxy variant profile'],
      ],
    ],
    [
      'Quota Management:',
      [
        ['default <account>', 'Set default account for rotation'],
        ['pause <account>', 'Pause account (skip in rotation)'],
        ['resume <account>', 'Resume paused account'],
        ['quota', 'Show quota status for all accounts'],
      ],
    ],
    [
      'Proxy Lifecycle:',
      [
        ['status', 'Show running CLIProxy status'],
        ['stop', 'Stop running CLIProxy instance'],
        ['doctor', 'Quota diagnostics and shared project detection'],
      ],
    ],
    [
      'Binary Commands:',
      [
        ['--install <version>', 'Install and pin a specific version'],
        ['--latest', 'Install the latest version (no pin)'],
        ['--update', 'Unpin and update to latest version'],
      ],
    ],
  ];

  for (const [title, cmds] of sections) {
    console.log(subheader(title));
    const maxLen = Math.max(...cmds.map(([cmd]) => cmd.length));
    for (const [cmd, desc] of cmds) {
      console.log(`  ${color(cmd.padEnd(maxLen + 2), 'command')} ${desc}`);
    }
    console.log('');
  }

  console.log(dim('  Note: CLIProxy now persists by default. Use "stop" to terminate.'));
  console.log('');
  console.log(subheader('Notes:'));
  console.log(`  Default fallback version: ${color(CLIPROXY_FALLBACK_VERSION, 'info')}`);
  console.log(
    `  Releases: ${color('https://github.com/router-for-me/CLIProxyAPIPlus/releases', 'path')}`
  );
  console.log('');
}

// ============================================================================
// DOCTOR COMMAND - Quota diagnostics and shared project detection
// ============================================================================

async function handleDoctor(): Promise<void> {
  await initUI();
  console.log(header('CLIProxy Quota Diagnostics'));
  console.log('');

  // Check each OAuth provider (agy is the only one with quota)
  const provider: CLIProxyProvider = 'agy';
  const accounts = getProviderAccounts(provider);

  if (accounts.length === 0) {
    console.log(info('No Antigravity accounts configured'));
    console.log(`    Run: ${color('ccs agy --auth', 'command')} to authenticate`);
    return;
  }

  console.log(subheader(`Antigravity Accounts (${accounts.length})`));
  console.log('');

  // Fetch quota for all accounts
  console.log(dim('Fetching quotas...'));
  const quotaResult = await fetchAllProviderQuotas(provider);

  // Display per-account quota status
  for (const { account, quota } of quotaResult.accounts) {
    const accountLabel = account.email || account.id || 'Unknown Account';
    const defaultBadge = account.isDefault ? color(' (default)', 'info') : '';

    if (!quota.success) {
      console.log(`  ${fail(accountLabel)}${defaultBadge}`);
      console.log(`    ${color(quota.error || 'Failed to fetch quota', 'error')}`);
      if (quota.isUnprovisioned) {
        console.log(
          `    ${warn('Account not provisioned - open Gemini Code Assist in IDE first')}`
        );
      }
      console.log('');
      continue;
    }

    // Calculate overall quota health (guard against empty models array)
    const avgQuota =
      quota.models.length > 0
        ? quota.models.reduce((sum, m) => sum + m.percentage, 0) / quota.models.length
        : 0;
    const statusIcon = avgQuota > 50 ? ok('') : avgQuota > 10 ? warn('') : fail('');

    console.log(`  ${statusIcon}${accountLabel}${defaultBadge}`);
    if (quota.projectId) {
      console.log(`    Project: ${dim(quota.projectId)}`);
    }

    // Show model quotas
    for (const model of quota.models) {
      const bar = formatQuotaBar(model.percentage);
      console.log(`    ${model.name.padEnd(20)} ${bar} ${model.percentage.toFixed(0)}%`);
    }
    console.log('');
  }

  // Check for shared GCP projects (critical warning)
  const sharedProjects = Object.entries(quotaResult.projectGroups).filter(
    ([, accountIds]) => accountIds.length > 1
  );

  if (sharedProjects.length > 0) {
    console.log('');
    console.log(subheader('Shared Project Warning'));
    console.log('');
    for (const [projectId, accountIds] of sharedProjects) {
      console.log(
        fail(`Project ${projectId.substring(0, 20)}... shared by ${accountIds.length} accounts:`)
      );
      for (const accountId of accountIds) {
        console.log(`    - ${accountId}`);
      }
      console.log('');
      console.log(warn('These accounts share the same quota pool!'));
      console.log(warn('Failover between them will NOT help when quota is exhausted.'));
      console.log(info('Solution: Use accounts from different GCP projects.'));
    }
  }

  // Summary
  console.log('');
  console.log(subheader('Summary'));
  const healthyAccounts = quotaResult.accounts.filter(
    ({ quota }) => quota.success && quota.models.some((m) => m.percentage > 5)
  );
  console.log(`  Accounts with quota: ${healthyAccounts.length}/${accounts.length}`);
  if (sharedProjects.length > 0) {
    console.log(`  ${fail(`Shared projects: ${sharedProjects.length} (failover limited)`)}`);
  } else if (accounts.length > 1) {
    console.log(`  ${ok('No shared projects (failover fully operational)')}`);
  }
  console.log('');
}

function formatQuotaBar(percentage: number): string {
  const width = 20;
  const clampedPct = Math.max(0, Math.min(100, percentage));
  const filled = Math.round((clampedPct / 100) * width);
  const empty = width - filled;
  const filledChar = clampedPct > 50 ? '█' : clampedPct > 10 ? '▓' : '░';
  return `[${filledChar.repeat(filled)}${' '.repeat(empty)}]`;
}

// ============================================================================
// QUOTA MANAGEMENT COMMANDS
// ============================================================================

async function handleSetDefault(args: string[]): Promise<void> {
  await initUI();
  const parsed = parseProfileArgs(args);

  if (!parsed.name) {
    console.log(fail('Usage: ccs cliproxy default <account> [--provider <provider>]'));
    console.log('');
    console.log('Examples:');
    console.log('  ccs cliproxy default ultra@gmail.com');
    console.log('  ccs cliproxy default john --provider agy');
    process.exit(1);
  }

  const provider = (parsed.provider || 'agy') as CLIProxyProvider;
  const account = findAccountByQuery(provider, parsed.name);

  if (!account) {
    console.log(fail(`Account not found: ${parsed.name}`));
    console.log('');
    const accounts = getProviderAccounts(provider);
    if (accounts.length > 0) {
      console.log('Available accounts:');
      for (const acc of accounts) {
        const badge = acc.isDefault ? color(' (current default)', 'info') : '';
        console.log(`  - ${acc.email || acc.id}${badge}`);
      }
    } else {
      console.log(`No accounts found for provider: ${provider}`);
      console.log(`Run: ccs ${provider} --auth`);
    }
    process.exit(1);
  }

  const success = setDefaultAccount(provider, account.id);

  if (success) {
    console.log(ok(`Default account set to: ${account.email || account.id}`));
    console.log(info(`Provider: ${provider}`));
  } else {
    console.log(fail('Failed to set default account'));
    process.exit(1);
  }
}

async function handlePauseAccount(args: string[]): Promise<void> {
  await initUI();
  const parsed = parseProfileArgs(args);

  if (!parsed.name) {
    console.log(fail('Usage: ccs cliproxy pause <account> [--provider <provider>]'));
    console.log('');
    console.log('Pauses an account so it will be skipped in quota rotation.');
    process.exit(1);
  }

  const provider = (parsed.provider || 'agy') as CLIProxyProvider;
  const account = findAccountByQuery(provider, parsed.name);

  if (!account) {
    console.log(fail(`Account not found: ${parsed.name}`));
    process.exit(1);
  }

  if (account.paused) {
    console.log(warn(`Account already paused: ${account.email || account.id}`));
    console.log(info(`Paused at: ${account.pausedAt || 'unknown'}`));
    return;
  }

  const success = pauseAccount(provider, account.id);

  if (success) {
    console.log(ok(`Account paused: ${account.email || account.id}`));
    console.log(info('Account will be skipped in quota rotation'));
  } else {
    console.log(fail('Failed to pause account'));
    process.exit(1);
  }
}

async function handleResumeAccount(args: string[]): Promise<void> {
  await initUI();
  const parsed = parseProfileArgs(args);

  if (!parsed.name) {
    console.log(fail('Usage: ccs cliproxy resume <account> [--provider <provider>]'));
    console.log('');
    console.log('Resumes a paused account for quota rotation.');
    process.exit(1);
  }

  const provider = (parsed.provider || 'agy') as CLIProxyProvider;
  const account = findAccountByQuery(provider, parsed.name);

  if (!account) {
    console.log(fail(`Account not found: ${parsed.name}`));
    process.exit(1);
  }

  if (!account.paused) {
    console.log(warn(`Account is not paused: ${account.email || account.id}`));
    return;
  }

  const success = resumeAccount(provider, account.id);

  if (success) {
    console.log(ok(`Account resumed: ${account.email || account.id}`));
    console.log(info('Account is now active in quota rotation'));
  } else {
    console.log(fail('Failed to resume account'));
    process.exit(1);
  }
}

async function handleQuotaStatus(): Promise<void> {
  await initUI();
  console.log(header('Quota Status'));
  console.log('');

  const provider: CLIProxyProvider = 'agy';
  const accounts = getProviderAccounts(provider);

  if (accounts.length === 0) {
    console.log(info('No Antigravity accounts configured'));
    console.log(`    Run: ${color('ccs agy --auth', 'command')} to authenticate`);
    return;
  }

  console.log(dim('Fetching quotas...'));
  const quotaResult = await fetchAllProviderQuotas(provider);

  // Build table rows
  const rows: string[][] = [];
  for (const account of accounts) {
    const quotaData = quotaResult.accounts.find((q) => q.account.id === account.id);
    const quota = quotaData?.quota;

    // Calculate average quota
    let avgQuota = 'N/A';
    if (quota?.success && quota.models.length > 0) {
      const avg = Math.round(
        quota.models.reduce((sum, m) => sum + m.percentage, 0) / quota.models.length
      );
      avgQuota = `${avg}%`;
    }

    // Build status badges
    const statusParts: string[] = [];
    if (account.paused) statusParts.push(color('PAUSED', 'warning'));
    if (isOnCooldown(provider, account.id)) statusParts.push(color('COOLDOWN', 'warning'));

    const defaultMark = account.isDefault ? color('*', 'success') : ' ';
    const tier = account.tier || 'unknown';
    const status = statusParts.join(', ');

    rows.push([
      defaultMark,
      account.nickname || account.email || account.id,
      tier,
      avgQuota,
      status,
    ]);
  }

  console.log('');
  console.log(
    table(rows, {
      head: ['', 'Account', 'Tier', 'Quota', 'Status'],
      colWidths: [3, 30, 10, 10, 20],
    })
  );
  console.log('');
  console.log(info(`Default account marked with ${color('*', 'success')}`));
  console.log('');

  // Show summary of paused/cooldown accounts
  const pausedCount = accounts.filter((a) => a.paused).length;
  const cooldownCount = accounts.filter((a) => isOnCooldown(provider, a.id)).length;
  if (pausedCount > 0) {
    console.log(
      warn(`${pausedCount} account(s) paused - use 'ccs cliproxy resume <account>' to re-enable`)
    );
  }
  if (cooldownCount > 0) {
    console.log(info(`${cooldownCount} account(s) on cooldown (exhausted recently)`));
  }
  if (pausedCount > 0 || cooldownCount > 0) {
    console.log('');
  }
}

// ============================================================================
// MAIN ROUTER
// ============================================================================

export async function handleCliproxyCommand(args: string[]): Promise<void> {
  const verbose = args.includes('--verbose') || args.includes('-v');
  const command = args[0];

  if (args.includes('--help') || args.includes('-h')) {
    await showHelp();
    return;
  }

  if (command === 'create') {
    await handleCreate(args.slice(1));
    return;
  }

  if (command === 'list' || command === 'ls') {
    await handleList();
    return;
  }

  if (command === 'remove' || command === 'delete' || command === 'rm') {
    await handleRemove(args.slice(1));
    return;
  }

  if (command === 'stop') {
    await handleStop();
    return;
  }

  if (command === 'status') {
    await handleProxyStatus();
    return;
  }

  if (command === 'doctor' || command === 'diag') {
    await handleDoctor();
    return;
  }

  // Quota management commands
  if (command === 'default') {
    await handleSetDefault(args.slice(1));
    return;
  }

  if (command === 'pause') {
    await handlePauseAccount(args.slice(1));
    return;
  }

  if (command === 'resume') {
    await handleResumeAccount(args.slice(1));
    return;
  }

  if (command === 'quota') {
    await handleQuotaStatus();
    return;
  }

  const installIdx = args.indexOf('--install');
  if (installIdx !== -1) {
    let version = args[installIdx + 1];
    if (!version || version.startsWith('-')) {
      console.error(fail('Missing version argument for --install'));
      console.error('    Usage: ccs cliproxy --install <version>');
      console.error('    Example: ccs cliproxy --install 6.6.80-0');
      process.exit(1);
    }
    // Strip leading 'v' prefix and whitespace (user may type " v6.6.80-0 ")
    version = version.trim().replace(/^v/, '');
    await handleInstallVersion(version, verbose);
    return;
  }

  if (args.includes('--latest') || args.includes('--update')) {
    await handleInstallLatest(verbose);
    return;
  }

  await showStatus(verbose);
}
