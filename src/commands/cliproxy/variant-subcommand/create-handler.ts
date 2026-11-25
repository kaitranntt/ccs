/**
 * CLIProxy Variant Create Handler
 */

import * as path from 'path';
import { getProviderAccounts } from '../../../cliproxy/accounts/account-manager';
import { triggerOAuth } from '../../../cliproxy/auth/oauth-handler';
import { CLIProxyProfileName, CLIPROXY_PROFILES } from '../../../auth/profile-detector';
import { getCatalogRoutingSnapshot } from '../../../cliproxy/services/catalog-routing';
import { supportsModelConfig, getProviderCatalog } from '../../../cliproxy/model-catalog';
import { CLIProxyProvider, CLIProxyBackend } from '../../../cliproxy/types';
import type { TargetType } from '../../../targets/target-adapter';
import { initUI, header, color, ok, fail, warn, info, infoBox, dim } from '../../../utils/ui';
import { InteractivePrompt } from '../../../utils/prompt';
import {
  validateProfileName,
  variantExists,
  createVariant,
  createCompositeVariant,
} from '../../../cliproxy/services';
import { DEFAULT_BACKEND } from '../../../cliproxy/binary/platform-detector';
import { isUnifiedMode } from '../../../config/config-loader-facade';
import {
  ensureVariantManagedModelPrefixes,
  formatVariantAccountLabel,
  getBackendLabel,
  getDefaultModelOptionIndex,
  getModelOptionsForProvider,
  parseProfileArgs,
  printVariantUsage,
  selectTierConfig,
  validateVariantCreateName,
} from './shared-helpers';

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

  let name = parsedArgs.name;
  if (!name) {
    name = await InteractivePrompt.input('Variant name (e.g., g3, flash, pro)', {
      validate: validateProfileName,
    });
  } else {
    const error = validateVariantCreateName(name, parsedArgs.force === true);
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

  if (parsedArgs.composite) {
    console.log(info('Composite variant — select provider and model for each tier'));
    console.log('');

    const verbose = args.includes('--verbose');
    const opus = await selectTierConfig('opus', verbose);
    if (!opus) return;
    const sonnet = await selectTierConfig('sonnet', verbose);
    if (!sonnet) return;
    const haiku = await selectTierConfig('haiku', verbose);
    if (!haiku) return;

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
    printVariantUsage(name, resolvedTarget);
    console.log('');
    return;
  }

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

  let model = parsedArgs.model;
  if (!model) {
    if (supportsModelConfig(provider as CLIProxyProvider)) {
      try {
        await ensureVariantManagedModelPrefixes(provider as CLIProxyProvider);
      } catch {
        // Keep variant creation available even when prefix repair fails.
      }
      const routing = (await getCatalogRoutingSnapshot()).routing[provider as CLIProxyProvider];
      const catalog = getProviderCatalog(provider as CLIProxyProvider);
      if (catalog) {
        const modelOptions = getModelOptionsForProvider(
          provider as CLIProxyProvider,
          catalog,
          routing
        );
        model = await InteractivePrompt.selectFromList('Select model:', modelOptions, {
          defaultIndex: getDefaultModelOptionIndex(modelOptions, catalog, routing),
        });
      }
    }
    if (!model) {
      model = await InteractivePrompt.input('Model name', {
        validate: (val) => (val ? null : 'Model is required'),
      });
    }
  }

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
  printVariantUsage(name, resolvedTarget);
  console.log('');
  console.log(dim('To change model later:'));
  console.log(`  ${color(`ccs ${name} --config`, 'command')}`);
  console.log('');
}
