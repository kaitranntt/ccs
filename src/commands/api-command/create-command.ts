import {
  apiProfileExists,
  createCliproxyBridgeProfile,
  createApiProfile,
  getDefaultCliproxyBridgeName,
  getPresetById,
  getPresetIds,
  getUrlWarning,
  isOpenRouterUrl,
  isUsingUnifiedConfig,
  pickOpenRouterModel,
  sanitizeBaseUrl,
  suggestCliproxyBridgeName,
  validateApiName,
  validateUrl,
  type ModelMapping,
  type ProviderPreset,
} from '../../api/services';
import {
  CLIPROXY_PROVIDER_IDS,
  getProviderDisplayName,
  isCLIProxyProvider,
} from '../../cliproxy/provider-capabilities';
import { syncToLocalConfig } from '../../cliproxy/sync/local-config-sync';
import type { TargetType } from '../../targets/target-adapter';
import { color, dim, fail, header, info, infoBox, initUI, warn } from '../../utils/ui';
import { InteractivePrompt } from '../../utils/prompt';
import {
  applyClaudeExtendedContextPreference,
  exitOnApiCommandErrors,
  hasClaudeModelMapping,
  hasExplicitClaudeExtendedContext,
  parseApiCommandArgs,
} from './shared';

function resolvePresetOrExit(presetId?: string): ProviderPreset | null {
  if (!presetId) {
    return null;
  }

  const preset = getPresetById(presetId);
  if (preset) {
    return preset;
  }

  console.log(fail(`Unknown preset: ${presetId}`));
  console.log('');
  console.log('Available presets:');
  getPresetIds().forEach((id) => console.log(`  - ${id}`));
  process.exit(1);
}

function showPresetDeprecationNotice(presetId?: string): void {
  if ((presetId || '').trim().toLowerCase() !== 'glmt') {
    return;
  }

  console.log(warn('Preset "glmt" is deprecated and now maps to the direct "glm" preset.'));
  console.log(dim('  Z.AI models already expose thinking natively, so CCS no longer needs GLMT.'));
  console.log(dim('  Update scripts/docs to: ccs api create --preset glm'));
  console.log('');
}

async function resolveProfileName(
  providedName: string | undefined,
  preset: ProviderPreset | null
): Promise<string> {
  const name = providedName || preset?.defaultProfileName;
  if (!name) {
    return InteractivePrompt.input('API name', {
      validate: validateApiName,
    });
  }

  const error = validateApiName(name);
  if (error) {
    console.log(fail(error));
    process.exit(1);
  }
  return name;
}

async function resolveCliproxyProfileName(
  provider: string,
  providedName: string | undefined,
  yes: boolean | undefined
): Promise<string | undefined> {
  if (providedName) {
    const error = validateApiName(providedName);
    if (error) {
      console.log(fail(error));
      process.exit(1);
    }
    return providedName;
  }

  const suggestedName = isCLIProxyProvider(provider)
    ? suggestCliproxyBridgeName(provider)
    : getDefaultCliproxyBridgeName('gemini');

  if (yes) {
    return suggestedName;
  }

  return InteractivePrompt.input('API name', {
    default: suggestedName,
    validate: validateApiName,
  });
}

async function resolveBaseUrl(
  providedBaseUrl: string | undefined,
  preset: ProviderPreset | null
): Promise<string> {
  let baseUrl = providedBaseUrl ?? preset?.baseUrl ?? '';

  if (!baseUrl && !preset) {
    baseUrl = await InteractivePrompt.input(
      'API Base URL (e.g., https://api.example.com/v1 - without /chat/completions)',
      { validate: validateUrl }
    );
  } else if (!preset) {
    const error = validateUrl(baseUrl);
    if (error) {
      console.log(fail(error));
      process.exit(1);
    }
  }

  if (!preset) {
    const urlWarning = getUrlWarning(baseUrl);
    if (urlWarning) {
      console.log('');
      console.log(warn(urlWarning));
      const continueAnyway = await InteractivePrompt.confirm('Continue with this URL anyway?', {
        default: false,
      });
      if (!continueAnyway) {
        baseUrl = await InteractivePrompt.input('API Base URL', {
          validate: validateUrl,
          default: sanitizeBaseUrl(baseUrl),
        });
      }
    }
    return baseUrl;
  }

  console.log(info(`Using preset: ${preset.name}`));
  console.log(dim(`  ${preset.description}`));
  console.log(
    dim(
      preset.baseUrl
        ? `  Base URL: ${preset.baseUrl}`
        : '  Auth: Native Anthropic API (x-api-key header)'
    )
  );
  console.log('');
  return baseUrl;
}

async function resolveApiKey(
  providedApiKey: string | undefined,
  preset: ProviderPreset | null
): Promise<string> {
  if (preset?.requiresApiKey === false) {
    if (providedApiKey) {
      console.log(dim(`Note: Using provided API key for ${preset.name} (optional)`));
      return providedApiKey;
    }
    console.log(info(`No API key required for ${preset.name}`));
    return preset.apiKeyPlaceholder || preset.id;
  }

  if (providedApiKey) {
    return providedApiKey;
  }

  const keyPrompt = preset?.apiKeyHint ? `API Key (${preset.apiKeyHint})` : 'API Key';
  const apiKey = await InteractivePrompt.password(keyPrompt);
  if (!apiKey) {
    console.log(fail('API key is required'));
    process.exit(1);
  }
  return apiKey;
}

async function resolveModelConfiguration(
  baseUrl: string,
  preset: ProviderPreset | null,
  providedModel: string | undefined,
  yes: boolean | undefined
): Promise<{ model: string; models: ModelMapping }> {
  let openRouterModel: string | undefined;
  let openRouterTierMapping: { opus?: string; sonnet?: string; haiku?: string } | undefined;

  if (isOpenRouterUrl(baseUrl) && !providedModel) {
    console.log('');
    console.log(info('OpenRouter detected!'));
    const useInteractive = await InteractivePrompt.confirm('Browse models interactively?', {
      default: true,
    });
    if (useInteractive) {
      const selection = await pickOpenRouterModel();
      if (selection) {
        openRouterModel = selection.model;
        openRouterTierMapping = selection.tierMapping;
      }
    }
    console.log('');
    console.log(dim('Note: For OpenRouter, ANTHROPIC_API_KEY should be empty.'));
  }

  const defaultModel = preset?.defaultModel || 'claude-sonnet-4-6';
  let model = providedModel || openRouterModel || preset?.defaultModel;
  if (!model && !yes && !preset) {
    model = await InteractivePrompt.input('Default model (ANTHROPIC_MODEL)', {
      default: defaultModel,
    });
  }
  model = model || defaultModel;

  let opusModel = openRouterTierMapping?.opus || model;
  let sonnetModel = openRouterTierMapping?.sonnet || model;
  let haikuModel = openRouterTierMapping?.haiku || model;
  const shouldPromptForMapping = !yes && !openRouterTierMapping && !preset;

  if (shouldPromptForMapping) {
    let wantCustomMapping = model !== defaultModel;
    if (!wantCustomMapping) {
      console.log('');
      console.log(dim('Some API proxies route different model types to different backends.'));
      wantCustomMapping = await InteractivePrompt.confirm(
        'Configure different models for Opus/Sonnet/Haiku?',
        { default: false }
      );
    }

    if (wantCustomMapping) {
      console.log('');
      console.log(dim('Leave blank to use the default model for each tier.'));
      opusModel =
        (await InteractivePrompt.input('Opus model (ANTHROPIC_DEFAULT_OPUS_MODEL)', {
          default: model,
        })) || model;
      sonnetModel =
        (await InteractivePrompt.input('Sonnet model (ANTHROPIC_DEFAULT_SONNET_MODEL)', {
          default: model,
        })) || model;
      haikuModel =
        (await InteractivePrompt.input('Haiku model (ANTHROPIC_DEFAULT_HAIKU_MODEL)', {
          default: model,
        })) || model;
    }
  }

  return {
    model,
    models: {
      default: model,
      opus: opusModel,
      sonnet: sonnetModel,
      haiku: haikuModel,
    },
  };
}

async function resolveDefaultTarget(
  providedTarget: TargetType | undefined,
  yes: boolean | undefined
): Promise<TargetType> {
  if (providedTarget) {
    return providedTarget;
  }
  if (yes) {
    return 'claude';
  }

  const useDroidByDefault = await InteractivePrompt.confirm(
    'Set default target to Factory Droid for this profile?',
    { default: false }
  );
  return useDroidByDefault ? 'droid' : 'claude';
}

async function resolveClaudeLongContextPreference(
  models: ModelMapping,
  explicitPreference: boolean | undefined,
  yes: boolean | undefined
): Promise<boolean> {
  if (explicitPreference !== undefined) {
    return explicitPreference;
  }

  if (hasExplicitClaudeExtendedContext(models)) {
    return true;
  }

  if (yes) {
    return false;
  }

  console.log('');
  console.log(info('Claude long context is explicit in CCS.'));
  console.log(dim('  Plain Claude model IDs stay on standard context unless you opt into [1m].'));
  console.log(
    dim('  Some providers/accounts still require extra usage or PAYG for long-context requests.')
  );
  console.log(dim('  If that entitlement is missing, upstream requests can still return 429.'));
  console.log('');

  return InteractivePrompt.confirm('Enable [1m] for compatible Claude mappings?', {
    default: false,
  });
}

export async function handleApiCreateCommand(args: string[]): Promise<void> {
  await initUI();
  const parsedArgs = parseApiCommandArgs(args);
  exitOnApiCommandErrors(parsedArgs.errors);

  console.log(header('Create API Profile'));
  console.log('');

  if (parsedArgs.cliproxyProvider) {
    const cliproxyProvider = parsedArgs.cliproxyProvider.trim().toLowerCase();
    if (!isCLIProxyProvider(cliproxyProvider)) {
      console.log(fail(`Unknown CLIProxy provider: ${cliproxyProvider}`));
      console.log('');
      console.log(`Available providers: ${CLIPROXY_PROVIDER_IDS.join(', ')}`);
      process.exit(1);
    }

    const incompatibleFlags = [
      parsedArgs.baseUrl && '--base-url',
      parsedArgs.apiKey && '--api-key',
      parsedArgs.model && '--model',
      parsedArgs.preset && '--preset',
    ].filter(Boolean);

    if (incompatibleFlags.length > 0) {
      console.log(
        fail(`--cliproxy-provider cannot be combined with ${incompatibleFlags.join(', ')}`)
      );
      process.exit(1);
    }

    const name = await resolveCliproxyProfileName(
      cliproxyProvider,
      parsedArgs.name,
      parsedArgs.yes
    );
    const target = await resolveDefaultTarget(parsedArgs.target, parsedArgs.yes);

    if (name && apiProfileExists(name) && !parsedArgs.force) {
      console.log(fail(`API '${name}' already exists`));
      console.log(`    Use ${color('--force', 'command')} to overwrite`);
      process.exit(1);
    }

    console.log(
      info(
        `Using CLIProxy provider: ${getProviderDisplayName(cliproxyProvider)} (${cliproxyProvider})`
      )
    );
    console.log(
      dim('  CCS will create a routed API profile. Provider credentials stay managed by CLIProxy.')
    );
    console.log('');
    console.log(info('Creating API profile...'));

    const result = createCliproxyBridgeProfile(cliproxyProvider, {
      force: parsedArgs.force === true,
      name,
      target,
    });
    if (!result.success || !result.name || !result.cliproxyBridge) {
      console.log(fail(`Failed to create CLIProxy bridge profile: ${result.error}`));
      process.exit(1);
    }

    try {
      syncToLocalConfig();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.log(`[i] Auto-sync to CLIProxy config skipped: ${message}`);
    }

    const details =
      `API:      ${result.name}\n` +
      `Config:   ${isUsingUnifiedConfig() ? '~/.ccs/config.yaml' : '~/.ccs/config.json'}\n` +
      `Settings: ${result.settingsFile}\n` +
      `Provider: ${result.cliproxyBridge.providerDisplayName}\n` +
      `Route:    ${result.cliproxyBridge.routePath}\n` +
      `Proxy:    ${result.cliproxyBridge.currentBaseUrl}\n` +
      `Target:   ${target}`;

    console.log('');
    console.log(infoBox(details, 'CLIProxy Bridge Created'));
    console.log('');
    console.log(header('Usage'));
    if (target === 'droid') {
      console.log(
        `  ${color(`ccs ${result.name} "your prompt"`, 'command')} ${dim('# uses droid by default')}`
      );
      console.log(
        `  ${color(`ccs-droid ${result.name} "your prompt"`, 'command')} ${dim('# explicit droid alias')}`
      );
      console.log(
        `  ${color(`ccsd ${result.name} "your prompt"`, 'command')} ${dim('# legacy shortcut')}`
      );
    } else {
      console.log(`  ${color(`ccs ${result.name} "your prompt"`, 'command')}`);
      console.log(
        `  ${color(`ccs-droid ${result.name} "your prompt"`, 'command')} ${dim('# explicit one-off droid alias')}`
      );
      console.log(
        `  ${color(`ccs ${result.name} --target droid "your prompt"`, 'command')} ${dim('# target flag alternative')}`
      );
    }
    if (cliproxyProvider === 'codex') {
      console.log(
        `  ${color(`ccs ${result.name} --target codex "your prompt"`, 'command')} ${dim('# native Codex runtime')}`
      );
      console.log(
        `  ${color(`ccs-codex ${result.name} "your prompt"`, 'command')} ${dim('# explicit Codex alias')}`
      );
      console.log(
        `  ${color(`ccsx ${result.name} "your prompt"`, 'command')} ${dim('# short alias')}`
      );
    }
    console.log('');
    console.log(dim('Manage provider accounts, keys, and models in: ccs cliproxy'));
    return;
  }

  showPresetDeprecationNotice(parsedArgs.preset);
  const preset = resolvePresetOrExit(parsedArgs.preset);
  const name = await resolveProfileName(parsedArgs.name, preset);

  if (apiProfileExists(name) && !parsedArgs.force) {
    console.log(fail(`API '${name}' already exists`));
    console.log(`    Use ${color('--force', 'command')} to overwrite`);
    process.exit(1);
  }

  let baseUrl = await resolveBaseUrl(parsedArgs.baseUrl, preset);
  if (baseUrl && baseUrl.includes('api.anthropic.com') && !preset) {
    console.log('');
    console.log(info('Anthropic Direct API detected. Base URL will be omitted for native auth.'));
    baseUrl = '';
  }

  const apiKey = await resolveApiKey(parsedArgs.apiKey, preset);
  const { models } = await resolveModelConfiguration(
    baseUrl,
    preset,
    parsedArgs.model,
    parsedArgs.yes
  );
  const hasClaudeMappings = hasClaudeModelMapping(models);
  const shouldEnableClaudeLongContext = hasClaudeMappings
    ? await resolveClaudeLongContextPreference(models, parsedArgs.extendedContext, parsedArgs.yes)
    : false;
  const finalModels = hasClaudeMappings
    ? applyClaudeExtendedContextPreference(models, shouldEnableClaudeLongContext)
    : models;
  const target = await resolveDefaultTarget(parsedArgs.target, parsedArgs.yes);

  if (parsedArgs.extendedContext !== undefined && !hasClaudeMappings) {
    console.log('');
    console.log(
      dim('No compatible Claude mappings were detected, so --1m/--no-1m did not change models.')
    );
  }

  console.log('');
  console.log(info('Creating API profile...'));
  const result = createApiProfile(name, baseUrl || '', apiKey, finalModels, target);
  if (!result.success) {
    console.log(fail(`Failed to create API profile: ${result.error}`));
    process.exit(1);
  }

  try {
    syncToLocalConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.log(`[i] Auto-sync to CLIProxy config skipped: ${message}`);
  }

  const hasCustomMapping =
    finalModels.opus !== finalModels.default ||
    finalModels.sonnet !== finalModels.default ||
    finalModels.haiku !== finalModels.default;
  let details =
    `API:      ${name}\n` +
    `Config:   ${isUsingUnifiedConfig() ? '~/.ccs/config.yaml' : '~/.ccs/config.json'}\n` +
    `Settings: ${result.settingsFile}\n` +
    `Base URL: ${baseUrl}\n` +
    `Model:    ${finalModels.default}\n` +
    `Target:   ${target}`;

  if (hasClaudeMappings) {
    details += `\nLongCtx:  ${
      shouldEnableClaudeLongContext
        ? 'compatible Claude mappings use [1m]'
        : 'standard Claude context'
    }`;
  }

  if (hasCustomMapping) {
    details +=
      `\n\nModel Mapping:\n` +
      `  Opus:   ${finalModels.opus}\n` +
      `  Sonnet: ${finalModels.sonnet}\n` +
      `  Haiku:  ${finalModels.haiku}`;
  }

  console.log('');
  console.log(infoBox(details, 'API Profile Created'));
  if (hasClaudeMappings) {
    console.log('');
    console.log(
      dim(
        shouldEnableClaudeLongContext
          ? 'CCS saved [1m] on compatible Claude mappings. Provider-side extra-usage requirements can still reject long-context requests.'
          : 'Claude mappings were saved with standard context. Use --1m later if you want CCS to write [1m] explicitly.'
      )
    );
  }
  console.log('');
  console.log(header('Usage'));
  if (target === 'droid') {
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
  console.log(header('Edit Settings'));
  console.log(`  ${dim('To modify env vars later:')}`);
  console.log(`  ${color(`nano ${result.settingsFile.replace('~', '$HOME')}`, 'command')}`);
  console.log('');
}
