/**
 * OpenAI to Cursor Request Translator
 * Converts OpenAI messages to Cursor format.
 */

import type { CursorMessage, CursorTool } from './cursor-protobuf-schema.js';

interface OpenAITextPart {
  type: 'text';
  text?: string;
}

interface OpenAIToolUsePart {
  type: 'tool_use';
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface OpenAIToolResultPart {
  type: 'tool_result';
  tool_use_id?: string;
  content?: unknown;
}

interface OpenAIUnknownPart {
  type: string;
  [key: string]: unknown;
}

type OpenAIContentPart =
  | OpenAITextPart
  | OpenAIToolUsePart
  | OpenAIToolResultPart
  | OpenAIUnknownPart;

interface OpenAIMessage {
  role: string;
  content: string | OpenAIContentPart[];
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
}

interface OpenAIRequestBody {
  messages: OpenAIMessage[];
  tools?: CursorTool[];
  reasoning_effort?: string;
}

const MAX_TOOL_RESULT_CHARS = 12_000;
const TOOL_RESULT_SERIALIZATION_FALLBACK = '[unserializable content]';
const TOOL_USE_ARGUMENTS_FALLBACK = '{}';
const TOOL_CALL_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function isTextPart(part: OpenAIContentPart): part is OpenAITextPart {
  return part.type === 'text';
}

function isToolUsePart(part: OpenAIContentPart): part is OpenAIToolUsePart {
  return part.type === 'tool_use';
}

function isToolResultPart(part: OpenAIContentPart): part is OpenAIToolResultPart {
  return part.type === 'tool_result';
}

function extractTextContent(content: OpenAIMessage['content'], separator = ''): string {
  if (typeof content === 'string') {
    return content;
  }

  const parts: string[] = [];
  for (const part of content) {
    if (isTextPart(part) && part.text) {
      parts.push(part.text);
    }
  }

  return parts.join(separator);
}

function stringifyUnknown(value: unknown, fallback = ''): string {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === 'string' ? serialized : fallback;
  } catch {
    return fallback;
  }
}

function sanitizeToolResultText(text: string): string {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

function truncateToolResultText(text: string): string {
  if (text.length <= MAX_TOOL_RESULT_CHARS) {
    return text;
  }

  let omittedChars = text.length - MAX_TOOL_RESULT_CHARS;
  while (true) {
    const suffix = `\n[truncated ${omittedChars} chars]`;
    const keepLength = Math.max(MAX_TOOL_RESULT_CHARS - suffix.length, 0);
    const nextOmittedChars = text.length - keepLength;
    if (nextOmittedChars === omittedChars) {
      return `${text.slice(0, keepLength)}${suffix}`;
    }
    omittedChars = nextOmittedChars;
  }
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildToolResultBlock(toolName: string, toolCallId: string, resultText: string): string {
  const cleanResult = truncateToolResultText(escapeXml(sanitizeToolResultText(resultText)));

  return [
    '<tool_result>',
    `<tool_name>${escapeXml(toolName || 'tool')}</tool_name>`,
    `<tool_call_id>${escapeXml(toolCallId)}</tool_call_id>`,
    `<result>${cleanResult}</result>`,
    '</tool_result>',
  ].join('\n');
}

function normalizeToolCallId(toolCallId: string | undefined): string {
  return typeof toolCallId === 'string' ? toolCallId.split('\n')[0] : '';
}

function sanitizeToolCallId(toolCallId: string | undefined): string {
  const normalizedId = normalizeToolCallId(toolCallId).trim();
  if (!normalizedId) {
    return '';
  }

  if (TOOL_CALL_ID_PATTERN.test(normalizedId)) {
    return normalizedId;
  }

  return normalizedId.replace(/[^a-zA-Z0-9_-]/g, '');
}

function extractToolResultText(content: unknown): string {
  if (content === undefined) {
    return '';
  }

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter(isTextPart)
      .map((part) => part.text || '')
      .join('\n');
  }

  return stringifyUnknown(content, TOOL_RESULT_SERIALIZATION_FALLBACK);
}

function createFallbackToolUseId(messageIndex: number, partIndex: number): string {
  return `toolu_cursor_fallback_${messageIndex}_${partIndex}`;
}

function resolveToolUseId(
  part: OpenAIToolUsePart,
  messageIndex: number,
  partIndex: number
): string {
  const sanitizedId = sanitizeToolCallId(part.id);
  return sanitizedId || createFallbackToolUseId(messageIndex, partIndex);
}

function requireToolResultId(toolCallId: string | undefined, location: string): string {
  const sanitizedId = sanitizeToolCallId(toolCallId);
  if (sanitizedId) {
    return sanitizedId;
  }

  throw new Error(`${location} must include a valid tool result id`);
}

function normalizeAssistantToolCalls(
  toolCalls: NonNullable<OpenAIMessage['tool_calls']>,
  messageIndex: number
): NonNullable<OpenAIMessage['tool_calls']> {
  return toolCalls.map((toolCall, toolCallIndex) => ({
    ...toolCall,
    id: sanitizeToolCallId(toolCall.id) || createFallbackToolUseId(messageIndex, toolCallIndex),
    function: {
      name: toolCall.function?.name || 'tool',
      arguments:
        typeof toolCall.function?.arguments === 'string'
          ? toolCall.function.arguments
          : stringifyUnknown(toolCall.function?.arguments ?? {}, TOOL_USE_ARGUMENTS_FALLBACK),
    },
  }));
}

function rememberToolCallMeta(
  toolCallMetaMap: Map<string, { name: string }>,
  toolCalls: NonNullable<OpenAIMessage['tool_calls']>
): void {
  for (const toolCall of toolCalls) {
    const toolCallId = toolCall.id || '';
    const toolName = toolCall.function?.name || 'tool';
    if (!toolCallId) {
      continue;
    }

    toolCallMetaMap.set(toolCallId, { name: toolName });

    const normalizedId = normalizeToolCallId(toolCallId);
    if (normalizedId && normalizedId !== toolCallId) {
      toolCallMetaMap.set(normalizedId, { name: toolName });
    }
  }
}

function rememberToolUseParts(
  toolCallMetaMap: Map<string, { name: string }>,
  content: OpenAIMessage['content'],
  messageIndex: number
): void {
  if (!Array.isArray(content)) {
    return;
  }

  for (let partIndex = 0; partIndex < content.length; partIndex++) {
    const part = content[partIndex];
    if (!isToolUsePart(part)) {
      continue;
    }

    const toolCallId = resolveToolUseId(part, messageIndex, partIndex);
    const toolName = part.name || 'tool';
    toolCallMetaMap.set(toolCallId, { name: toolName });

    const normalizedId = normalizeToolCallId(toolCallId);
    if (normalizedId && normalizedId !== toolCallId) {
      toolCallMetaMap.set(normalizedId, { name: toolName });
    }
  }
}

function extractToolCallsFromContent(
  content: OpenAIMessage['content'],
  messageIndex: number
): NonNullable<OpenAIMessage['tool_calls']> {
  if (!Array.isArray(content)) {
    return [];
  }

  return content.flatMap((part, partIndex) => {
    if (!isToolUsePart(part)) {
      return [];
    }

    return [
      {
        id: resolveToolUseId(part, messageIndex, partIndex),
        type: 'function',
        function: {
          name: part.name || 'tool',
          arguments: stringifyUnknown(part.input ?? {}, TOOL_USE_ARGUMENTS_FALLBACK),
        },
      },
    ];
  });
}

function mergeAssistantToolCalls(
  primaryToolCalls: NonNullable<OpenAIMessage['tool_calls']>,
  secondaryToolCalls: NonNullable<OpenAIMessage['tool_calls']>
): NonNullable<OpenAIMessage['tool_calls']> {
  const merged: NonNullable<OpenAIMessage['tool_calls']> = [];
  const seenIds = new Set<string>();

  for (const toolCall of [...primaryToolCalls, ...secondaryToolCalls]) {
    if (seenIds.has(toolCall.id)) {
      continue;
    }

    seenIds.add(toolCall.id);
    merged.push(toolCall);
  }

  return merged;
}

function renderUserContent(
  content: OpenAIMessage['content'],
  toolCallMetaMap: Map<string, { name: string }>,
  messageIndex: number
): string {
  if (typeof content === 'string') {
    return content;
  }

  const parts: string[] = [];
  let textBuffer = '';
  for (let partIndex = 0; partIndex < content.length; partIndex++) {
    const part = content[partIndex];
    if (isTextPart(part) && part.text) {
      textBuffer += part.text;
      continue;
    }

    if (!isToolResultPart(part)) {
      continue;
    }

    if (textBuffer) {
      parts.push(textBuffer);
      textBuffer = '';
    }

    const toolCallId = requireToolResultId(
      part.tool_use_id,
      `messages[${messageIndex}].content[${partIndex}]`
    );
    const normalizedId = normalizeToolCallId(toolCallId);
    const toolName =
      toolCallMetaMap.get(toolCallId)?.name || toolCallMetaMap.get(normalizedId)?.name || 'tool';
    parts.push(buildToolResultBlock(toolName, toolCallId, extractToolResultText(part.content)));
  }

  if (textBuffer) {
    parts.push(textBuffer);
  }

  return parts.join('\n');
}

/**
 * Convert OpenAI messages to Cursor format with a safer tool-result strategy.
 * - system → user with [System Instructions] prefix
 * - tool → flatten into a structured user text block for Cursor compatibility
 * - assistant with tool_calls → keep tool_calls in the translated shape for metadata recovery
 */
function convertMessages(messages: OpenAIMessage[]): CursorMessage[] {
  const result: CursorMessage[] = [];
  const toolCallMetaMap = new Map<string, { name: string }>();

  for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
    const msg = messages[messageIndex];
    if (msg.role === 'system') {
      result.push({
        role: 'user',
        content: `[System Instructions]\n${extractTextContent(msg.content)}`,
      });
      continue;
    }

    if (msg.role === 'tool') {
      const toolCallId = requireToolResultId(
        msg.tool_call_id,
        `messages[${messageIndex}].tool_call_id`
      );
      const normalizedToolCallId = normalizeToolCallId(toolCallId);
      const rememberedToolName =
        toolCallMetaMap.get(toolCallId)?.name || toolCallMetaMap.get(normalizedToolCallId)?.name;
      const toolName = msg.name || rememberedToolName || 'tool';

      result.push({
        role: 'user',
        content: buildToolResultBlock(toolName, toolCallId, extractTextContent(msg.content, '\n')),
      });
      continue;
    }

    if (msg.role === 'user' || msg.role === 'assistant') {
      if (msg.role === 'assistant') {
        const normalizedToolCalls = normalizeAssistantToolCalls(msg.tool_calls || [], messageIndex);
        const assistantToolCalls = mergeAssistantToolCalls(
          normalizedToolCalls,
          extractToolCallsFromContent(msg.content, messageIndex)
        );
        if (normalizedToolCalls.length > 0) {
          rememberToolCallMeta(toolCallMetaMap, normalizedToolCalls);
        }
        rememberToolUseParts(toolCallMetaMap, msg.content, messageIndex);

        const content = extractTextContent(msg.content);
        if (assistantToolCalls.length > 0) {
          result.push({
            role: 'assistant',
            content,
            tool_calls: assistantToolCalls,
          });
        } else if (content) {
          result.push({
            role: 'assistant',
            content,
          });
        }
      } else {
        const content = renderUserContent(msg.content, toolCallMetaMap, messageIndex);
        if (content) {
          result.push({
            role: 'user',
            content,
          });
        }
      }
      continue;
    }

    if (process.env.CCS_DEBUG) {
      console.error(`[cursor] Unknown message role: ${msg.role}, skipping`);
    }
  }

  return result;
}

export function buildCursorRequest(
  _model: string,
  body: OpenAIRequestBody,
  _stream: boolean,
  _credentials: unknown
): {
  messages: CursorMessage[];
  tools?: CursorTool[];
} {
  return {
    ...body,
    messages: convertMessages(body.messages || []),
  };
}
