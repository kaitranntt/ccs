import { parse } from 'smol-toml';

export interface SafeTomlObjectParseResult {
  config: Record<string, unknown> | null;
  parseError: string | null;
}

function isTomlObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripUtf8Bom(rawText: string): string {
  return rawText.charCodeAt(0) === 0xfeff ? rawText.slice(1) : rawText;
}

export function parseTomlObject(rawText: string): Record<string, unknown> {
  const parseText = stripUtf8Bom(rawText);
  const trimmed = parseText.trim();
  if (!trimmed) return {};

  const parsed = parse(parseText);
  if (!isTomlObject(parsed)) {
    throw new Error('TOML root must be a table.');
  }

  return parsed;
}

export function safeParseTomlObject(rawText: string): SafeTomlObjectParseResult {
  try {
    return {
      config: parseTomlObject(rawText),
      parseError: null,
    };
  } catch (error) {
    return {
      config: null,
      parseError: (error as Error).message,
    };
  }
}
