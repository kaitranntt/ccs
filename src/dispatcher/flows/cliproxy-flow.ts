/**
 * CLIProxy dispatch flow — OAuth-based profiles (gemini, codex, agy, qwen) or user-defined variants.
 *
 * Extracted from src/ccs.ts main() profileInfo.type === 'cliproxy' branch.
 */

import { expandPath } from '../../utils/helpers';
import { fail, info } from '../../utils/ui';
import {
  execClaudeWithCLIProxy,
  type CLIProxyProvider,
  ensureCliproxyService,
  isAuthenticated,
} from '../../cliproxy';
import { getEffectiveEnvVars, getCompositeEnvVars } from '../../cliproxy/config/env-builder';
import { resolveLifecyclePort } from '../../cliproxy/config/port-manager';
import { ensureImageAnalysisMcpOrThrow } from '../../utils/image-analysis';
import {
  ensureProfileHooks as ensureImageAnalyzerHooks,
  removeImageAnalysisProfileHook,
} from '../../utils/hooks/image-analyzer-profile-hook-injector';
import { prepareImageAnalysisFallbackHook } from '../../utils/hooks';
import { resolveDroidProvider, type TargetCredentials } from '../../targets';
import type { ProfileDispatchContext } from '../dispatcher-context';

export async function runCliproxyFlow(ctx: ProfileDispatchContext): Promise<void> {
  const {
    profileInfo,
    resolvedTarget,
    claudeCli,
    targetAdapter,
    targetRemainingArgs,
    runtimeReasoningOverride,
    codexRuntimeConfigOverrides,
    remainingArgs,
  } = ctx;

  const imageAnalysisMcpReady =
    resolvedTarget === 'claude' ? ensureImageAnalysisMcpOrThrow() : true;
  const provider = profileInfo.provider || (profileInfo.name as CLIProxyProvider);
  const expandedCliproxySettingsPath = profileInfo.settingsPath
    ? expandPath(profileInfo.settingsPath)
    : undefined;
  if (resolvedTarget === 'claude') {
    if (imageAnalysisMcpReady) {
      removeImageAnalysisProfileHook(profileInfo.name, expandedCliproxySettingsPath);
    } else {
      const imageAnalysisFallbackHookReady = prepareImageAnalysisFallbackHook();
      ensureImageAnalyzerHooks({
        profileName: profileInfo.name,
        profileType: profileInfo.type,
        cliproxyProvider: provider,
        isComposite: profileInfo.isComposite,
        settingsPath: expandedCliproxySettingsPath,
        sharedHookInstalled: imageAnalysisFallbackHookReady,
      });
    }
  }
  const customSettingsPath = profileInfo.settingsPath; // undefined for hardcoded profiles
  const variantPort = profileInfo.port; // variant-specific port for isolation
  const cliproxyPort = variantPort || resolveLifecyclePort();

  if (resolvedTarget !== 'claude') {
    const adapter = targetAdapter;
    if (!adapter) {
      process.stderr.write(String(fail(`Target adapter not found for "${resolvedTarget}"`)) + '\n');
      process.exitCode = 1;
      return;
    }
    if (!adapter.supportsProfileType('cliproxy')) {
      process.stderr.write(
        String(fail(`${adapter.displayName} does not support CLIProxy profiles`)) + '\n'
      );
      process.exitCode = 1;
      return;
    }

    // Keep CLIProxy management/auth flags on Claude flow only.
    const unsupportedCliproxyFlags = [
      '--auth',
      '--logout',
      '--accounts',
      '--add',
      '--use',
      '--config',
      '--headless',
      '--paste-callback',
      '--port-forward',
      '--nickname',
      '--kiro-auth-method',
      '--kiro-idc-start-url',
      '--kiro-idc-region',
      '--kiro-idc-flow',
      '--backend',
      '--proxy-host',
      '--proxy-port',
      '--proxy-protocol',
      '--proxy-auth-token',
      '--proxy-timeout',
      '--local-proxy',
      '--remote-only',
      '--no-fallback',
      '--allow-self-signed',
      '--1m',
      '--no-1m',
    ];
    const providedUnsupportedFlag = unsupportedCliproxyFlags.find(
      (flag) =>
        targetRemainingArgs.includes(flag) ||
        targetRemainingArgs.some((arg) => arg.startsWith(`${flag}=`))
    );
    if (providedUnsupportedFlag) {
      process.stderr.write(
        String(
          fail(
            `${providedUnsupportedFlag} is only supported when running CLIProxy profiles on Claude target`
          )
        ) + '\n'
      );
      process.stderr.write(
        String(info(`Run with Claude target: ccs ${profileInfo.name} --target claude ...`)) + '\n'
      );
      process.exitCode = 1;
      return;
    }

    // For Droid execution path, require existing OAuth auth and running local proxy.
    if (profileInfo.isComposite && profileInfo.compositeTiers) {
      const compositeProviders = [
        ...new Set(Object.values(profileInfo.compositeTiers).map((tier) => tier.provider)),
      ] as CLIProxyProvider[];
      const missingProvider = compositeProviders.find((p) => !isAuthenticated(p));
      if (missingProvider) {
        process.stderr.write(
          String(fail(`Missing OAuth auth for composite tier provider: ${missingProvider}`)) + '\n'
        );
        process.stderr.write(
          String(info(`Authenticate first: ccs ${missingProvider} --auth`)) + '\n'
        );
        process.exitCode = 1;
        return;
      }
    } else if (!isAuthenticated(provider)) {
      process.stderr.write(
        String(fail(`No OAuth authentication found for provider: ${provider}`)) + '\n'
      );
      process.stderr.write(String(info(`Authenticate first: ccs ${provider} --auth`)) + '\n');
      process.exitCode = 1;
      return;
    }

    const ensureServiceResult = await ensureCliproxyService(
      cliproxyPort,
      targetRemainingArgs.includes('--verbose') || targetRemainingArgs.includes('-v')
    );
    if (!ensureServiceResult.started) {
      process.stderr.write(
        String(fail(ensureServiceResult.error || 'Failed to start local CLIProxy service')) + '\n'
      );
      process.exitCode = 1;
      return;
    }

    const envVars =
      profileInfo.isComposite && profileInfo.compositeTiers && profileInfo.compositeDefaultTier
        ? getCompositeEnvVars(
            profileInfo.compositeTiers,
            profileInfo.compositeDefaultTier,
            cliproxyPort,
            customSettingsPath
          )
        : getEffectiveEnvVars(provider, cliproxyPort, customSettingsPath);

    const creds: TargetCredentials = {
      profile: profileInfo.name,
      baseUrl: envVars['ANTHROPIC_BASE_URL'] || '',
      apiKey: envVars['ANTHROPIC_AUTH_TOKEN'] || '',
      model: envVars['ANTHROPIC_MODEL'] || undefined,
      provider: resolveDroidProvider({
        provider: envVars['CCS_DROID_PROVIDER'] || envVars['DROID_PROVIDER'],
        baseUrl: envVars['ANTHROPIC_BASE_URL'],
        model: envVars['ANTHROPIC_MODEL'],
      }),
      reasoningOverride: runtimeReasoningOverride,
      runtimeConfigOverrides: codexRuntimeConfigOverrides,
      envVars,
    };

    if (!creds.baseUrl || !creds.apiKey) {
      process.stderr.write(
        String(
          fail(
            `Missing CLIProxy runtime credentials for ${profileInfo.name} (ANTHROPIC_BASE_URL/AUTH_TOKEN)`
          )
        ) + '\n'
      );
      process.stderr.write(
        String(info('Reconfigure with: ccs config > CLIProxy, or run ccs <provider> --config')) +
          '\n'
      );
      process.exitCode = 1;
      return;
    }

    await adapter.prepareCredentials(creds);
    const targetArgs = adapter.buildArgs(profileInfo.name, targetRemainingArgs, {
      creds,
      profileType: profileInfo.type,
      binaryInfo: ctx.targetBinaryInfo || undefined,
    });
    const targetEnv = adapter.buildEnv(creds, profileInfo.type);
    adapter.exec(targetArgs, targetEnv, { binaryInfo: ctx.targetBinaryInfo || undefined });
    return;
  }

  await execClaudeWithCLIProxy(claudeCli, provider, remainingArgs, {
    customSettingsPath,
    port: cliproxyPort,
    isComposite: profileInfo.isComposite,
    compositeTiers: profileInfo.compositeTiers,
    compositeDefaultTier: profileInfo.compositeDefaultTier,
    profileName: profileInfo.name,
  });
}
