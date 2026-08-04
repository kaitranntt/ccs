/**
 * OpenCode Zen / Go protocol adapter.
 *
 * OpenCode Zen (`https://opencode.ai/zen/v1`) and OpenCode Go
 * (`https://opencode.ai/zen/go/v1`) are multi-protocol gateways: one API key,
 * four protocol shims under one host. The protocol is chosen per model
 * family, and the gateway rejects cross-protocol requests, so the proxy must
 * route each request to the protocol-native path and auth header.
 *
 *   Anthropic  /messages                    -> Claude, Qwen Plus/Max, MiniMax M3/M2.x
 *   OpenAI     /chat/completions            -> Grok, DeepSeek, GLM, Kimi, free models (default)
 *   OpenAI     /responses                   -> GPT-5.x / Codex (not translated by this adapter)
 *   Google     /models/{model}:generateContent -> Gemini (blocked by upstream bug, issue #8228)
 *
 * Verified against the live endpoints 2026-08-04; see
 * docs/opencode-zen-go-compat.md for the full matrix and caveats.
 */

export type OpenCodeProtocol = 'chat-completions' | 'anthropic' | 'responses' | 'gemini';

export type OpenCodeUpstreamMode =
  | { mode: 'chat-completions' }
  | { mode: 'anthropic' }
  | { mode: 'unsupported'; reason: string };

/** Required on every Anthropic-protocol request per Anthropic convention. */
export const OPENCODE_ANTHROPIC_VERSION = '2023-06-01';

const OPENCODE_ANTHROPIC_MODEL_PATTERNS = [/^claude-/i, /^qwen3/i, /^minimax-m/i];
const OPENCODE_RESPONSES_MODEL_PATTERNS = [/^gpt-/i, /^codex-/i];
const OPENCODE_GEMINI_MODEL_PATTERNS = [/^gemini-/i];

/** OpenCode-internal provider prefixes; never sent to the gateway. */
const OPENCODE_PROVIDER_PREFIXES = [/^opencode-go\//i, /^opencode\//i];

/** True when the upstream host is an OpenCode Zen/Go gateway. */
export function isOpenCodeHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === 'opencode.ai' || normalized.endsWith('.opencode.ai');
}

function stripOpenCodeProviderPrefix(model: string): string {
  let normalized = model.trim();
  for (const prefix of OPENCODE_PROVIDER_PREFIXES) {
    normalized = normalized.replace(prefix, '');
  }
  return normalized;
}

/**
 * Map a bare OpenCode model id to its protocol family. Unknown or missing
 * models default to chat-completions, the gateway's default protocol.
 * `opencode/…` / `opencode-go/…` provider prefixes are stripped before
 * classification; they are OpenCode-internal and never sent upstream.
 */
export function classifyOpenCodeModel(model: string | undefined | null): OpenCodeProtocol {
  const normalized = stripOpenCodeProviderPrefix(model?.trim() || '');
  if (!normalized) {
    return 'chat-completions';
  }

  if (OPENCODE_ANTHROPIC_MODEL_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'anthropic';
  }
  if (OPENCODE_RESPONSES_MODEL_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'responses';
  }
  if (OPENCODE_GEMINI_MODEL_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'gemini';
  }
  return 'chat-completions';
}

/**
 * Resolve the upstream mode for a request against an OpenCode gateway.
 * Returns null when the base URL is not an OpenCode host, so callers keep
 * their existing passthrough/translation logic for every other provider.
 */
export function resolveOpenCodeUpstreamMode(
  baseUrl: string,
  model: string | undefined | null
): OpenCodeUpstreamMode | null {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return null;
  }

  if (!isOpenCodeHost(parsed.hostname)) {
    return null;
  }

  const protocol = classifyOpenCodeModel(model);
  if (protocol === 'anthropic') {
    return { mode: 'anthropic' };
  }
  if (protocol === 'responses') {
    return {
      mode: 'unsupported',
      reason: `Model '${model}' uses the OpenAI Responses protocol (/v1/responses), which the CCS OpenCode adapter does not translate yet. Use a chat-completions or Anthropic-protocol model.`,
    };
  }
  if (protocol === 'gemini') {
    return {
      mode: 'unsupported',
      reason: `Model '${model}' uses the Google Generative Language protocol, which is disabled in the CCS OpenCode adapter because Zen's generateContent endpoint has a known server-side bug (opencode issue #8228).`,
    };
  }
  return { mode: 'chat-completions' };
}
