import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

/** Header name used to echo the requestId back on HTTP responses. */
export const REQUEST_ID_HEADER = 'x-ccs-request-id';
/** Env var used to forward the requestId across process boundaries (child daemons, spawned CLI). */
export const REQUEST_ID_ENV = 'CCS_REQUEST_ID';
// Loose UUID-ish guard: accepts UUIDs and opaque ids; rejects empty / control chars.
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

/**
 * Per-request context carried via Node.js {@link AsyncLocalStorage}.
 *
 * MUST contain only non-sensitive correlation metadata. NEVER store tokens,
 * secrets, raw bodies, or other sensitive material in this object — values
 * leak into every downstream log entry emitted within the context.
 */
export interface RequestContext {
  /** UUID-shaped correlation id; round-trips via `x-ccs-request-id` header. */
  requestId: string;
  /** Optional benign request metadata (method, path, command name, etc.). */
  [key: string]: unknown;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Run `fn` inside a fresh request context. Use ONLY at request entry edges
 * (HTTP handlers, CLI command dispatch, daemon inbound boundaries).
 *
 * Never call from shared/reused infrastructure — that would leak the requestId
 * to unrelated callers. Listeners that need to inherit context MUST be
 * registered inside the `als.run()` callback.
 */
export function withRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/**
 * Resolve a requestId forwarded across a process boundary (spawned CLI child,
 * daemon). Returns the env value when well-formed, otherwise `undefined` so the
 * caller mints a fresh id. AsyncLocalStorage does NOT cross child_process.spawn,
 * so forwarding via CCS_REQUEST_ID env and re-anchoring at the child entry is
 * the only cross-process bridge.
 */
export function resolveRequestIdFromEnv(): string | undefined {
  const raw = process.env[REQUEST_ID_ENV];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (REQUEST_ID_PATTERN.test(trimmed)) return trimmed;
  }
  return undefined;
}

/**
 * Entry-edge wrapper. Reuses a requestId forwarded via CCS_REQUEST_ID when
 * present and well-formed (so a spawned child re-anchors to the parent's id);
 * otherwise mints a fresh UUID. Use at CLI main, daemon inbound boundaries, and
 * spawned CLI children. Returns the requestId so callers can echo it via headers.
 */
export function runWithRequestId<T>(fn: () => T): { requestId: string; result: T } {
  const requestId = resolveRequestIdFromEnv() ?? randomUUID();
  const result = withRequestContext({ requestId }, fn);
  return { requestId, result };
}

/** Read the active request context, or `undefined` if not inside one. */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Read just the active requestId, or `undefined` if not inside a context. */
export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/**
 * Build the env fragment that forwards the active requestId to a child process
 * (spawned CLI child, daemon). Returns `{ [REQUEST_ID_ENV]: id }` when a context
 * is active, otherwise `{}`. Spread into the `child_process.spawn` env object.
 *
 * AsyncLocalStorage does not cross process boundaries; this is the parent half
 * of the bridge. The child re-anchors via {@link runWithRequestId}, which reads
 * the same env var.
 */
export function forwardRequestIdEnv(): Record<string, string> {
  const requestId = getRequestId();
  return requestId ? { [REQUEST_ID_ENV]: requestId } : {};
}

/**
 * Merge any active request context into the supplied context object,
 * preferring explicit keys on the input. Existing `requestId` on `extra` wins
 * (callers may explicitly override; e.g., for cross-daemon correlation).
 */
export function mergeRequestContext<T extends Record<string, unknown>>(extra: T): T {
  const ctx = storage.getStore();
  if (!ctx) return extra;
  return { ...ctx, ...extra } as T;
}
