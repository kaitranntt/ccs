/**
 * CLIProxy Variant Management
 *
 * Handles:
 * - ccs cliproxy create [name]
 * - ccs cliproxy remove <name>
 */

import * as path from 'path';
import { getProviderAccounts } from '../../cliproxy/account-manager';
import { triggerOAuth } from '../../cliproxy/auth/oauth-handler';
import { CLIProxyProfileName, CLIPROXY_PROFILES } from '../../auth/profile-detector';
import { supportsModelConfig, getProviderCatalog, ModelEntry } from '../../cliproxy/model-catalog';
import { CLIProxyProvider, CLIProxyBackend } from '../../cliproxy/types';
import type { TargetType } from '../../targets/target-adapter';
import { getPersistedTargetChoices, isPersistedTargetType } from '../../targets/target-metadata';
import { isUnifiedMode } from '../../config/unified-config-loader';
import { initUI, header, color, ok, fail, warn, info, infoBox, dim } from '../../utils/ui';
import { InteractivePrompt } from '../../utils/prompt';
import {
  validateProfileName,
  variantExists,
  listVariants,
  createVariant,
  createCompositeVariant,
  updateCompositeVariant,
  removeVariant,
} from '../../cliproxy/services';
import { DEFAULT_BACKEND } from '../../cliproxy/platform-detector';
import { CompositeTierConfig } from '../../config/unified-config-types';
import { formatAccountDisplayName } from '../../cliproxy/accounts/email-account-identity';

interface CliproxyProfileArgs {
  name?: string;
  provider?: CLIProxyProfileName;
  model?: string;
  account?: string;
  target?: TargetType;
  force?: boolean;
  yes?: boolean;
  composite?: boolean;
  errors: string[];
}

function parseTargetValue(rawValue: string): TargetType | null {
  const normalized = rawValue.trim().toLowerCase();
  if (isPersistedTargetType(normalized)) {
    return normalized;
  }
  return null;
}

export function parseProfileArgs(args: string[]): CliproxyProfileArgs {
  const result: CliproxyProfileArgs = { errors: [] };
  let parseOptions = true;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (parseOptions && arg === '--') {
      parseOptions = false;
      continue;
    }

    if (parseOptions && arg === '--provider' && args[i + 1]) {
      result.provider = args[++i] as CLIProxyProfileName;
    } else if (parseOptions && arg === '--model' && args[i + 1]) {
      result.model = args[++i];
    } else if (parseOptions && arg === '--account' && args[i + 1]) {
      result.account = args[++i];
    } else if (parseOptions && arg === '--target') {
      const rawValue = args[i + 1];
      if (!rawValue || rawValue.startsWith('-')) {
        result.errors.push('Missing value for --target');
      } else {
        i += 1;
        const parsedTarget = parseTargetValue(rawValue);
        if (!parsedTarget) {
          result.errors.push(
            `Invalid --target value "${rawValue}". Use: ${getPersistedTargetChoices()}`
          );
        } else {
          result.target = parsedTarget;
        }
      }
    } else if (parseOptions && arg.startsWith('--target=')) {
      const rawValue = arg.slice('--target='.length);
      const parsedTarget = parseTargetValue(rawValue);
      if (!parsedTarget) {
        result.errors.push(
          `Invalid --target value "${rawValue}". Use: ${getPersistedTargetChoices()}`
        );
      } else {
        result.target = parsedTarget;
      }
    } else if (parseOptions && arg === '--force') {
      result.force = true;
    } else if (parseOptions && (arg === '--yes' || arg === '-y')) {
      result.yes = true;
    } else if (parseOptions && arg === '--composite') {
      result.composite = true;
    } else if ((!parseOptions || !arg.startsWith('-')) && !result.name) {
      result.name = arg;
    }
  }
  return result;
}

function formatModelOption(model: ModelEntry): string {
  const tierBadge =
    model.tier === 'ultra'
      ? color(' [Ultra]', 'warning')
      : model.tier === 'pro'
        ? color(' [Pro]', 'warning')
        : '';
  return `${model.name}${tierBadge}`;
}

function getBackendLabel(backend: CLIProxyBackend): string {
  return backend === 'plus' ? 'CLIProxy Plus' : 'CLIProxy';
}

function formatVariantAccountLabel(account: {
  id: string;
  email?: string;
  nickname?: string;
}): string {
  const displayName = formatAccountDisplayName(account);
  return account.nickname ? `${account.nickname} (${displayName})` : displayName;
}

/**
 * Interactive prompt to select provider + model for a single tier.
 * Returns a CompositeTierConfig, or null if user cancelled auth.
 */
async function selectTierConfig(
  tierName: string,
  verbose: boolean
): Promise<CompositeTierConfig | null> {
  console.log(header(`${tierName.charAt(0).toUpperCase() + tierName.slice(1)} Tier`));

  // Select provider
  const providerOptions = CLIPROXY_PROFILES.map((p) => ({
    id: p,
    label: p.charAt(0).toUpperCase() + p.slice(1),
  }));
  const provider = (await InteractivePrompt.selectFromList(
    `Provider for ${tierName}:`,
    providerOptions
  )) as CLIProxyProfileName;

  // Check auth
  const providerAccounts = getProviderAccounts(provider as CLIProxyProvider);
  if (providerAccounts.length === 0) {
    console.log('');
    console.log(warn(`No accounts authenticated for ${provider}`));
    const shouldAuth = await InteractivePrompt.confirm(`Authenticate with ${provider} now?`, {
      default: true,
    });
    if (!shouldAuth) {
      console.log(info(`Skipping auth. Run: ${color(`ccs ${provider} --auth`, 'command')}`));
      return null;
    }
    const newAccount = await triggerOAuth(provider as CLIProxyProvider, {
      add: true,
      verbose,
    });
    if (!newAccount) {
      console.log(fail('Authentication failed'));
      process.exit(1);
    }
    console.log(ok(`Authenticated as ${formatVariantAccountLabel(newAccount)}`));
  }

  // Select model
  let model: string | undefined;
  if (supportsModelConfig(provider as CLIProxyProvider)) {
    const catalog = getProviderCatalog(provider as CLIProxyProvider);
    if (catalog) {
      const modelOptions = catalog.models.map((m) => ({ id: m.id, label: formatModelOption(m) }));
      const defaultIdx = catalog.models.findIndex((m) => m.id === catalog.defaultModel);
      model = await InteractivePrompt.selectFromList(`Model for ${tierName}:`, modelOptions, {
        defaultIndex: defaultIdx >= 0 ? defaultIdx : 0,
      });
    }
  }
  if (!model) {
    model = await InteractivePrompt.input(`Model name for ${tierName}`, {
      validate: (val) => (val ? null : 'Model is required'),
    });
  }

  console.log('');
  return { provider, model };
}

export async function handleCreate(
  args: string[],
  backend: CLIProxyBackend = DEFAULT_BACKEND
): Promise<void> {
  await initUI();
  const parsedArgs = parseProfileArgs(args);
  if (parsedArgs.errors.length > 0) {
    parsedArgs.errors.forEach((errorMessage) => console.log(fail(errorMessage)));
    process.exitCode = 1;
    return;
  }
  console.log(header(`Create ${getBackendLabel(backend)} Variant`));
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

  let resolvedTarget: TargetType = parsedArgs.target || 'claude';
  if (!parsedArgs.target && !parsedArgs.yes) {
    const useDroidByDefault = await InteractivePrompt.confirm(
      'Set default target to Factory Droid for this variant?',
      { default: false }
    );
    if (useDroidByDefault) {
      resolvedTarget = 'droid';
    }
  }

  // Composite mode: select provider+model per tier
  if (parsedArgs.composite) {
    console.log(info('Composite variant — select provider and model for each tier'));
    console.log('');

    const verbose = args.includes('--verbose');
    const opus = await selectTierConfig('opus', verbose);
    if (!opus) {
      return; // User cancelled auth
    }
    const sonnet = await selectTierConfig('sonnet', verbose);
    if (!sonnet) {
      return; // User cancelled auth
    }
    const haiku = await selectTierConfig('haiku', verbose);
    if (!haiku) {
      return; // User cancelled auth
    }

    // Select default tier
    const tierOptions = [
      { id: 'opus' as const, label: `Opus (${opus.provider}: ${opus.model})` },
      { id: 'sonnet' as const, label: `Sonnet (${sonnet.provider}: ${sonnet.model})` },
      { id: 'haiku' as const, label: `Haiku (${haiku.provider}: ${haiku.model})` },
    ];
    const defaultTier = (await InteractivePrompt.selectFromList(
      'Default tier (ANTHROPIC_MODEL):',
      tierOptions
    )) as 'opus' | 'sonnet' | 'haiku';

    console.log('');
    console.log(info(`Creating composite ${getBackendLabel(backend)} variant...`));
    const result = createCompositeVariant({
      name,
      defaultTier,
      target: resolvedTarget,
      tiers: { opus, sonnet, haiku },
    });

    if (!result.success) {
      console.log(fail(`Failed to create composite variant: ${result.error}`));
      process.exit(1);
    }

    console.log('');
    const tiers = result.variant?.tiers;
    const tierSummary = tiers
      ? `Opus:    ${tiers.opus.provider} / ${tiers.opus.model}\n` +
        `Sonnet:  ${tiers.sonnet.provider} / ${tiers.sonnet.model}\n` +
        `Haiku:   ${tiers.haiku.provider} / ${tiers.haiku.model}\n` +
        `Default: ${defaultTier}\n` +
        `Target:  ${resolvedTarget}`
      : '';
    const portInfo = result.variant?.port ? `\nPort:    ${result.variant.port}` : '';
    console.log(
      infoBox(
        `Variant: ${name} (composite)\n${tierSummary}${portInfo}\nConfig:  ~/.ccs/config.yaml`,
        'Composite Variant Created'
      )
    );
    console.log('');
    console.log(header('Usage'));
    if (resolvedTarget === 'droid') {
      console.log(
        `  ${color(`ccs ${name} "your prompt"`, 'command')} ${dim('# uses droid by default')}`
      );
      console.log(
        `  ${color(`ccs-droid ${name} "your prompt"`, 'command')} ${dim('# explicit droid alias')}`
      );
      console.log(
        `  ${color(`ccsd ${name} "your prompt"`, 'command')} ${dim('# legacy shortcut')}`
      );
      console.log(
        `  ${color(`ccs ${name} --target claude "your prompt"`, 'command')} ${dim('# override to Claude')}`
      );
    } else {
      console.log(
        `  ${color(`ccs ${name} "your prompt"`, 'command')} ${dim('# uses claude by default')}`
      );
      console.log(
        `  ${color(`ccs-droid ${name} "your prompt"`, 'command')} ${dim('# explicit one-off droid alias')}`
      );
      console.log(
        `  ${color(`ccs ${name} --target droid "your prompt"`, 'command')} ${dim('# target flag alternative')}`
      );
    }
    console.log('');
    return;
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
      console.log(ok(`Authenticated as ${formatVariantAccountLabel(newAccount)}`));
    } else if (providerAccounts.length === 1) {
      account = providerAccounts[0].id;
    } else {
      const ADD_NEW_ID = '__add_new__';
      const accountOptions = [
        ...providerAccounts.map((acc) => ({
          id: acc.id,
          label: `${formatVariantAccountLabel(acc)}${acc.isDefault ? ' (default)' : ''}`,
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
        console.log(ok(`Authenticated as ${formatVariantAccountLabel(newAccount)}`));
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
        console.log(`  - ${formatVariantAccountLabel(a)}${a.isDefault ? ' (default)' : ''}`)
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
  console.log(info(`Creating ${getBackendLabel(backend)} variant...`));
  const result = createVariant(name, provider, model, account, resolvedTarget);

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
  const selectedAccount =
    account && provider
      ? getProviderAccounts(provider as CLIProxyProvider).find((acc) => acc.id === account)
      : null;
  console.log(
    infoBox(
      `Variant:  ${name}\nProvider: ${provider}\nModel:    ${model}\nTarget:   ${resolvedTarget}\n${portInfo}${selectedAccount ? `Account:  ${formatVariantAccountLabel(selectedAccount)}\n` : account ? `Account:  ${account}\n` : ''}${isUnifiedMode() ? 'Config' : 'Settings'}:   ${settingsDisplay}`,
      configType
    )
  );
  console.log('');
  console.log(header('Usage'));
  if (resolvedTarget === 'droid') {
    console.log(
      `  ${color(`ccs ${name} "your prompt"`, 'command')} ${dim('# uses droid by default')}`
    );
    console.log(
      `  ${color(`ccs-droid ${name} "your prompt"`, 'command')} ${dim('# explicit droid alias')}`
    );
    console.log(`  ${color(`ccsd ${name} "your prompt"`, 'command')} ${dim('# legacy shortcut')}`);
    console.log(
      `  ${color(`ccs ${name} --target claude "your prompt"`, 'command')} ${dim('# override to Claude')}`
    );
  } else {
    console.log(
      `  ${color(`ccs ${name} "your prompt"`, 'command')} ${dim('# uses claude by default')}`
    );
    console.log(
      `  ${color(`ccs-droid ${name} "your prompt"`, 'command')} ${dim('# explicit one-off droid alias')}`
    );
    console.log(
      `  ${color(`ccs ${name} --target droid "your prompt"`, 'command')} ${dim('# target flag alternative')}`
    );
  }
  console.log('');
  console.log(dim('To change model later:'));
  console.log(`  ${color(`ccs ${name} --config`, 'command')}`);
  console.log('');
}

export async function handleRemove(args: string[]): Promise<void> {
  await initUI();
  const parsedArgs = parseProfileArgs(args);
  if (parsedArgs.errors.length > 0) {
    parsedArgs.errors.forEach((errorMessage) => console.log(fail(errorMessage)));
    process.exitCode = 1;
    return;
  }
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
    variantNames.forEach((n, i) => {
      const v = variants[n];
      const label = v.type === 'composite' ? 'composite' : v.provider;
      console.log(`  ${i + 1}. ${n} (${label})`);
    });
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
  if (variant.type === 'composite') {
    console.log(`  Type:     composite`);
    if (variant.tiers) {
      console.log(`  Opus:     ${variant.tiers.opus.provider} / ${variant.tiers.opus.model}`);
      console.log(`  Sonnet:   ${variant.tiers.sonnet.provider} / ${variant.tiers.sonnet.model}`);
      console.log(`  Haiku:    ${variant.tiers.haiku.provider} / ${variant.tiers.haiku.model}`);
    }
  } else {
    console.log(`  Provider: ${variant.provider}`);
  }
  if (variant.port) {
    console.log(`  Port:     ${variant.port}`);
  }
  console.log(`  Target:   ${variant.target || 'claude'}`);
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

export async function handleEdit(
  args: string[],
  backend: CLIProxyBackend = DEFAULT_BACKEND
): Promise<void> {
  await initUI();
  const parsedArgs = parseProfileArgs(args);
  if (parsedArgs.errors.length > 0) {
    parsedArgs.errors.forEach((errorMessage) => console.log(fail(errorMessage)));
    process.exitCode = 1;
    return;
  }
  const variants = listVariants();
  const variantNames = Object.keys(variants);

  if (variantNames.length === 0) {
    console.log(warn('No CLIProxy variants to edit'));
    process.exit(0);
  }

  let name = parsedArgs.name;
  if (!name) {
    console.log(header(`Edit ${getBackendLabel(backend)} Variant`));
    console.log('');
    console.log('Available variants:');
    variantNames.forEach((n, i) => {
      const v = variants[n];
      const label = v.type === 'composite' ? 'composite' : v.provider;
      console.log(`  ${i + 1}. ${n} (${label})`);
    });
    console.log('');
    name = await InteractivePrompt.input('Variant name to edit', {
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

  // If not composite, use existing updateVariant() flow (interactive prompts)
  if (variant.type !== 'composite') {
    const currentTarget: TargetType = variant.target || 'claude';
    console.log(header(`Edit Variant: ${name}`));
    console.log('');
    console.log(`Current provider: ${variant.provider}`);
    if (variant.model) {
      console.log(`Current model:    ${variant.model}`);
    }
    console.log(`Current target:   ${currentTarget}`);
    console.log('');

    const changeProvider = await InteractivePrompt.confirm('Change provider?', { default: false });
    let newProvider: CLIProxyProfileName | undefined = undefined;
    if (changeProvider) {
      const providerOptions = CLIPROXY_PROFILES.map((p) => ({
        id: p,
        label: p.charAt(0).toUpperCase() + p.slice(1),
      }));
      newProvider = (await InteractivePrompt.selectFromList(
        'Select new provider:',
        providerOptions
      )) as CLIProxyProfileName;
    }

    const providerChanged = !!(newProvider && newProvider !== variant.provider);
    if (providerChanged) {
      console.log(info('Provider changed. Model selection is required.'));
    }

    const changeModel = providerChanged
      ? true
      : await InteractivePrompt.confirm('Change model?', { default: false });
    let newModel = variant.model || '';
    if (changeModel) {
      const providerForModel = newProvider || (variant.provider as CLIProxyProfileName);
      if (supportsModelConfig(providerForModel as CLIProxyProvider)) {
        const catalog = getProviderCatalog(providerForModel as CLIProxyProvider);
        if (catalog) {
          const modelOptions = catalog.models.map((m) => ({
            id: m.id,
            label: formatModelOption(m),
          }));
          const defaultIdx = catalog.models.findIndex((m) => m.id === catalog.defaultModel);
          newModel = await InteractivePrompt.selectFromList('Select new model:', modelOptions, {
            defaultIndex: defaultIdx >= 0 ? defaultIdx : 0,
          });
        }
      } else {
        newModel = await InteractivePrompt.input('New model name', {
          validate: (val) => (val ? null : 'Model is required'),
        });
      }
    }

    let newTarget: TargetType | undefined = parsedArgs.target;
    if (!parsedArgs.target) {
      const changeTarget = await InteractivePrompt.confirm('Change default target?', {
        default: false,
      });
      if (changeTarget) {
        const targetOptions = [
          { id: 'claude', label: 'Claude Code' },
          { id: 'droid', label: 'Factory Droid' },
        ];
        newTarget = (await InteractivePrompt.selectFromList('Select target:', targetOptions, {
          defaultIndex: currentTarget === 'droid' ? 1 : 0,
        })) as TargetType;
      }
    }

    console.log('');
    console.log(info(`Updating ${getBackendLabel(backend)} variant...`));
    // Use existing updateVariant from variant-service for single-provider variants
    const { updateVariant } = await import('../../cliproxy/services/variant-service');
    const result = updateVariant(name, {
      provider: newProvider,
      model: changeModel ? newModel : undefined,
      target: newTarget,
    });

    if (!result.success) {
      console.log(fail(`Failed to update variant: ${result.error}`));
      process.exit(1);
    }

    const resolvedTarget = result.variant?.target || currentTarget;
    console.log('');
    console.log(ok(`Variant updated: ${name}`));
    console.log('');
    console.log(header('Usage'));
    if (resolvedTarget === 'droid') {
      console.log(
        `  ${color(`ccs ${name} "your prompt"`, 'command')} ${dim('# uses droid by default')}`
      );
      console.log(
        `  ${color(`ccs-droid ${name} "your prompt"`, 'command')} ${dim('# explicit droid alias')}`
      );
      console.log(
        `  ${color(`ccsd ${name} "your prompt"`, 'command')} ${dim('# legacy shortcut')}`
      );
      console.log(
        `  ${color(`ccs ${name} --target claude "your prompt"`, 'command')} ${dim('# override to Claude')}`
      );
    } else {
      console.log(
        `  ${color(`ccs ${name} "your prompt"`, 'command')} ${dim('# uses claude by default')}`
      );
      console.log(
        `  ${color(`ccs-droid ${name} "your prompt"`, 'command')} ${dim('# explicit one-off droid alias')}`
      );
      console.log(
        `  ${color(`ccs ${name} --target droid "your prompt"`, 'command')} ${dim('# target flag alternative')}`
      );
    }
    console.log('');
    return;
  }

  // Composite variant edit flow
  const compositeCurrentTarget: TargetType = variant.target || 'claude';
  console.log(header(`Edit Composite Variant: ${name}`));
  console.log('');
  if (!variant.tiers) {
    console.log(fail('Invalid composite variant: missing tier configuration'));
    process.exit(1);
  }

  console.log(info('Current tier configuration:'));
  console.log(`  Opus:    ${variant.tiers.opus.provider} / ${variant.tiers.opus.model}`);
  console.log(`  Sonnet:  ${variant.tiers.sonnet.provider} / ${variant.tiers.sonnet.model}`);
  console.log(`  Haiku:   ${variant.tiers.haiku.provider} / ${variant.tiers.haiku.model}`);
  console.log(`  Default: ${variant.default_tier}`);
  console.log(`  Target:  ${compositeCurrentTarget}`);
  console.log('');

  const verbose = args.includes('--verbose');
  const updatedTiers: Partial<Record<'opus' | 'sonnet' | 'haiku', CompositeTierConfig>> = {};

  // Ask per-tier edits
  for (const tierName of ['opus', 'sonnet', 'haiku'] as const) {
    const shouldEdit = await InteractivePrompt.confirm(`Edit ${tierName} tier?`, {
      default: false,
    });
    if (shouldEdit) {
      const newConfig = await selectTierConfig(tierName, verbose);
      if (!newConfig) {
        console.log(fail('Edit cancelled'));
        process.exit(0);
      }
      updatedTiers[tierName] = newConfig;
    }
  }

  // Ask for default tier change
  let newDefaultTier = variant.default_tier;
  const changeDefault = await InteractivePrompt.confirm('Change default tier?', { default: false });
  if (changeDefault) {
    const finalTiers = {
      opus: updatedTiers.opus ?? variant.tiers.opus,
      sonnet: updatedTiers.sonnet ?? variant.tiers.sonnet,
      haiku: updatedTiers.haiku ?? variant.tiers.haiku,
    };
    const tierOptions = [
      {
        id: 'opus' as const,
        label: `Opus (${finalTiers.opus.provider}: ${finalTiers.opus.model})`,
      },
      {
        id: 'sonnet' as const,
        label: `Sonnet (${finalTiers.sonnet.provider}: ${finalTiers.sonnet.model})`,
      },
      {
        id: 'haiku' as const,
        label: `Haiku (${finalTiers.haiku.provider}: ${finalTiers.haiku.model})`,
      },
    ];
    newDefaultTier = (await InteractivePrompt.selectFromList(
      'Default tier (ANTHROPIC_MODEL):',
      tierOptions
    )) as 'opus' | 'sonnet' | 'haiku';
  }

  let newCompositeTarget: TargetType | undefined = parsedArgs.target;
  if (!parsedArgs.target) {
    const changeTarget = await InteractivePrompt.confirm('Change default target?', {
      default: false,
    });
    if (changeTarget) {
      const targetOptions = [
        { id: 'claude', label: 'Claude Code' },
        { id: 'droid', label: 'Factory Droid' },
      ];
      newCompositeTarget = (await InteractivePrompt.selectFromList(
        'Select target:',
        targetOptions,
        {
          defaultIndex: compositeCurrentTarget === 'droid' ? 1 : 0,
        }
      )) as TargetType;
    }
  }

  console.log('');
  console.log(info(`Updating composite ${getBackendLabel(backend)} variant...`));
  const result = updateCompositeVariant(name, {
    tiers: updatedTiers,
    defaultTier: changeDefault ? newDefaultTier : undefined,
    target: newCompositeTarget,
  });

  if (!result.success) {
    console.log(fail(`Failed to update composite variant: ${result.error}`));
    process.exit(1);
  }

  console.log('');
  const finalVariant = result.variant;
  if (finalVariant && finalVariant.tiers) {
    const tierSummary =
      `Opus:    ${finalVariant.tiers.opus.provider} / ${finalVariant.tiers.opus.model}\n` +
      `Sonnet:  ${finalVariant.tiers.sonnet.provider} / ${finalVariant.tiers.sonnet.model}\n` +
      `Haiku:   ${finalVariant.tiers.haiku.provider} / ${finalVariant.tiers.haiku.model}\n` +
      `Default: ${finalVariant.default_tier}\n` +
      `Target:  ${finalVariant.target || compositeCurrentTarget}`;
    const portInfo = finalVariant.port ? `\nPort:    ${finalVariant.port}` : '';
    console.log(
      infoBox(
        `Variant: ${name} (composite)\n${tierSummary}${portInfo}\nConfig:  ~/.ccs/config.yaml`,
        'Composite Variant Updated'
      )
    );
  } else {
    console.log(ok(`Composite variant updated: ${name}`));
  }
  console.log('');
}
