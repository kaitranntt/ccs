/**
 * Settings dispatch flow — settings-based profiles (glm, glmt, kimi, etc.).
 *
 * Extracted from src/ccs.ts main() profileInfo.type === 'settings' branch.
 * Image-analysis prep is large enough to split; see settings-image-analysis-prep.ts.
 */

import { getSettingsPath } from '../../utils/config-manager';
import { loadSettings } from '../../config/config-loader-facade';
import { expandPath } from '../../utils/helpers';
import {
  validateGlmKey,
  validateMiniMaxKey,
  validateAnthropicKey,
} from '../../utils/api-key-validator';
import {
  ensureWebSearchMcpOrThrow,
  displayWebSearchStatus,
  getWebSearchHookEnv,
  syncWebSearchMcpToConfigDir,
  appendThirdPartyWebSearchToolArgs,
  createWebSearchTraceContext,
} from '../../utils/websearch-manager';
import {
  ensureImageAnalysisMcpOrThrow,
  syncImageAnalysisMcpToConfigDir,
  appendThirdPartyImageAnalysisToolArgs,
} from '../../utils/image-analysis';
import {
  appendBrowserToolArgs,
  ensureBrowserMcpOrThrow,
  resolveOptionalBrowserAttachRuntime,
  syncBrowserMcpToConfigDir,
} from '../../utils/browser';
import { getGlobalEnvConfig } from '../../config/config-loader-facade';
import {
  ensureProfileHooks as ensureImageAnalyzerHooks,
  removeImageAnalysisProfileHook,
} from '../../utils/hooks/image-analyzer-profile-hook-injector';
import { fail, info, warn } from '../../utils/ui';
import { execClaude, stripAnthropicRoutingEnv, stripBrowserEnv } from '../../utils/shell-executor';
import {
  isDeprecatedGlmtProfileName,
  normalizeDeprecatedGlmtEnv,
} from '../../utils/glmt-deprecation';
import { createOpenAICompatLaunchSettings } from '../../utils/openai-compat-launch-settings';
import {
  resolveDroidProvider,
  evaluateTargetRuntimeCompatibility,
  type TargetCredentials,
} from '../../targets';
import { resolveCliproxyBridgeMetadata } from '../../api/services/cliproxy-profile-bridge';
import {
  buildOpenAICompatProxyEnv,
  resolveOpenAICompatProfileConfig,
  startOpenAICompatProxy,
} from '../../proxy';
import { resolveSettingsImageAnalysisEnv } from './settings-image-analysis-prep';
import type { ProfileDispatchContext } from '../dispatcher-context';

export async function runSettingsFlow(ctx: ProfileDispatchContext): Promise<void> {
  const {
    profileInfo,
    resolvedTarget,
    claudeCli,
    targetAdapter,
    targetBinaryInfo,
    targetRemainingArgs,
    nativeClaudeRemainingArgs,
    runtimeReasoningOverride,
    codexRuntimeConfigOverrides,
    claudeBrowserExposure,
    claudeAttachConfig,
    resolvedSettingsPath: preResolvedSettingsPath,
    resolvedSettings: preResolvedSettings,
    resolvedCliproxyBridge: preResolvedCliproxyBridge,
    resolveProfileContinuityInheritance,
    remainingArgs,
  } = ctx;

  const imageAnalysisMcpReady =
    resolvedTarget === 'claude' ? ensureImageAnalysisMcpOrThrow() : true;
  const browserAttachRuntime =
    resolvedTarget === 'claude' &&
    claudeBrowserExposure?.exposeForLaunch &&
    claudeAttachConfig?.enabled
      ? await resolveOptionalBrowserAttachRuntime(claudeAttachConfig)
      : undefined;
  const browserRuntimeEnv = browserAttachRuntime?.runtimeEnv;
  if (browserAttachRuntime?.warning) {
    process.stderr.write(`${warn(browserAttachRuntime.warning)}\n`);
  }
  if (resolvedTarget === 'claude') {
    ensureWebSearchMcpOrThrow();
    if (browserRuntimeEnv) {
      ensureBrowserMcpOrThrow();
    }
  }

  // Display WebSearch status (single line, equilibrium UX)
  displayWebSearchStatus();

  const continuityInheritance =
    resolvedTarget === 'claude'
      ? await resolveProfileContinuityInheritance({
          profileName: profileInfo.name,
          profileType: profileInfo.type,
          target: resolvedTarget,
        })
      : {};
  if (continuityInheritance.sourceAccount && process.env.CCS_DEBUG) {
    console.error(
      info(
        `Continuity inheritance active: profile "${profileInfo.name}" -> account "${continuityInheritance.sourceAccount}"`
      )
    );
  }
  const inheritedClaudeConfigDir = continuityInheritance.claudeConfigDir;
  syncWebSearchMcpToConfigDir(inheritedClaudeConfigDir);
  syncImageAnalysisMcpToConfigDir(inheritedClaudeConfigDir);
  if (
    browserRuntimeEnv &&
    inheritedClaudeConfigDir &&
    !syncBrowserMcpToConfigDir(inheritedClaudeConfigDir)
  ) {
    throw new Error(
      'Browser MCP is enabled, but CCS could not sync the browser MCP config into the inherited Claude instance.'
    );
  }

  const expandedSettingsPath =
    preResolvedSettingsPath ??
    (profileInfo.settingsPath
      ? expandPath(profileInfo.settingsPath)
      : getSettingsPath(profileInfo.name));
  const settings = preResolvedSettings ?? loadSettings(expandedSettingsPath);
  const cliproxyBridge = preResolvedCliproxyBridge ?? resolveCliproxyBridgeMetadata(settings);

  let imageAnalysisFallbackHookReady: boolean | undefined;
  if (resolvedTarget === 'claude') {
    if (imageAnalysisMcpReady) {
      removeImageAnalysisProfileHook(profileInfo.name, expandedSettingsPath);
    } else {
      imageAnalysisFallbackHookReady = (
        await import('../../utils/hooks')
      ).prepareImageAnalysisFallbackHook();
      ensureImageAnalyzerHooks({
        profileName: profileInfo.name,
        profileType: profileInfo.type,
        settingsPath: expandedSettingsPath,
        settings,
        cliproxyBridge,
        sharedHookInstalled: imageAnalysisFallbackHookReady,
      });
    }
  }
  if (resolvedTarget !== 'claude') {
    const compatibility = evaluateTargetRuntimeCompatibility({
      target: resolvedTarget,
      profileType: profileInfo.type,
      cliproxyBridgeProvider: cliproxyBridge?.provider ?? null,
    });
    if (!compatibility.supported) {
      console.error(
        fail(
          compatibility.reason ||
            `${targetAdapter?.displayName || resolvedTarget} does not support this profile.`
        )
      );
      if (compatibility.suggestion) {
        console.error(info(compatibility.suggestion));
      }
      process.exit(1);
    }
  }

  const rawSettingsEnv = profileInfo.env ?? settings.env ?? {};
  const isDeprecatedGlmtProfile = isDeprecatedGlmtProfileName(profileInfo.name);
  const glmtNormalization = isDeprecatedGlmtProfile
    ? normalizeDeprecatedGlmtEnv(rawSettingsEnv)
    : null;
  const settingsEnv = glmtNormalization?.env ?? rawSettingsEnv;

  if (glmtNormalization) {
    for (const message of glmtNormalization.warnings) {
      console.error(warn(message));
    }
  }

  // Pre-flight validation for Z.AI-compatible profiles.
  if (profileInfo.name === 'glm' || isDeprecatedGlmtProfile) {
    const apiKey = settingsEnv['ANTHROPIC_AUTH_TOKEN'];
    if (apiKey) {
      const validation = await validateGlmKey(apiKey, settingsEnv['ANTHROPIC_BASE_URL']);
      if (!validation.valid) {
        console.error('');
        console.error(fail(validation.error || 'API key validation failed'));
        if (validation.suggestion) {
          console.error('');
          console.error(validation.suggestion);
        }
        console.error('');
        console.error(info('To skip validation: CCS_SKIP_PREFLIGHT=1 ccs glm "prompt"'));
        process.exit(1);
      }
    }
  }

  if (profileInfo.name === 'mm') {
    const apiKey = settingsEnv['ANTHROPIC_AUTH_TOKEN'];
    if (apiKey) {
      const validation = await validateMiniMaxKey(apiKey, settingsEnv['ANTHROPIC_BASE_URL']);
      if (!validation.valid) {
        console.error('');
        console.error(fail(validation.error || 'API key validation failed'));
        if (validation.suggestion) {
          console.error('');
          console.error(validation.suggestion);
        }
        console.error('');
        console.error(info('To skip validation: CCS_SKIP_PREFLIGHT=1 ccs mm "prompt"'));
        process.exit(1);
      }
    }
  }

  // Pre-flight validation for Anthropic direct profiles (ANTHROPIC_API_KEY + no BASE_URL)
  {
    const anthropicApiKey = settingsEnv['ANTHROPIC_API_KEY'];
    const hasBaseUrl = !!settingsEnv['ANTHROPIC_BASE_URL'];
    if (anthropicApiKey && !hasBaseUrl) {
      const validation = await validateAnthropicKey(anthropicApiKey);
      if (!validation.valid) {
        console.error('');
        console.error(fail(validation.error || 'API key validation failed'));
        if (validation.suggestion) {
          console.error('');
          console.error(validation.suggestion);
        }
        console.error('');
        console.error(
          info(`To skip validation: CCS_SKIP_PREFLIGHT=1 ccs ${profileInfo.name} "prompt"`)
        );
        process.exit(1);
      }
    }
  }

  // Image analysis env resolution (split into sibling helper to stay under LOC budget)
  const imageAnalysisEnv = await resolveSettingsImageAnalysisEnv({
    profileInfo,
    resolvedTarget,
    settings,
    cliproxyBridge,
    imageAnalysisMcpReady,
    imageAnalysisFallbackHookReady,
    remainingArgs,
    targetRemainingArgs,
  });

  const webSearchEnv = getWebSearchHookEnv();

  // Get global env vars (DISABLE_TELEMETRY, etc.) for third-party profiles
  const globalEnvConfig = getGlobalEnvConfig();
  const globalEnv = globalEnvConfig.enabled ? globalEnvConfig.env : {};

  // Log global env injection for visibility (debug mode only)
  if (globalEnvConfig.enabled && Object.keys(globalEnv).length > 0 && process.env.CCS_DEBUG) {
    const envNames = Object.keys(globalEnv).join(', ');
    console.error(info(`Global env: ${envNames}`));
  }

  // For Claude target launches that already pass `--settings`, keep runtime env free of
  // ANTHROPIC routing/auth while preserving non-routing profile env so nested Team/subagent
  // sessions can still inherit model intent and other profile-scoped runtime flags.
  const settingsRuntimeEnv = stripBrowserEnv({ ...globalEnv, ...settingsEnv });
  const claudeRuntimeEnvVars: NodeJS.ProcessEnv = {
    ...stripAnthropicRoutingEnv(settingsRuntimeEnv, settingsEnv),
    ...(inheritedClaudeConfigDir ? { CLAUDE_CONFIG_DIR: inheritedClaudeConfigDir } : {}),
    ...webSearchEnv,
    ...imageAnalysisEnv,
    ...(browserRuntimeEnv || {}),
    CCS_PROFILE_TYPE: 'settings',
    CCS_STRIP_INHERITED_ANTHROPIC_ENV: '1',
  };

  // Non-Claude targets still need effective credentials injected directly.
  const envVars: NodeJS.ProcessEnv = {
    ...settingsRuntimeEnv,
    ...(inheritedClaudeConfigDir ? { CLAUDE_CONFIG_DIR: inheritedClaudeConfigDir } : {}),
    ...webSearchEnv,
    ...imageAnalysisEnv,
    ...(browserRuntimeEnv || {}),
    CCS_PROFILE_TYPE: 'settings',
  };

  // Dispatch through target adapter for non-claude targets
  if (resolvedTarget !== 'claude') {
    const adapter = targetAdapter;
    if (!adapter) {
      console.error(fail(`Target adapter not found for "${resolvedTarget}"`));
      process.exit(1);
    }
    const directAnthropicBaseUrl =
      settingsEnv['ANTHROPIC_BASE_URL'] ||
      (settingsEnv['ANTHROPIC_API_KEY'] ? 'https://api.anthropic.com' : '');
    const creds: TargetCredentials = {
      profile: profileInfo.name,
      baseUrl: directAnthropicBaseUrl,
      apiKey: settingsEnv['ANTHROPIC_AUTH_TOKEN'] || settingsEnv['ANTHROPIC_API_KEY'] || '',
      model: settingsEnv['ANTHROPIC_MODEL'],
      provider: resolveDroidProvider({
        provider: settingsEnv['CCS_DROID_PROVIDER'] || settingsEnv['DROID_PROVIDER'],
        baseUrl: directAnthropicBaseUrl,
        model: settingsEnv['ANTHROPIC_MODEL'],
      }),
      reasoningOverride: runtimeReasoningOverride,
      runtimeConfigOverrides: codexRuntimeConfigOverrides,
      envVars,
    };
    await adapter.prepareCredentials(creds);
    const targetArgs = adapter.buildArgs(profileInfo.name, targetRemainingArgs, {
      creds,
      profileType: profileInfo.type,
      binaryInfo: targetBinaryInfo || undefined,
    });
    const targetEnv = adapter.buildEnv(creds, profileInfo.type);
    adapter.exec(targetArgs, targetEnv, { binaryInfo: targetBinaryInfo || undefined });
    return;
  }

  const imageAnalysisArgs = imageAnalysisMcpReady
    ? appendThirdPartyImageAnalysisToolArgs(nativeClaudeRemainingArgs)
    : nativeClaudeRemainingArgs;
  const browserArgs = browserRuntimeEnv
    ? appendBrowserToolArgs(imageAnalysisArgs)
    : imageAnalysisArgs;
  const openAICompatProfile = resolveOpenAICompatProfileConfig(
    profileInfo.name,
    expandedSettingsPath,
    settingsEnv
  );
  if (openAICompatProfile) {
    const proxyStart = await startOpenAICompatProxy(openAICompatProfile, {
      insecure: openAICompatProfile.insecure,
    });
    if (!proxyStart.success) {
      console.error(fail(proxyStart.error || 'Failed to start local OpenAI-compatible proxy'));
      process.exit(1);
    }

    console.error(
      info(
        `Using local OpenAI-compatible proxy for "${profileInfo.name}" on port ${proxyStart.port}`
      )
    );

    const proxyEnv = {
      ...envVars,
      ...buildOpenAICompatProxyEnv(
        openAICompatProfile,
        proxyStart.port,
        proxyStart.authToken || '',
        inheritedClaudeConfigDir
      ),
    };
    delete proxyEnv.ANTHROPIC_API_KEY;
    const launchSettings = createOpenAICompatLaunchSettings(expandedSettingsPath, settings);

    const launchArgs = [
      '--settings',
      launchSettings.settingsPath,
      ...appendThirdPartyWebSearchToolArgs(browserArgs),
    ];
    const traceEnv = createWebSearchTraceContext({
      launcher: 'ccs.settings-profile.proxy',
      args: launchArgs,
      profile: profileInfo.name,
      profileType: profileInfo.type,
      settingsPath: expandedSettingsPath,
    });

    execClaude(claudeCli, launchArgs, { ...proxyEnv, ...traceEnv }, launchSettings.cleanup);
    return;
  }

  const launchArgs = [
    '--settings',
    expandedSettingsPath,
    ...appendThirdPartyWebSearchToolArgs(browserArgs),
  ];
  const traceEnv = createWebSearchTraceContext({
    launcher: 'ccs.settings-profile',
    args: launchArgs,
    profile: profileInfo.name,
    profileType: profileInfo.type,
    settingsPath: expandedSettingsPath,
  });

  execClaude(claudeCli, launchArgs, { ...claudeRuntimeEnvVars, ...traceEnv });
}
