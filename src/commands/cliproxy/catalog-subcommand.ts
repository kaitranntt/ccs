import { initUI, header, subheader, color, dim } from '../../utils/ui';
import {
  getCacheAge,
  clearCatalogCache,
  SYNCABLE_PROVIDERS,
  getResolvedCatalog,
  refreshCatalogFromProxy,
  getAllResolvedCatalogs,
} from '../../cliproxy/catalog-cache';
import { getCatalogRoutingSnapshot } from '../../cliproxy/catalog-routing';
import { ensureManagedModelPrefixes } from '../../cliproxy/managed-model-prefixes';
import { getProxyTarget } from '../../cliproxy/proxy-target-resolver';
import type { CLIProxyProvider } from '../../cliproxy/types';
import type { RemoteModelInfo } from '../../cliproxy/management-api-types';
import type { CliproxyProviderRoutingHints } from '../../shared/cliproxy-model-routing';

/** Fetch model definitions from CLIProxyAPI for all syncable providers */
async function fetchRemoteCatalogs(
  verbose: boolean
): Promise<Record<string, RemoteModelInfo[]> | null> {
  const target = getProxyTarget();

  if (verbose) {
    console.log(
      dim(
        `  Connected to ${target.protocol}://${target.host}:${target.port} (${target.isRemote ? 'remote' : 'local'})`
      )
    );
  }

  const result = await refreshCatalogFromProxy();
  if (verbose && result) {
    for (const provider of SYNCABLE_PROVIDERS) {
      const models = result[provider];
      if (models?.length) {
        console.log(dim(`  ${provider}: ${models.length} models`));
      }
    }
  }

  return result;
}

/** Show catalog status */
export async function handleCatalogStatus(verbose: boolean): Promise<void> {
  await initUI();
  console.log('');
  console.log(header('Model Catalog'));
  console.log('');

  let routingSnapshot: Awaited<ReturnType<typeof getCatalogRoutingSnapshot>> | null = null;
  if (verbose) {
    try {
      await ensureManagedModelPrefixes();
      routingSnapshot = await getCatalogRoutingSnapshot();
    } catch {
      routingSnapshot = null;
    }
  }

  const cacheAge = routingSnapshot?.cacheAge ?? getCacheAge();
  if (cacheAge) {
    console.log(`  Cache: ${color('synced', 'success')} (${cacheAge})`);
  } else {
    console.log(`  Cache: ${color('static only', 'warning')} (no sync)`);
  }

  console.log('');
  console.log(subheader('Providers:'));

  for (const provider of SYNCABLE_PROVIDERS) {
    const catalog = routingSnapshot?.catalogs[provider] ?? getResolvedCatalog(provider);
    if (catalog) {
      const count = catalog.models.length;
      const routing = routingSnapshot?.routing[provider];
      const suffix = renderRoutingSummary(routing);
      console.log(`  ${color(catalog.displayName.padEnd(20), 'command')} ${count} models${suffix}`);
      if (verbose) {
        renderVerboseRouting(provider, catalog.models, routing);
      }
    }
  }

  console.log('');
  if (!cacheAge) {
    console.log(dim('  Run "ccs cliproxy catalog refresh" to sync from CLIProxy'));
  }
  console.log('');
}

function renderRoutingSummary(routing: CliproxyProviderRoutingHints | undefined): string {
  if (!routing) {
    return '';
  }

  const parts = [`prefix ${routing.prefix}`];
  if (routing.shadowedCount > 0) {
    parts.push(`${routing.shadowedCount} shadowed`);
  }
  if (routing.prefixOnlyCount > 0) {
    parts.push(`${routing.prefixOnlyCount} prefix-only`);
  }
  return parts.length > 0 ? `  ${dim(`(${parts.join(', ')})`)}` : '';
}

function renderVerboseRouting(
  provider: CLIProxyProvider,
  models: Array<{ id: string; name: string }>,
  routing: CliproxyProviderRoutingHints | undefined
): void {
  if (!routing) {
    for (const model of models) {
      console.log(dim(`    - ${model.id} (${model.name})`));
    }
    return;
  }

  const routingMap = new Map(routing.models.map((hint) => [hint.modelId, hint]));
  for (const model of models) {
    const hint = routingMap.get(model.id);
    console.log(dim(`    - ${model.id} (${model.name})`));
    if (!hint) {
      continue;
    }

    console.log(
      dim(`      ${hint.pinnedAvailable ? 'preferred' : 'suggested'}: ${hint.recommendedModelId}`)
    );
    if (hint.unprefixedStatus === 'safe') {
      console.log(dim(`      unprefixed: resolves to ${routing.displayName}`));
      continue;
    }

    if (hint.unprefixedStatus === 'shadowed' && hint.effectiveDisplayName) {
      console.log(dim(`      unprefixed: currently resolves to ${hint.effectiveDisplayName}`));
      continue;
    }

    console.log(dim(`      unprefixed: not advertised, use ${hint.recommendedModelId}`));
  }

  if (provider === 'gemini' || provider === 'agy') {
    console.log(dim(`      short prefix stays backend-pinned even when unprefixed names overlap.`));
  }
}

/** Refresh catalog from CLIProxyAPI */
export async function handleCatalogRefresh(verbose: boolean): Promise<void> {
  await initUI();
  console.log('');
  console.log(header('Catalog Refresh'));
  console.log('');

  const result = await fetchRemoteCatalogs(verbose);
  if (!result) {
    console.log('  Failed to fetch live catalogs. Static catalog unchanged.');
    console.log('');
    return;
  }

  // Show summary
  let totalModels = 0;
  for (const [provider, models] of Object.entries(result)) {
    const merged = getResolvedCatalog(provider as CLIProxyProvider);
    const mergedCount = merged?.models.length ?? 0;
    console.log(
      `  ${color(provider.padEnd(12), 'command')} ${models.length} live -> ${mergedCount} merged`
    );
    totalModels += mergedCount;
  }

  console.log('');
  console.log(`  ${color('[OK]', 'success')} Catalog synced (${totalModels} total models)`);
  console.log('');
}

/**
 * Output catalog as JSON for programmatic consumption.
 * Used by OnSteroids and other tools to get available models per provider.
 * Format: { provider: [{ id, name }], ... }
 */
export function handleCatalogJson(): void {
  const catalogs = getAllResolvedCatalogs();
  const result: Record<string, Array<{ id: string; name: string }>> = {};
  for (const [provider, catalog] of Object.entries(catalogs)) {
    result[provider] = catalog.models.map((m) => ({ id: m.id, name: m.name }));
  }
  console.log(JSON.stringify(result));
}

/** Reset catalog cache */
export async function handleCatalogReset(): Promise<void> {
  await initUI();
  console.log('');

  const cleared = clearCatalogCache();
  if (cleared) {
    console.log(`  ${color('[OK]', 'success')} Catalog cache cleared. Using static catalog.`);
  } else {
    console.log('  No cache to clear.');
  }
  console.log('');
}
