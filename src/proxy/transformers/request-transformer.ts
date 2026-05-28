interface AnthropicThinking {
  type?: 'enabled' | 'disabled' | 'adaptive' | string;
  budget_tokens?: number;
}

interface AnthropicTextBlock {
  type: 'text';
  text?: string;
}

interface AnthropicImageBlock {
  type: 'image';
  source?: {
    type?: string;
    media_type?: string;
    data?: string;
    url?: string;
  };
}

interface AnthropicToolUseBlock {
  type: 'tool_use';
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface AnthropicToolResultBlock {
  type: 'tool_result';
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicImageBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock
  | { type: string; [key: string]: unknown };

interface AnthropicMessage {
  role?: 'system' | 'user' | 'assistant' | string;
  content?: string | AnthropicContentBlock[];
}

interface AnthropicOutputConfig {
  effort?: 'low' | 'medium' | 'high' | 'max' | string;
}

interface AnthropicToolChoice {
  type?: 'auto' | 'any' | 'tool' | 'none' | string;
  name?: string;
  disable_parallel_tool_use?: boolean;
}

interface AnthropicProxyRequestShape {
  model?: unknown;
  system?: unknown;
  messages?: unknown;
  max_tokens?: unknown;
  temperature?: unknown;
  top_p?: unknown;
  stop_sequences?: unknown;
  metadata?: unknown;
  tools?: unknown;
  tool_choice?: AnthropicToolChoice;
  stream?: unknown;
  thinking?: AnthropicThinking;
  output_config?: AnthropicOutputConfig;
}

interface OpenAITextPart {
  type: 'text';
  text: string;
}

interface OpenAIImagePart {
  type: 'image_url';
  image_url: {
    url: string;
  };
}

type OpenAIContentPart = OpenAITextPart | OpenAIImagePart;

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | OpenAIContentPart[] | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface ProxyOpenAIRequest {
  model?: string;
  stream: boolean;
  reasoning_effort?: string;
  reasoning?: {
    enabled: boolean;
    effort: string;
  };
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description?: string;
      parameters: Record<string, unknown>;
    };
  }>;
  tool_choice?:
    | 'auto'
    | 'none'
    | 'required'
    | {
        type: 'function';
        function: {
          name: string;
        };
      };
  parallel_tool_calls?: boolean;
  messages: OpenAIMessage[];
  max_tokens?: number;
  max_completion_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string[];
  metadata?: Record<string, unknown>;
}

const TOOL_USE_ARGUMENTS_FALLBACK = '{}';

function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`${label} must be an object`);
  }

  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const result = value.filter(
    (entry): entry is string => typeof entry === 'string' && entry.length > 0
  );
  return result.length > 0 ? result : undefined;
}

function asMetadata(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function safeJsonStringify(value: unknown, fallback: string): string {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === 'string' ? serialized : fallback;
  } catch {
    return fallback;
  }
}

function flattenTextContent(content: unknown, label: string): string {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    throw new Error(`${label} must be a string or content block array`);
  }

  return content
    .map((block, index) => {
      const parsed = assertObject(block, `${label}[${index}]`);
      if (parsed.type !== 'text') {
        throw new Error(`${label}[${index}].type "${String(parsed.type)}" is not supported`);
      }
      return typeof parsed.text === 'string' ? parsed.text : '';
    })
    .join('\n');
}

/**
 * Convert tool_result content to OpenAI-compatible format.
 * Handles strings, arrays with text/image blocks, and error prefixing.
 * Ported from openclaude's convertToolResultContent.
 */
function convertToolResultContent(content: unknown, isError: boolean, label: string): string {
  if (content === undefined) {
    return '';
  }
  if (typeof content === 'string') {
    return isError ? `Error: ${content}` : content;
  }
  if (!Array.isArray(content)) {
    const text = safeJsonStringify(content, '[unserializable content]');
    return isError ? `Error: ${text}` : text;
  }

  const parts: string[] = [];
  for (const [index, block] of content.entries()) {
    const parsed = assertObject(block, `${label}[${index}]`);

    if (parsed.type === 'text' && typeof parsed.text === 'string') {
      parts.push(parsed.text);
      continue;
    }

    if (parsed.type === 'image') {
      const source =
        typeof parsed.source === 'object' && parsed.source !== null
          ? (parsed.source as Record<string, unknown>)
          : undefined;
      const description =
        source?.type === 'url'
          ? 'url image payload'
          : source?.type === 'base64' && typeof source.media_type === 'string'
            ? `${source.media_type} base64 payload`
            : 'unsupported image payload';
      parts.push(`[tool_result image omitted: ${description}]`);
      continue;
    }

    if (typeof parsed.text === 'string') {
      parts.push(parsed.text);
      continue;
    }

    throw new Error(`${label}[${index}].type "${String(parsed.type)}" is not supported`);
  }

  const text = parts.join('\n');
  if (!text) {
    return isError ? 'Error:' : '';
  }
  return isError ? `Error: ${text}` : text;
}

function createFallbackToolId(messageIndex: number, blockIndex: number): string {
  return `toolu_proxy_fallback_${messageIndex}_${blockIndex}`;
}

function toImagePart(block: AnthropicImageBlock, label: string): OpenAIImagePart {
  const source = block.source;
  if (!source) {
    throw new Error(`${label}.source is missing`);
  }

  if (source.type === 'url' && source.url) {
    return {
      type: 'image_url',
      image_url: { url: source.url },
    };
  }

  if (source.type === 'base64' && source.media_type && source.data) {
    return {
      type: 'image_url',
      image_url: {
        url: `data:${source.media_type};base64,${source.data}`,
      },
    };
  }

  throw new Error(`${label}.source must be a base64 or url image payload`);
}

function isImageBlock(block: AnthropicContentBlock): block is AnthropicImageBlock {
  return block.type === 'image';
}

function isToolUseBlock(block: AnthropicContentBlock): block is AnthropicToolUseBlock {
  return block.type === 'tool_use';
}

function isToolResultBlock(block: AnthropicContentBlock): block is AnthropicToolResultBlock {
  return block.type === 'tool_result';
}

function flushUserContent(messages: OpenAIMessage[], parts: OpenAIContentPart[]): void {
  if (parts.length === 0) {
    return;
  }

  const onlyText = parts.every((part) => part.type === 'text');
  messages.push({
    role: 'user',
    content: onlyText ? parts.map((part) => (part as OpenAITextPart).text).join('\n') : [...parts],
  });
  parts.length = 0;
}

function transformTools(value: unknown): ProxyOpenAIRequest['tools'] {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const tools = value
    .filter(
      (entry): entry is { name?: unknown; description?: unknown; input_schema?: unknown } =>
        typeof entry === 'object' && entry !== null
    )
    .map((entry) => {
      const rawSchema =
        typeof entry.input_schema === 'object' && entry.input_schema !== null
          ? (entry.input_schema as Record<string, unknown>)
          : { type: 'object', properties: {} };

      return {
        type: 'function' as const,
        function: {
          name: typeof entry.name === 'string' ? entry.name : 'tool',
          ...(typeof entry.description === 'string' ? { description: entry.description } : {}),
          parameters: rawSchema,
        },
      };
    });

  return tools.length > 0 ? tools : undefined;
}

function transformToolChoice(
  value: AnthropicToolChoice | undefined,
  hasTools: boolean
): Pick<ProxyOpenAIRequest, 'tool_choice' | 'parallel_tool_calls'> {
  if (!value) {
    return hasTools ? { tool_choice: 'auto' } : {};
  }

  if (!hasTools) {
    throw new Error('tool_choice requires tools');
  }

  const parallelToolCalls =
    value.disable_parallel_tool_use === true ? { parallel_tool_calls: false } : {};

  switch (value.type) {
    case undefined:
    case 'auto':
      return { tool_choice: 'auto', ...parallelToolCalls };
    case 'none':
      return { tool_choice: 'none' };
    case 'any':
      return { tool_choice: 'required', ...parallelToolCalls };
    case 'tool':
      if (typeof value.name !== 'string' || value.name.trim().length === 0) {
        throw new Error('tool_choice.name must be a non-empty string when type is "tool"');
      }
      return {
        tool_choice: {
          type: 'function',
          function: { name: value.name.trim() },
        },
        ...parallelToolCalls,
      };
    default:
      throw new Error('tool_choice.type must be "auto", "any", "tool", or "none"');
  }
}

function mapThinkingToReasoning(
  thinking: AnthropicThinking | undefined,
  outputConfig: AnthropicOutputConfig | undefined
): Pick<ProxyOpenAIRequest, 'reasoning_effort'> {
  if (!thinking || thinking.type === 'disabled') {
    return {};
  }

  if (thinking.type === 'adaptive') {
    const effort = toOpenAIEffort(resolveOutputConfigEffort(outputConfig) ?? 'high');
    return {
      reasoning_effort: effort,
    };
  }

  if (thinking.type !== 'enabled') {
    throw new Error('thinking.type must be "enabled", "adaptive", or "disabled"');
  }

  const effort =
    typeof thinking.budget_tokens === 'number' && thinking.budget_tokens >= 8192
      ? 'high'
      : 'medium';

  return {
    reasoning_effort: effort,
  };
}

const VALID_EFFORT_LEVELS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

function resolveOutputConfigEffort(
  outputConfig: AnthropicOutputConfig | undefined
): string | undefined {
  if (!outputConfig || typeof outputConfig.effort !== 'string') {
    return undefined;
  }
  const normalized = outputConfig.effort.trim().toLowerCase();
  return VALID_EFFORT_LEVELS.has(normalized) ? normalized : undefined;
}

/**
 * Map Anthropic effort levels to OpenAI-compatible reasoning_effort.
 * Anthropic's `max` has no standard OpenAI equivalent — most providers
 * only accept low/medium/high and reject unknown values with a 400.
 * Ported from openclaude's standardEffortToOpenAI() which maps max -> xhigh
 * for Codex; for generic OpenAI-compat providers we clamp to high.
 */
function toOpenAIEffort(effort: string): string {
  return effort === 'max' || effort === 'xhigh' ? 'high' : effort;
}

function transformMessages(messagesValue: unknown): OpenAIMessage[] {
  if (!Array.isArray(messagesValue)) {
    throw new Error('messages must be an array');
  }

  const translatedMessages: OpenAIMessage[] = [];
  let pendingToolUseIds: Set<string> | null = null;
  let hasPendingToolUseIds = false;

  messagesValue.forEach((message, messageIndex) => {
    const parsedMessage = assertObject(message, `messages[${messageIndex}]`) as AnthropicMessage;
    const role = parsedMessage.role;
    if (role !== 'system' && role !== 'user' && role !== 'assistant') {
      throw new Error(`messages[${messageIndex}].role must be "system", "user", or "assistant"`);
    }

    if (pendingToolUseIds && pendingToolUseIds.size > 0 && role !== 'user') {
      throw new Error(
        `messages[${messageIndex}].role must be "user" with tool_result blocks after assistant tool_use`
      );
    }

    const content = parsedMessage.content;
    if (role === 'system') {
      translatedMessages.push({
        role: 'system',
        content: flattenTextContent(content, `messages[${messageIndex}].content`),
      });
      return;
    }

    if (typeof content === 'string') {
      if (pendingToolUseIds && pendingToolUseIds.size > 0) {
        throw new Error(
          `messages[${messageIndex}].content must start with tool_result blocks for pending tool_use ids`
        );
      }
      translatedMessages.push({ role, content });
      return;
    }

    if (!Array.isArray(content)) {
      throw new Error(`messages[${messageIndex}].content must be a string or array`);
    }

    if (role === 'user') {
      const userParts: OpenAIContentPart[] = [];
      const followUpParts: OpenAIContentPart[] = [];
      const resolvedToolUseIds = new Set<string>();

      const handleUserPart = (
        part: OpenAIContentPart,
        blockIndex: number,
        kind: 'text' | 'image'
      ) => {
        if (!pendingToolUseIds || pendingToolUseIds.size === 0) {
          userParts.push(part);
          return;
        }

        if (resolvedToolUseIds.size === 0) {
          throw new Error(
            `messages[${messageIndex}].content[${blockIndex}] ${kind} is not allowed before tool_result blocks for pending tool_use ids`
          );
        }

        if (resolvedToolUseIds.size !== pendingToolUseIds.size) {
          throw new Error(
            `messages[${messageIndex}].content[${blockIndex}] ${kind} is not allowed between tool_result blocks for pending tool_use ids`
          );
        }

        followUpParts.push(part);
      };

      content.forEach((block, blockIndex) => {
        const parsed = assertObject(
          block,
          `messages[${messageIndex}].content[${blockIndex}]`
        ) as AnthropicContentBlock;

        if (parsed.type === 'thinking' || parsed.type === 'redacted_thinking') {
          return;
        }

        if (parsed.type === 'text') {
          const text = typeof parsed.text === 'string' ? parsed.text : '';
          handleUserPart({ type: 'text', text }, blockIndex, 'text');
          return;
        }

        if (isImageBlock(parsed)) {
          handleUserPart(
            toImagePart(parsed, `messages[${messageIndex}].content[${blockIndex}]`),
            blockIndex,
            'image'
          );
          return;
        }

        if (isToolResultBlock(parsed)) {
          if (!pendingToolUseIds || pendingToolUseIds.size === 0) {
            throw new Error(
              `messages[${messageIndex}].content[${blockIndex}] tool_result requires a preceding assistant tool_use`
            );
          }
          if (typeof parsed.tool_use_id !== 'string' || parsed.tool_use_id.trim().length === 0) {
            throw new Error(
              `messages[${messageIndex}].content[${blockIndex}].tool_use_id must be a non-empty string`
            );
          }
          if (!pendingToolUseIds.has(parsed.tool_use_id)) {
            throw new Error(
              `messages[${messageIndex}].content[${blockIndex}].tool_use_id "${parsed.tool_use_id}" does not match a pending tool_use`
            );
          }
          if (resolvedToolUseIds.has(parsed.tool_use_id)) {
            throw new Error(
              `messages[${messageIndex}].content[${blockIndex}].tool_use_id "${parsed.tool_use_id}" is duplicated`
            );
          }
          resolvedToolUseIds.add(parsed.tool_use_id);
          translatedMessages.push({
            role: 'tool',
            tool_call_id: parsed.tool_use_id,
            content: convertToolResultContent(
              parsed.content,
              parsed.is_error === true,
              `messages[${messageIndex}].content[${blockIndex}].content`
            ),
          });
          return;
        }

        if (isToolUseBlock(parsed)) {
          throw new Error(
            `messages[${messageIndex}].content[${blockIndex}] tool_use requires assistant role`
          );
        }

        throw new Error(
          `messages[${messageIndex}].content[${blockIndex}].type "${String(parsed.type)}" is not supported`
        );
      });

      if (resolvedToolUseIds.size > 0) {
        if (resolvedToolUseIds.size !== pendingToolUseIds?.size) {
          throw new Error(
            `messages[${messageIndex}].content must provide tool_result blocks for all pending tool_use ids`
          );
        }
        pendingToolUseIds = null;
        hasPendingToolUseIds = false;
      }

      if (pendingToolUseIds && pendingToolUseIds.size > 0) {
        throw new Error(
          `messages[${messageIndex}].content must include tool_result blocks for pending tool_use ids`
        );
      }

      if (userParts.length > 0) {
        flushUserContent(translatedMessages, userParts);
      }

      if (followUpParts.length > 0) {
        flushUserContent(translatedMessages, followUpParts);
      }
      return;
    }

    // Assistant role
    const assistantTextParts: string[] = [];
    const toolCalls: NonNullable<OpenAIMessage['tool_calls']> = [];

    content.forEach((block, blockIndex) => {
      const parsed = assertObject(
        block,
        `messages[${messageIndex}].content[${blockIndex}]`
      ) as AnthropicContentBlock;

      if (parsed.type === 'thinking' || parsed.type === 'redacted_thinking') {
        return;
      }

      if (parsed.type === 'text') {
        const text = typeof parsed.text === 'string' ? parsed.text : '';
        assistantTextParts.push(text);
        return;
      }

      if (isToolUseBlock(parsed)) {
        toolCalls.push({
          id:
            typeof parsed.id === 'string' && parsed.id.length > 0
              ? parsed.id
              : createFallbackToolId(messageIndex, blockIndex),
          type: 'function',
          function: {
            name: typeof parsed.name === 'string' ? parsed.name : 'tool',
            arguments: safeJsonStringify(parsed.input ?? {}, TOOL_USE_ARGUMENTS_FALLBACK),
          },
        });
        return;
      }

      if (isImageBlock(parsed)) {
        throw new Error(
          `messages[${messageIndex}].content[${blockIndex}] image requires user role`
        );
      }

      if (isToolResultBlock(parsed)) {
        throw new Error(
          `messages[${messageIndex}].content[${blockIndex}] tool_result requires user role`
        );
      }

      throw new Error(
        `messages[${messageIndex}].content[${blockIndex}].type "${String(parsed.type)}" is not supported`
      );
    });

    if (assistantTextParts.length === 0 && toolCalls.length === 0) {
      return;
    }

    pendingToolUseIds =
      toolCalls.length > 0 ? new Set(toolCalls.map((toolCall) => toolCall.id)) : null;
    hasPendingToolUseIds = toolCalls.length > 0;

    translatedMessages.push({
      role: 'assistant',
      content: assistantTextParts.join('\n'),
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    });
  });

  if (hasPendingToolUseIds) {
    throw new Error('messages must provide tool_result blocks for the latest assistant tool_use');
  }

  return translatedMessages;
}

/**
 * Coalesce consecutive messages of the same role.
 * OpenAI/vLLM/Ollama/Mistral require strict user<->assistant alternation.
 * Multiple consecutive tool messages are allowed (assistant -> tool* -> user).
 * Ported from openclaude's coalescing pass.
 */
function coalesceMessages(messages: OpenAIMessage[]): OpenAIMessage[] {
  const coalesced: OpenAIMessage[] = [];

  for (const msg of messages) {
    const prev = coalesced[coalesced.length - 1];

    if (prev && prev.role === msg.role && msg.role !== 'tool' && msg.role !== 'system') {
      const prevContent = prev.content;
      const curContent = msg.content;

      if (typeof prevContent === 'string' && typeof curContent === 'string') {
        prev.content = prevContent + (prevContent && curContent ? '\n' : '') + curContent;
      } else {
        const toArray = (
          c: string | OpenAIContentPart[] | null | undefined
        ): OpenAIContentPart[] => {
          if (!c) return [];
          if (typeof c === 'string') return c ? [{ type: 'text', text: c }] : [];
          return c;
        };
        prev.content = [...toArray(prevContent), ...toArray(curContent)];
      }

      if (msg.tool_calls?.length) {
        prev.tool_calls = [...(prev.tool_calls ?? []), ...msg.tool_calls];
      }
    } else {
      coalesced.push({ ...msg });
    }
  }

  return coalesced;
}

export class ProxyRequestTransformer {
  transform(raw: unknown): ProxyOpenAIRequest {
    const source = assertObject(raw || {}, 'request') as AnthropicProxyRequestShape;
    const tools = transformTools(source.tools);
    const messages = transformMessages(source.messages);
    const system = source.system;
    const allMessages =
      system !== undefined
        ? [
            { role: 'system', content: flattenTextContent(system, 'system') } as OpenAIMessage,
            ...messages,
          ]
        : messages;

    return {
      model:
        typeof source.model === 'string' && source.model.trim().length > 0
          ? source.model.trim()
          : undefined,
      stream: source.stream === true,
      messages: coalesceMessages(allMessages),
      max_tokens: asNumber(source.max_tokens),
      temperature: asNumber(source.temperature),
      top_p: asNumber(source.top_p),
      stop: asStringArray(source.stop_sequences),
      metadata: asMetadata(source.metadata),
      tools,
      ...transformToolChoice(source.tool_choice, tools !== undefined),
      ...mapThinkingToReasoning(source.thinking, source.output_config),
    };
  }
}
