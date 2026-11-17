/**
 * WebSearch Health Checks
 *
 * Check WebSearch providers (real backends + legacy fallback).
 */

import { getWebSearchCliProviders, hasAnyWebSearchCli } from '../../utils/websearch-manager';
import type { HealthCheck } from './types';

/**
 * Check WebSearch CLI providers
 */
export function checkWebSearchClis(): HealthCheck[] {
  const providers = getWebSearchCliProviders();
  const checks: HealthCheck[] = [];

  for (const provider of providers) {
    if (provider.enabled && provider.available) {
      checks.push({
        id: `websearch-${provider.id}`,
        name: provider.name,
        status: 'ok',
        message: provider.detail,
        details: provider.description,
      });
    } else {
      checks.push({
        id: `websearch-${provider.id}`,
        name: provider.name,
        status: 'info',
        message: provider.enabled ? provider.detail : 'Disabled',
        fix: provider.installCommand,
        details: provider.description,
      });
    }
  }

  // Add summary check if no providers are ready
  if (!hasAnyWebSearchCli()) {
    checks.push({
      id: 'websearch-summary',
      name: 'WebSearch Status',
      status: 'warning',
      message: 'No ready provider',
      fix: 'Enable DuckDuckGo, configure SearXNG URL, or set EXA_API_KEY/TAVILY_API_KEY/KEENABLE_API_KEY/BRAVE_API_KEY',
      details: 'Third-party profiles need a local WebSearch backend.',
    });
  }

  return checks;
}
