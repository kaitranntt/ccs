/**
 * Image Analysis Config Check
 *
 * Validates image_analysis configuration in config.yaml.
 * Checks: enabled status, provider_models, timeout, CLIProxy availability.
 */

import { getImageAnalysisConfig } from '../../config/unified-config-loader';
import { DEFAULT_IMAGE_ANALYSIS_CONFIG } from '../../config/unified-config-types';
import { ok, warn, dim } from '../../utils/ui';
import { isCliproxyRunning } from '../../cliproxy/stats-fetcher';
import { CLIPROXY_DEFAULT_PORT } from '../../cliproxy/config-generator';
import type { HealthCheck } from './types';

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
      fix: 'ccs config image-analysis --set-model agy gemini-2.5-flash',
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

  // Check 4: CLIProxy availability (only if enabled)
  const cliproxyAvailable = await isCliproxyRunning(CLIPROXY_DEFAULT_PORT);
  if (!cliproxyAvailable) {
    results.details['Image Analysis'] = {
      status: 'WARN',
      info: `Enabled but CLIProxy not running`,
    };
    results.warnings.push({
      name: 'Image Analysis',
      message: 'CLIProxy not running - image analysis will fail',
      fix: 'ccs config (starts CLIProxy)',
    });
    console.log(`  ${warn('CLIProxy:')} Not running at http://127.0.0.1:${CLIPROXY_DEFAULT_PORT}`);
    console.log(`  ${dim('Note:')} Start with: ccs config`);
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
  const { updateUnifiedConfig, loadOrCreateUnifiedConfig } =
    await import('../../config/unified-config-loader');

  const config = loadOrCreateUnifiedConfig();
  let fixed = false;

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
    updateUnifiedConfig({ image_analysis: config.image_analysis });
  }

  return fixed;
}
