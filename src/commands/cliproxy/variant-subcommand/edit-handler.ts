/**
 * CLIProxy Variant Edit Handler
 */

import { CLIProxyProfileName, CLIPROXY_PROFILES } from '../../../auth/profile-detector';
import { getCatalogRoutingSnapshot } from '../../../cliproxy/services/catalog-routing';
import { supportsModelConfig, getProviderCatalog } from '../../../cliproxy/model-catalog';
import { CLIProxyProvider, CLIProxyBackend } from '../../../cliproxy/types';
import type { TargetType } from '../../../targets/target-adapter';
import { initUI, header, ok, fail, warn, info, infoBox } from '../../../utils/ui';
import { InteractivePrompt } from '../../../utils/prompt';
import { listVariants, updateCompositeVariant } from '../../../cliproxy/services';
import { DEFAULT_BACKEND } from '../../../cliproxy/binary/platform-detector';
import { CompositeTierConfig } from '../../../config/unified-config-types';
import {
  ensureVariantManagedModelPrefixes,
  formatModelOption,
  getBackendLabel,
  getSelectableModelId,
  parseProfileArgs,
  printVariantUsage,
  selectTierConfig,
} from './shared-helpers';

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
        try {
          await ensureVariantManagedModelPrefixes(providerForModel as CLIProxyProvider);
        } catch {
          // Keep edit flow available even when prefix repair fails.
        }
        const routing = (await getCatalogRoutingSnapshot()).routing[
          providerForModel as CLIProxyProvider
        ];
        const catalog = getProviderCatalog(providerForModel as CLIProxyProvider);
        if (catalog) {
          const modelOptions = catalog.models.map((m) => ({
            id: getSelectableModelId(m.id, routing),
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
    const { updateVariant } = await import('../../../cliproxy/services/variant-service');
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
    printVariantUsage(name, resolvedTarget);
    console.log('');
    return;
  }

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
