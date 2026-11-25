/**
 * Tool Sanitization Proxy Request Sanitizer & Model Normalizer
 */

import type { Logger } from '../../../services/logging';
import { ToolNameMapper, type Tool } from '../../ai-providers/tool-name-mapper';
import { sanitizeToolSchemas } from '../../ai-providers/schema-sanitizer';
import {
  getDeniedModelIdReasonForProvider,
  normalizeModelIdForRouting,
  parseCodexModelTuningAlias,
  stripCodexEffortSuffix,
} from '../../ai-providers/model-id-normalizer';
import { getModelMaxLevel } from '../../model-catalog';
import {
  injectCodexRequestTuningIntoBody,
  normalizeCodexEffortForModel,
} from '../../ai-providers/codex-reasoning-proxy';
import { stripModelConfigurationSuffixes } from '../../../shared/extended-context-utils';

export interface ToolSanitizationProxyConfig {
  /** Upstream CLIProxy URL */
  upstreamBaseUrl: string;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Log warnings when sanitization occurs */
  warnOnSanitize?: boolean;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Skip TLS certificate validation for self-signed remote HTTPS proxies */
  allowSelfSigned?: boolean;
  /**
   * Reduce tool input_schema to Gemini's supported subset (default true).
   * Disable when every request reaches Anthropic, which accepts full JSON Schema:
   * stripping there drops real constraints (const, allOf, exclusiveMinimum, ...).
   */
  sanitizeSchemas?: boolean;
}

const GEMINI_UNSUPPORTED_TOOL_FIELDS = new Set([
  'strict',
  'input_examples',
  'type',
  'cache_control',
  'defer_loading',
]);

const CODEX_UNSUPPORTED_TOOL_FIELDS = new Set(['cache_control']);
const EXTENDED_CONTEXT_SUFFIX_REGEX = /\[1m\]$/i;
const THINKING_SUFFIX_REGEX = /\([^()]*\)$/;
const LEGACY_CODEX_MODEL_ID_REGEX = /^gpt-5(?:\.\d+)?-codex(?:-(?:mini|max))?$/i;
const ADVISOR_TOOL_TYPE_PREFIX = 'advisor_';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripAdvisorToolModelSuffixes(tools: Tool[]): {
  tools: Tool[];
  changedByTool: Array<{ name: string; from: string; to: string }>;
} {
  const changedByTool: Array<{ name: string; from: string; to: string }> = [];

  const sanitizedTools = tools.map((tool) => {
    const toolType = typeof tool.type === 'string' ? tool.type : null;
    const toolModel = typeof tool.model === 'string' ? tool.model : null;
    if (!toolType?.startsWith(ADVISOR_TOOL_TYPE_PREFIX) || toolModel === null) {
      return tool;
    }

    let strippedModel = toolModel;
    for (;;) {
      const next = stripModelConfigurationSuffixes(strippedModel);
      if (next === strippedModel) break;
      strippedModel = next;
    }
    if (strippedModel === toolModel || strippedModel.length === 0) {
      return tool;
    }

    changedByTool.push({ name: tool.name, from: toolModel, to: strippedModel });
    return { ...tool, model: strippedModel };
  });

  return { tools: sanitizedTools, changedByTool };
}

function canonicalizeCodexModelId(model: string | undefined): string | null {
  const normalizedModel = model?.trim().toLowerCase();
  if (!normalizedModel) {
    return null;
  }

  const withoutExtendedContext = normalizedModel.replace(EXTENDED_CONTEXT_SUFFIX_REGEX, '').trim();
  const withoutThinkingSuffix = withoutExtendedContext.replace(THINKING_SUFFIX_REGEX, '').trim();
  return stripCodexEffortSuffix(withoutThinkingSuffix);
}

function isKnownCodexModelId(model: string | undefined): boolean {
  const normalizedModel = canonicalizeCodexModelId(model);
  if (!normalizedModel) {
    return false;
  }

  return (
    LEGACY_CODEX_MODEL_ID_REGEX.test(normalizedModel) ||
    getModelMaxLevel('codex', normalizedModel) !== undefined
  );
}

function isCodexRequest(providerFromPath: string | null, model: unknown): boolean {
  return (
    providerFromPath === 'codex' ||
    (providerFromPath === null && typeof model === 'string' && isKnownCodexModelId(model))
  );
}

function applyCodexModelTuningAlias(body: Record<string, unknown>): Record<string, unknown> {
  if (typeof body.model !== 'string') {
    return body;
  }

  const parsed = parseCodexModelTuningAlias(body.model);
  if (!parsed || !isKnownCodexModelId(parsed.baseModel)) {
    return body;
  }

  return injectCodexRequestTuningIntoBody(
    { ...body, model: parsed.baseModel },
    {
      effort: parsed.effort ? normalizeCodexEffortForModel(parsed.baseModel, parsed.effort) : null,
      serviceTier: parsed.serviceTier,
    }
  ) as Record<string, unknown>;
}

function getUnsupportedToolFields(
  providerFromPath: string | null,
  model: string | undefined
): ReadonlySet<string> | null {
  const normalizedProvider = providerFromPath?.trim().toLowerCase() ?? null;
  const normalizedModel = model?.trim().toLowerCase();

  if (
    normalizedProvider === 'gemini' ||
    normalizedProvider === 'gemini-cli' ||
    (normalizedProvider === null && normalizedModel?.startsWith('gemini-'))
  ) {
    return GEMINI_UNSUPPORTED_TOOL_FIELDS;
  }

  if (
    normalizedProvider === 'codex' ||
    (normalizedProvider === null && isKnownCodexModelId(model))
  ) {
    return CODEX_UNSUPPORTED_TOOL_FIELDS;
  }

  return null;
}

function stripUnsupportedToolFields(
  tools: Tool[],
  unsupportedFields: ReadonlySet<string>
): {
  tools: Tool[];
  removedByTool: Array<{ name: string; removed: string[] }>;
  totalRemoved: number;
} {
  const removedByTool: Array<{ name: string; removed: string[] }> = [];
  let totalRemoved = 0;

  const sanitizedTools = tools.map((tool) => {
    const sanitizedTool = { ...tool };
    const removed: string[] = [];

    for (const field of unsupportedFields) {
      if (field in sanitizedTool) {
        delete sanitizedTool[field];
        removed.push(field);
      }
    }

    if (removed.length > 0) {
      removedByTool.push({
        name: tool.name,
        removed,
      });
      totalRemoved += removed.length;
    }

    return sanitizedTool;
  });

  return {
    tools: sanitizedTools,
    removedByTool,
    totalRemoved,
  };
}

export function sanitizeJsonRequestBody(
  parsed: unknown,
  providerFromPath: string | null,
  mapper: ToolNameMapper,
  config: Required<ToolSanitizationProxyConfig>,
  logger: Logger
): { deniedReason?: string; modifiedBody: unknown } {
  let modifiedBody = parsed;

  if (isRecord(modifiedBody) && typeof modifiedBody.model === 'string') {
    const deniedReason = getDeniedModelIdReasonForProvider(modifiedBody.model, providerFromPath);
    if (deniedReason) {
      return { deniedReason, modifiedBody };
    }
    const normalizedModel = normalizeModelIdForRouting(modifiedBody.model, providerFromPath);
    if (normalizedModel !== modifiedBody.model) {
      logger.warn(
        'tool-sanitization.proxy.model-normalized',
        `Model normalized for provider routing (${providerFromPath ?? 'root'}): "${modifiedBody.model}" → "${normalizedModel}"`,
        {
          provider: providerFromPath ?? 'root',
          from: modifiedBody.model,
          to: normalizedModel,
        }
      );
      modifiedBody = { ...modifiedBody, model: normalizedModel };
    }
  }

  if (isRecord(modifiedBody) && isCodexRequest(providerFromPath, modifiedBody.model)) {
    modifiedBody = applyCodexModelTuningAlias(modifiedBody);
  }

  if (isRecord(modifiedBody) && Array.isArray(modifiedBody.tools)) {
    const requestTools = modifiedBody.tools as Array<{
      name: string;
      input_schema?: Record<string, unknown>;
    }>;
    const schemaResult = config.sanitizeSchemas
      ? sanitizeToolSchemas(requestTools)
      : { tools: requestTools, totalRemoved: 0, removedByTool: [] };

    if (schemaResult.totalRemoved > 0) {
      for (const entry of schemaResult.removedByTool) {
        logger.warn(
          'tool-sanitization.proxy.schema-sanitized',
          `Schema sanitized for "${entry.name}": removed ${entry.removed.length} Gemini-unsupported properties`,
          { tool: entry.name, removedFields: entry.removed }
        );
      }
      if (config.verbose) {
        logger.info(
          'tool-sanitization.proxy.schema-summary',
          `Sanitized ${schemaResult.totalRemoved} schema properties across ${schemaResult.removedByTool.length} tool(s)`,
          {
            totalRemoved: schemaResult.totalRemoved,
            toolCount: schemaResult.removedByTool.length,
          }
        );
      }
    }

    let rewrittenTools = schemaResult.tools as Tool[];
    const unsupportedToolFields =
      isRecord(modifiedBody) && typeof modifiedBody.model === 'string'
        ? getUnsupportedToolFields(providerFromPath, modifiedBody.model)
        : getUnsupportedToolFields(providerFromPath, undefined);

    if (unsupportedToolFields) {
      const fieldResult = stripUnsupportedToolFields(rewrittenTools, unsupportedToolFields);

      if (fieldResult.totalRemoved > 0) {
        for (const entry of fieldResult.removedByTool) {
          logger.warn(
            'tool-sanitization.proxy.fields-stripped',
            `Tool fields stripped for "${entry.name}" (${providerFromPath ?? 'model-routed'}): ${entry.removed.join(', ')}`,
            {
              tool: entry.name,
              provider: providerFromPath ?? 'model-routed',
              removedFields: entry.removed,
            }
          );
        }
        if (config.verbose) {
          logger.info(
            'tool-sanitization.proxy.fields-summary',
            `Stripped ${fieldResult.totalRemoved} unsupported top-level tool field(s) across ${fieldResult.removedByTool.length} tool(s)`,
            {
              totalRemoved: fieldResult.totalRemoved,
              toolCount: fieldResult.removedByTool.length,
            }
          );
        }
      }

      rewrittenTools = fieldResult.tools;
    }

    const toolModelResult = stripAdvisorToolModelSuffixes(rewrittenTools);
    if (toolModelResult.changedByTool.length > 0) {
      for (const entry of toolModelResult.changedByTool) {
        logger.warn(
          'tool-sanitization.proxy.tool-model-normalized',
          `Tool model suffix stripped for "${entry.name}": "${entry.from}" -> "${entry.to}"`,
          { tool: entry.name, from: entry.from, to: entry.to }
        );
      }
      rewrittenTools = toolModelResult.tools;
    }

    const sanitizedTools = mapper.registerTools(rewrittenTools);
    modifiedBody = { ...modifiedBody, tools: sanitizedTools };

    if (mapper.hasChanges()) {
      const changes = mapper.getChanges();
      if (config.warnOnSanitize) {
        for (const change of changes) {
          logger.warn(
            'tool-sanitization.proxy.name-sanitized',
            `Tool name sanitized: "${change.original}" → "${change.sanitized}"`,
            { from: change.original, to: change.sanitized }
          );
        }
      }
      if (config.verbose) {
        logger.info(
          'tool-sanitization.proxy.name-summary',
          `Sanitized ${changes.length} tool name(s)`,
          {
            count: changes.length,
          }
        );
      }
    }

    if (mapper.hasCollisions()) {
      const collisions = mapper.getCollisions();
      for (const collision of collisions) {
        logger.warn(
          'tool-sanitization.proxy.hash-collision',
          `Hash collision detected: ${collision.originals.join(', ')} → "${collision.sanitized}"`,
          { originals: collision.originals, sanitized: collision.sanitized }
        );
      }
    }
  }

  return { modifiedBody };
}
