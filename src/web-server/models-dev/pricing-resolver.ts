import { getCachedModelsDevRegistry } from './registry-cache';
import type { ModelsDevCost, ModelsDevModel, ModelsDevProvider, ModelsDevRegistry } from './types';

export interface ModelsDevPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheCreationPerMillion: number;
  cacheReadPerMillion: number;
}

export interface ModelsDevPricingResolution {
  provider: string;
  model: string;
  pricing: ModelsDevPricing;
}

export interface ModelsDevPricingLookupOptions {
  provider?: string;
}

const PROVIDER_ALIASES: Record<string, string> = {
  agy: 'google',
  antigravity: 'google',
  claude: 'anthropic',
  codex: 'openai',
  copilot: 'github-copilot',
  gemini: 'google',
  ghcp: 'github-copilot',
  github: 'github-copilot',
  kimi: 'moonshotai',
  moonshot: 'moonshotai',
  qwen: 'alibaba',
};

function normalizeId(value: string): string {
  return value.trim().toLowerCase();
}

function isModelEntry(value: unknown): value is ModelsDevModel {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeModelsDevProviderId(
  provider: string | null | undefined
): string | undefined {
  if (!provider) return undefined;
  const normalized = normalizeId(provider);
  return PROVIDER_ALIASES[normalized] ?? normalized;
}

function splitProviderPrefix(model: string): { provider?: string; model: string } {
  const trimmed = model.trim();
  const slashIndex = trimmed.indexOf('/');
  if (slashIndex <= 0) return { model: trimmed };
  return {
    provider: trimmed.slice(0, slashIndex),
    model: trimmed.slice(slashIndex + 1),
  };
}

function stripClaudeDateSuffix(model: string): string {
  if (!model.startsWith('claude-')) return model;
  return model.replace(/-\d{8}(?=-thinking(?:$|:))/g, '').replace(/-\d{8}(?=$|:)/g, '');
}

function getModelCandidates(model: string): string[] {
  const normalized = normalizeId(model);
  const baseModel = normalized.split(':')[0];
  const candidates = [normalized];

  if (baseModel !== normalized) candidates.push(baseModel);

  for (const candidate of [...candidates]) {
    const stripped = stripClaudeDateSuffix(candidate);
    if (stripped !== candidate && !candidates.includes(stripped)) {
      candidates.push(stripped);
    }
  }

  return candidates;
}

function findProvider(
  registry: ModelsDevRegistry,
  provider: string | undefined
): ModelsDevProvider | undefined {
  const normalizedProvider = normalizeModelsDevProviderId(provider);
  if (!normalizedProvider) return undefined;
  return registry[normalizedProvider];
}

function findModel(provider: ModelsDevProvider, model: string): ModelsDevModel | undefined {
  const models = provider.models;
  if (!models) return undefined;

  const normalizedEntries = new Map<string, ModelsDevModel>();
  for (const [key, value] of Object.entries(models)) {
    if (!isModelEntry(value)) continue;
    normalizedEntries.set(normalizeId(key), value);
    if (typeof value.id === 'string') normalizedEntries.set(normalizeId(value.id), value);
  }

  for (const candidate of getModelCandidates(model)) {
    const match = normalizedEntries.get(candidate);
    if (match) return match;
  }

  return undefined;
}

function toNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toPricing(cost: ModelsDevCost | null | undefined): ModelsDevPricing | undefined {
  const input = toNumber(cost?.input);
  const output = toNumber(cost?.output);
  if (input === undefined || output === undefined) return undefined;

  return {
    inputPerMillion: input,
    outputPerMillion: output,
    cacheCreationPerMillion: toNumber(cost?.cache_write) ?? 0,
    cacheReadPerMillion: toNumber(cost?.cache_read) ?? 0,
  };
}

function samePricing(left: ModelsDevPricing, right: ModelsDevPricing): boolean {
  return (
    left.inputPerMillion === right.inputPerMillion &&
    left.outputPerMillion === right.outputPerMillion &&
    left.cacheCreationPerMillion === right.cacheCreationPerMillion &&
    left.cacheReadPerMillion === right.cacheReadPerMillion
  );
}

function resolveProviderModel(
  registry: ModelsDevRegistry,
  providerId: string | undefined,
  model: string
): ModelsDevPricingResolution | undefined {
  const provider = findProvider(registry, providerId);
  if (!provider) return undefined;

  const entry = findModel(provider, model);
  const pricing = toPricing(entry?.cost);
  if (!entry || !pricing) return undefined;

  return { provider: provider.id, model: entry.id, pricing };
}

function resolveUnambiguousModel(
  registry: ModelsDevRegistry,
  model: string
): ModelsDevPricingResolution | undefined {
  const matches: ModelsDevPricingResolution[] = [];

  for (const provider of Object.values(registry)) {
    const match = resolveProviderModel(registry, provider.id, model);
    if (match) matches.push(match);
  }

  if (matches.length === 0) return undefined;
  const first = matches[0];
  if (matches.every((match) => samePricing(first.pricing, match.pricing))) {
    return first;
  }
  return undefined;
}

export function resolveModelsDevPricing(
  model: string,
  options: ModelsDevPricingLookupOptions = {}
): ModelsDevPricingResolution | undefined {
  const registry = getCachedModelsDevRegistry({ allowStale: true });
  if (!registry) return undefined;

  const prefixed = splitProviderPrefix(model);
  const provider = options.provider ?? prefixed.provider;
  const modelId = prefixed.model;

  if (provider) {
    return resolveProviderModel(registry, provider, modelId);
  }

  return resolveUnambiguousModel(registry, modelId);
}

export function getKnownModelsDevModels(): string[] {
  const registry = getCachedModelsDevRegistry({ allowStale: true });
  if (!registry) return [];

  const ids = new Set<string>();
  for (const provider of Object.values(registry)) {
    for (const model of Object.values(provider.models ?? {})) {
      if (!model || typeof model !== 'object') continue;
      if (typeof model.id === 'string') ids.add(`${provider.id}/${model.id}`);
    }
  }
  return Array.from(ids).sort((a, b) => a.localeCompare(b));
}
