import * as yaml from 'js-yaml';
import type { CLIProxyFallbackChainConfig } from '../../config/schemas/cliproxy';

interface KebabCandidate {
  provider: string;
  model: string;
}

interface KebabChainEntry {
  candidates: KebabCandidate[];
  'sticky-primary'?: boolean;
  'exhaustion-cooldown'?: string;
}

/**
 * Format a fallback-chain configuration map into CLIProxy config.yaml syntax.
 * Uses js-yaml to safely serialize user-controlled route keys and model strings,
 * ensuring special characters (: , #, newlines, boolean strings) are properly escaped.
 */
export function serializeFallbackChainSection(config?: CLIProxyFallbackChainConfig): string {
  if (!config || Object.keys(config).length === 0) {
    return '';
  }

  const rawTree: Record<string, KebabChainEntry> = {};

  for (const [routeKey, chain] of Object.entries(config)) {
    if (!chain || !Array.isArray(chain.candidates) || chain.candidates.length === 0) {
      continue;
    }

    const candidates: KebabCandidate[] = chain.candidates.map((c) => ({
      provider: c.provider,
      model: c.model,
    }));

    const entry: KebabChainEntry = { candidates };
    if (chain.sticky_primary !== undefined) {
      entry['sticky-primary'] = chain.sticky_primary;
    }
    if (chain.exhaustion_cooldown) {
      entry['exhaustion-cooldown'] = chain.exhaustion_cooldown;
    }

    rawTree[routeKey] = entry;
  }

  if (Object.keys(rawTree).length === 0) {
    return '';
  }

  const dumped = yaml.dump(
    { 'fallback-chain': rawTree },
    {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
      quotingType: '"',
    }
  );

  return dumped.trim();
}
