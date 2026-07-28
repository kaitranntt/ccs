import type { ProviderCatalog } from '@/components/cliproxy/provider-model-selector';
import {
  applyCodexEffortSuffix,
  getSelectableCodexEfforts,
  parseCodexEffort,
  stripCodexEffortSuffix,
  type CodexEffort,
} from '@/lib/codex-effort';
import { findCatalogModel } from '@/lib/model-catalogs';

export interface ReasoningAdapter {
  parse(value: string | undefined): string | undefined;
  strip(value: string | undefined): string;
  apply(value: string | undefined, level?: string): string;
  getOptions(baseId: string, catalog: ProviderCatalog): string[] | null;
}

const XAI_LEVEL_SUFFIX_REGEX = /\(([a-z]+)\)$/i;

export function parseXaiReasoningLevel(modelId: string | undefined): string | undefined {
  const match = modelId?.trim().match(XAI_LEVEL_SUFFIX_REGEX);
  return match?.[1]?.toLowerCase();
}

export function stripXaiReasoningSuffix(modelId: string | undefined): string {
  return modelId?.trim().replace(XAI_LEVEL_SUFFIX_REGEX, '') ?? '';
}

export function applyXaiReasoningSuffix(modelId: string | undefined, level?: string): string {
  const baseModelId = stripXaiReasoningSuffix(modelId);
  if (!baseModelId || !level) return baseModelId;
  return `${baseModelId}(${level})`;
}

const codexAdapter: ReasoningAdapter = {
  parse: (value) => parseCodexEffort(value),
  strip: (value) => stripCodexEffortSuffix(value),
  apply: (value, level) => applyCodexEffortSuffix(value, level as CodexEffort | undefined),
  getOptions: (baseId, catalog) => {
    const model = baseId ? findCatalogModel(catalog.provider, baseId, catalog) : undefined;
    return getSelectableCodexEfforts(model?.codexMaxEffort, model?.codexEfforts);
  },
};

const xaiAdapter: ReasoningAdapter = {
  parse: parseXaiReasoningLevel,
  strip: stripXaiReasoningSuffix,
  apply: applyXaiReasoningSuffix,
  getOptions: (baseId, catalog) => {
    if (!baseId) return null;
    const levels = findCatalogModel(catalog.provider, baseId, catalog)?.reasoningLevels;
    return levels?.length ? [...levels] : null;
  },
};

const REASONING_ADAPTERS: Record<string, ReasoningAdapter> = {
  codex: codexAdapter,
  xai: xaiAdapter,
};

export function getReasoningAdapter(provider: string | undefined): ReasoningAdapter | undefined {
  return provider ? REASONING_ADAPTERS[provider.toLowerCase()] : undefined;
}
