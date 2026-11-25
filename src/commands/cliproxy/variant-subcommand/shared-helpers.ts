/**
 * Shared Arg Parsing, Model/Account Option Formatting & Tier Selection Helpers
 */

import { getProviderAccounts } from '../../../cliproxy/accounts/account-manager';
import { triggerOAuth } from '../../../cliproxy/auth/oauth-handler';
import { CLIProxyProfileName, CLIPROXY_PROFILES } from '../../../auth/profile-detector';
import { getCatalogRoutingSnapshot } from '../../../cliproxy/services/catalog-routing';
import {
  supportsModelConfig,
  getProviderCatalog,
  ModelEntry,
} from '../../../cliproxy/model-catalog';
import { ensureManagedModelPrefixes } from '../../../cliproxy/ai-providers/managed-model-prefixes';
import type { CliproxyProviderRoutingHints } from '../../../shared/cliproxy-model-routing';
import { CLIProxyProvider, CLIProxyBackend } from '../../../cliproxy/types';
import type { TargetType } from '../../../targets/target-adapter';
import { getPersistedTargetChoices, isPersistedTargetType } from '../../../targets/target-metadata';
import { header, color, ok, fail, warn, info, dim } from '../../../utils/ui';
import { InteractivePrompt } from '../../../utils/prompt';
import { validateProfileName, variantExists } from '../../../cliproxy/services';
import { CompositeTierConfig } from '../../../config/unified-config-types';
import { canOverwriteGrandfatheredReservedProfileName } from '../../../config/reserved-names';
import { formatAccountDisplayName } from '../../../cliproxy/accounts/email-account-identity';

export interface CliproxyProfileArgs {
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

const variantManagedPrefixProviders = new Set<CLIProxyProvider>();
const CODEX_EFFORTS_IN_ORDER = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
type CodexSelectableEffort = (typeof CODEX_EFFORTS_IN_ORDER)[number];

export async function ensureVariantManagedModelPrefixes(provider: CLIProxyProvider): Promise<void> {
  if (variantManagedPrefixProviders.has(provider)) {
    return;
  }

  await ensureManagedModelPrefixes([provider]);
  variantManagedPrefixProviders.add(provider);
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

export function validateVariantCreateName(
  name: string,
  force: boolean,
  exists: boolean = variantExists(name)
): string | null {
  const error = validateProfileName(name);
  if (
    error &&
    !canOverwriteGrandfatheredReservedProfileName(name, {
      force,
      exists,
    })
  ) {
    return error;
  }
  return null;
}

export function formatModelOption(model: ModelEntry): string {
  const tierBadge =
    model.tier === 'ultra'
      ? color(' [Ultra]', 'warning')
      : model.tier === 'pro'
        ? color(' [Pro]', 'warning')
        : '';
  return `${model.name}${tierBadge}`;
}

function getCodexSelectableEfforts(model: ModelEntry): CodexSelectableEffort[] {
  const thinkingLevels = model.thinking?.levels;
  if (thinkingLevels && thinkingLevels.length > 0) {
    return thinkingLevels.filter((lvl): lvl is CodexSelectableEffort =>
      (CODEX_EFFORTS_IN_ORDER as readonly string[]).includes(lvl)
    );
  }
  const maxLevel = model.thinking?.maxLevel;
  const maxIndex = CODEX_EFFORTS_IN_ORDER.findIndex((effort) => effort === maxLevel);
  if (maxIndex < 0) return [];
  return CODEX_EFFORTS_IN_ORDER.slice(0, maxIndex + 1);
}

function getCodexModelOptionValues(model: ModelEntry, modelId: string): string[] {
  const serviceTiers = model.codexServiceTiers ?? [];
  const optionValues: string[] = [modelId];

  for (const serviceTier of serviceTiers) {
    optionValues.push(`${modelId}-${serviceTier}`);
  }

  for (const effort of getCodexSelectableEfforts(model)) {
    const effortModelId = `${modelId}-${effort}`;
    optionValues.push(effortModelId);
    for (const serviceTier of serviceTiers) {
      optionValues.push(`${effortModelId}-${serviceTier}`);
    }
  }

  return optionValues;
}

export function getSelectableModelId(
  modelId: string,
  routing: CliproxyProviderRoutingHints | undefined
): string {
  const hint = routing?.models.find(
    (entry) => entry.modelId.toLowerCase() === modelId.toLowerCase()
  );
  return hint?.recommendedModelId ?? modelId;
}

export function getModelOptionsForProvider(
  provider: CLIProxyProvider,
  catalog: NonNullable<ReturnType<typeof getProviderCatalog>>,
  routing: CliproxyProviderRoutingHints | undefined
): Array<{ id: string; label: string }> {
  return catalog.models.flatMap((model) => {
    const modelId = getSelectableModelId(model.id, routing);
    const optionValues =
      provider === 'codex' ? getCodexModelOptionValues(model, modelId) : [modelId];
    return optionValues.map((optionValue) => ({
      id: optionValue,
      label:
        provider === 'codex'
          ? `${optionValue} (${formatModelOption(model)})`
          : formatModelOption(model),
    }));
  });
}

export function getDefaultModelOptionIndex(
  modelOptions: Array<{ id: string }>,
  catalog: NonNullable<ReturnType<typeof getProviderCatalog>>,
  routing: CliproxyProviderRoutingHints | undefined
): number {
  const defaultModelId = getSelectableModelId(catalog.defaultModel, routing);
  const defaultIdx = modelOptions.findIndex((option) => option.id === defaultModelId);
  return defaultIdx >= 0 ? defaultIdx : 0;
}

export function getBackendLabel(backend: CLIProxyBackend): string {
  return backend === 'plus' ? 'CLIProxy Plus' : 'CLIProxy';
}

export function formatVariantAccountLabel(account: {
  id: string;
  email?: string;
  nickname?: string;
}): string {
  const displayName = formatAccountDisplayName(account);
  return account.nickname ? `${account.nickname} (${displayName})` : displayName;
}

export function printVariantUsage(name: string, resolvedTarget: TargetType): void {
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
}

export async function selectTierConfig(
  tierName: string,
  verbose: boolean
): Promise<CompositeTierConfig | null> {
  console.log(header(`${tierName.charAt(0).toUpperCase() + tierName.slice(1)} Tier`));

  const providerOptions = CLIPROXY_PROFILES.map((p) => ({
    id: p,
    label: p.charAt(0).toUpperCase() + p.slice(1),
  }));
  const provider = (await InteractivePrompt.selectFromList(
    `Provider for ${tierName}:`,
    providerOptions
  )) as CLIProxyProfileName;

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

  let model: string | undefined;
  if (supportsModelConfig(provider as CLIProxyProvider)) {
    try {
      await ensureVariantManagedModelPrefixes(provider as CLIProxyProvider);
    } catch {
      // Keep interactive model selection available even when prefix repair fails.
    }
    const routing = (await getCatalogRoutingSnapshot()).routing[provider as CLIProxyProvider];
    const catalog = getProviderCatalog(provider as CLIProxyProvider);
    if (catalog) {
      const modelOptions = getModelOptionsForProvider(
        provider as CLIProxyProvider,
        catalog,
        routing
      );
      model = await InteractivePrompt.selectFromList(`Model for ${tierName}:`, modelOptions, {
        defaultIndex: getDefaultModelOptionIndex(modelOptions, catalog, routing),
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
