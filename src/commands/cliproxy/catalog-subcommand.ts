import { initUI, header, subheader, color, dim } from '../../utils/ui';
import { loadOrCreateUnifiedConfig } from '../../config/unified-config-loader';
import { createManagementClient } from '../../cliproxy/management-api-client';
import {
  getCacheAge,
  setCachedCatalog,
  clearCatalogCache,
  SYNCABLE_PROVIDERS,
  PROVIDER_TO_CHANNEL,
  getResolvedCatalog,
} from '../../cliproxy/catalog-cache';
import type { CLIProxyProvider } from '../../cliproxy/types';
import type { RemoteModelInfo } from '../../cliproxy/management-api-types';

/** Fetch model definitions from CLIProxyAPI for all syncable providers */
async function fetchRemoteCatalogs(
  verbose: boolean
): Promise<Record<string, RemoteModelInfo[]> | null> {
  const config = loadOrCreateUnifiedConfig();
  const remote = config.cliproxy_server?.remote;

  if (!remote?.host) {
    if (verbose) console.log(dim('  No remote CLIProxy configured'));
    return null;
  }

  const client = createManagementClient(remote);

  // Check health first
  const health = await client.health();
  if (!health.healthy) {
    console.log(color(`  [!] CLIProxy unreachable: ${health.error || 'unknown error'}`, 'warning'));
    return null;
  }

  if (verbose) {
    console.log(dim(`  Connected to ${client.getBaseUrl()}`));
    if (health.version) console.log(dim(`  CLIProxy version: ${health.version}`));
  }

  const result: Record<string, RemoteModelInfo[]> = {};

  for (const provider of SYNCABLE_PROVIDERS) {
    const channel = PROVIDER_TO_CHANNEL[provider];
    if (!channel) continue;

    try {
      const response = await client.getModelDefinitions(channel);
      if (response && response.length > 0) {
        result[provider] = response;
        if (verbose) console.log(dim(`  ${provider}: ${response.length} models`));
      }
    } catch {
      if (verbose) console.log(dim(`  ${provider}: fetch failed (skipped)`));
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

/** Show catalog status */
export async function handleCatalogStatus(verbose: boolean): Promise<void> {
  await initUI();
  console.log('');
  console.log(header('Model Catalog'));
  console.log('');

  const cacheAge = getCacheAge();
  if (cacheAge) {
    console.log(`  Cache: ${color('synced', 'success')} (${cacheAge})`);
  } else {
    console.log(`  Cache: ${color('static only', 'warning')} (no sync)`);
  }

  console.log('');
  console.log(subheader('Providers:'));

  for (const provider of SYNCABLE_PROVIDERS) {
    const catalog = getResolvedCatalog(provider);
    if (catalog) {
      const count = catalog.models.length;
      console.log(`  ${color(catalog.displayName.padEnd(20), 'command')} ${count} models`);
      if (verbose) {
        for (const model of catalog.models) {
          console.log(dim(`    - ${model.id} (${model.name})`));
        }
      }
    }
  }

  console.log('');
  if (!cacheAge) {
    console.log(dim('  Run "ccs cliproxy catalog refresh" to sync from CLIProxy'));
  }
  console.log('');
}

/** Refresh catalog from CLIProxyAPI */
export async function handleCatalogRefresh(verbose: boolean): Promise<void> {
  await initUI();
  console.log('');
  console.log(header('Catalog Refresh'));
  console.log('');

  const result = await fetchRemoteCatalogs(verbose);
  if (!result) {
    console.log('  Failed to fetch remote catalogs. Static catalog unchanged.');
    console.log('');
    return;
  }

  setCachedCatalog(result);

  // Show summary
  let totalModels = 0;
  for (const [provider, models] of Object.entries(result)) {
    const merged = getResolvedCatalog(provider as CLIProxyProvider);
    const mergedCount = merged?.models.length ?? 0;
    console.log(
      `  ${color(provider.padEnd(12), 'command')} ${models.length} remote -> ${mergedCount} merged`
    );
    totalModels += mergedCount;
  }

  console.log('');
  console.log(`  ${color('[OK]', 'success')} Catalog synced (${totalModels} total models)`);
  console.log('');
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
