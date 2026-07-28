export type CodexEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
export type CodexServiceTier = 'fast';

const CODEX_TUNING_SUFFIX_TOKEN_REGEX = /-(minimal|low|medium|high|xhigh|fast)$/i;
export const CODEX_EFFORTS_IN_ORDER: readonly CodexEffort[] = [
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
];

function trimModelId(modelId: string | undefined): string {
  return modelId?.trim() ?? '';
}

function parseCodexTuningSuffix(modelId: string | undefined): {
  baseModel: string;
  effort: CodexEffort | undefined;
  serviceTier: CodexServiceTier | undefined;
} {
  let baseModel = trimModelId(modelId);
  let effort: CodexEffort | undefined;
  let serviceTier: CodexServiceTier | undefined;

  for (let consumed = 0; consumed < 2; consumed += 1) {
    const match = baseModel.match(CODEX_TUNING_SUFFIX_TOKEN_REGEX);
    if (!match?.[1]) break;

    const token = match[1].toLowerCase();
    if (token === 'fast') {
      if (serviceTier) break;
      serviceTier = 'fast';
    } else {
      if (effort) break;
      effort = token as CodexEffort;
    }

    baseModel = baseModel.slice(0, -match[0].length);
  }

  return { baseModel, effort, serviceTier };
}

export function parseCodexEffort(modelId: string | undefined): CodexEffort | undefined {
  return parseCodexTuningSuffix(modelId).effort;
}

export function parseCodexServiceTier(modelId: string | undefined): CodexServiceTier | undefined {
  return parseCodexTuningSuffix(modelId).serviceTier;
}

export function stripCodexEffortSuffix(modelId: string | undefined): string {
  return parseCodexTuningSuffix(modelId).baseModel;
}

export function applyCodexEffortSuffix(
  modelId: string | undefined,
  effort: CodexEffort | undefined
): string {
  const parsed = parseCodexTuningSuffix(modelId);
  const normalizedModelId = parsed.baseModel;
  if (!normalizedModelId || !effort) {
    return parsed.serviceTier ? `${normalizedModelId}-${parsed.serviceTier}` : normalizedModelId;
  }
  return [normalizedModelId, effort, parsed.serviceTier].filter(Boolean).join('-');
}

export function applyCodexServiceTierSuffix(modelId: string | undefined, enabled: boolean): string {
  const parsed = parseCodexTuningSuffix(modelId);
  if (!parsed.baseModel) return parsed.baseModel;
  return [parsed.baseModel, parsed.effort, enabled ? 'fast' : undefined].filter(Boolean).join('-');
}

export function getCodexEffortVariants(
  modelId: string,
  maxEffort: CodexEffort | undefined,
  serviceTiers: readonly CodexServiceTier[] = [],
  efforts?: readonly CodexEffort[]
): string[] {
  if (!maxEffort) {
    const explicitEffort = parseCodexEffort(modelId);
    return [applyCodexEffortSuffix(modelId, explicitEffort)];
  }

  const normalizedModelId = stripCodexEffortSuffix(modelId);
  const variantIds: string[] = [];

  const appendVariantsForEffort = (effort: CodexEffort | undefined) => {
    const effortModel = effort
      ? applyCodexEffortSuffix(normalizedModelId, effort)
      : normalizedModelId;
    variantIds.push(effortModel);
    for (const serviceTier of serviceTiers) {
      variantIds.push(`${effortModel}-${serviceTier}`);
    }
  };

  appendVariantsForEffort(undefined);

  for (const effort of efforts ?? CODEX_EFFORTS_IN_ORDER) {
    appendVariantsForEffort(effort);
    if (!efforts && effort === maxEffort) {
      break;
    }
  }

  return variantIds;
}

export function getSelectableCodexEfforts(
  maxEffort: CodexEffort | undefined,
  efforts?: readonly CodexEffort[]
): CodexEffort[] {
  if (efforts?.length) return [...efforts];
  if (!maxEffort) return [...CODEX_EFFORTS_IN_ORDER];
  const maxEffortIndex = CODEX_EFFORTS_IN_ORDER.indexOf(maxEffort);
  return CODEX_EFFORTS_IN_ORDER.slice(0, maxEffortIndex + 1);
}

export function getCodexEffortDisplay(
  modelId: string | undefined,
  effortLabels?: { pinned: (effort: string) => string; auto: string }
): { label: string; explicit: boolean } | null {
  if (!modelId) return null;
  const effort = parseCodexEffort(modelId);
  if (effort) {
    return {
      label: effortLabels?.pinned(effort) ?? `Pinned ${effort}`,
      explicit: true,
    };
  }
  return { label: effortLabels?.auto ?? 'Auto effort', explicit: false };
}
