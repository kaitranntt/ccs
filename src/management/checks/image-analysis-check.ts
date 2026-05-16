/**
 * Image Analysis Config Check
 *
 * Validates image_analysis configuration in config.yaml.
 * Checks: enabled status, provider_models, timeout, CLIProxy availability.
 */

import { DEFAULT_IMAGE_ANALYSIS_CONFIG } from '../../config/unified-config-types';
import {
  countManagedImageAnalysisHookFiles,
  hasImageAnalysisMcpReady,
  repairImageAnalysisRuntimeState,
} from '../../utils/image-analysis';
import { ok, warn, dim } from '../../utils/ui';
import { isCliproxyRunning } from '../../cliproxy/services/stats-fetcher';
import { CLIPROXY_DEFAULT_PORT } from '../../cliproxy/config/config-generator';
import type { HealthCheck } from './types';
import { hasImageAnalyzerHook } from '../../utils/hooks/image-analyzer-hook-installer';
import { getImageAnalysisConfig } from '../../config/config-loader-facade';

/**
 * Run image analysis configuration check
 */
export async function runImageAnalysisCheck(results: HealthCheck): Promise<void> {
  const config = getImageAnalysisConfig();

  // Check 1: Feature status
  if (!config.enabled) {
    results.details['Image Analysis'] = {
      status: 'OK',
      info: 'Disabled (using native Read)',
    };
    console.log(`  ${dim('Status:')} Disabled`);
    console.log(`  ${dim('Tip:')} Enable with: ccs config image-analysis --enable`);
    return;
  }

  // Feature is enabled - run validation checks
  console.log(`  ${ok('Status:')} Enabled`);

  // Check 2: Provider models configured
  const providers = Object.keys(config.provider_models);
  if (providers.length === 0) {
    results.details['Image Analysis'] = {
      status: 'ERROR',
      info: 'No providers configured',
    };
    results.errors.push({
      name: 'Image Analysis',
      message: 'No provider models configured for image analysis',
      fix: 'ccs config image-analysis --set-model agy gemini-3-1-flash-preview',
    });
    console.log(`  ${warn('Providers:')} None configured`);
    return;
  }
  console.log(`  ${ok('Providers:')} ${providers.join(', ')}`);

  // Check 3: Timeout validation
  if (config.timeout < 10 || config.timeout > 600) {
    results.details['Image Analysis'] = {
      status: 'ERROR',
      info: `Invalid timeout: ${config.timeout}s`,
    };
    results.errors.push({
      name: 'Image Analysis',
      message: `Timeout ${config.timeout}s out of range (10-600)`,
      fix: 'ccs config image-analysis --timeout 60',
    });
    console.log(`  ${warn('Timeout:')} ${config.timeout}s (invalid, must be 10-600)`);
    return;
  }
  console.log(`  ${ok('Timeout:')} ${config.timeout}s`);

  const staleHookCount = countManagedImageAnalysisHookFiles();
  if (staleHookCount > 0) {
    results.warnings.push({
      name: 'Image Analysis',
      message: `${staleHookCount} stale CCS-managed image hook setting file(s) were detected`,
      fix: 'Run: ccs doctor --fix',
    });
    console.log(`  ${warn('Hooks:')} ${staleHookCount} stale setting file(s) can be repaired`);
  }

  // Check 4: CLIProxy availability (only if enabled)
  const cliproxyAvailable = await isCliproxyRunning(CLIPROXY_DEFAULT_PORT);
  if (!cliproxyAvailable) {
    results.details['Image Analysis'] = {
      status: 'WARN',
      info: 'Enabled; local CLIProxy will start on launch if needed',
    };
    results.warnings.push({
      name: 'Image Analysis',
      message:
        'CLIProxy not running yet - CCS will start it automatically when ImageAnalysis is used',
      fix: 'Optional warm-up: ccs config',
    });
    console.log(
      `  ${warn('CLIProxy:')} Idle at http://127.0.0.1:${CLIPROXY_DEFAULT_PORT} (auto-start on launch)`
    );
    return;
  }
  console.log(`  ${ok('CLIProxy:')} Available at http://127.0.0.1:${CLIPROXY_DEFAULT_PORT}`);

  // All checks passed
  results.details['Image Analysis'] = {
    status: 'OK',
    info: `Enabled (${providers.length} providers)`,
  };
}

/**
 * Fix image analysis configuration issues
 */
export async function fixImageAnalysisConfig(): Promise<boolean> {
  const { updateConfig, loadOrCreateUnifiedConfig } = await import(
    '../../config/config-loader-facade'
  );

  const config = loadOrCreateUnifiedConfig();
  let fixed = false;
  const hadManagedToolReady = hasImageAnalysisMcpReady();
  const hadSharedHookReady = hasImageAnalyzerHook();

  // Fix missing provider_models
  if (
    !config.image_analysis?.provider_models ||
    Object.keys(config.image_analysis.provider_models).length === 0
  ) {
    config.image_analysis = {
      ...config.image_analysis,
      enabled: config.image_analysis?.enabled ?? true,
      timeout: config.image_analysis?.timeout ?? 60,
      provider_models: { ...DEFAULT_IMAGE_ANALYSIS_CONFIG.provider_models },
    };
    fixed = true;
  }

  // Fix invalid timeout
  if (
    config.image_analysis &&
    (config.image_analysis.timeout < 10 || config.image_analysis.timeout > 600)
  ) {
    config.image_analysis.timeout = 60;
    fixed = true;
  }

  if (fixed) {
    updateConfig({ image_analysis: config.image_analysis });
  }

  const repairStats = repairImageAnalysisRuntimeState();
  return (
    fixed ||
    repairStats.cleanedSettingsFiles > 0 ||
    repairStats.syncedInstances > 0 ||
    (!hadManagedToolReady && repairStats.managedToolReady) ||
    (!hadSharedHookReady && repairStats.sharedHookReady)
  );
}
