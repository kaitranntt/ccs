import type { LogsEntry, LogsLevel } from '@/lib/api-client';
import type { TraceGroup } from './logs-trace-row';

const LEVEL_RANK: Record<LogsLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export interface LeafItem {
  kind: 'leaf';
  entry: LogsEntry;
  /**
   * When >1, this leaf represents N consecutive identical entries that have
   * been coalesced. Row renderer shows a ×N badge so dashboard self-polling
   * floods don't drown real signal.
   */
  repeatCount?: number;
  collapsedRange?: { fromTs: string; toTs: string };
}

export type DerivedItem = LeafItem | TraceGroup;

function stableStringify(value: unknown): string {
  if (value === undefined) return '';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(',')}}`;
}

/**
 * Tuple key for coalescing standalone leaves. The row/detail UI exposes more
 * than event/module/level, so every inspectable payload field must participate
 * in equality; otherwise two adjacent logs with different metadata, context,
 * error, or latency could collapse into one selectable row. `timestamp` stays
 * out of the key because collapsed rows surface their time span separately.
 *
 * NB: this only applies to *leaves* (entries without `requestId`). Trace
 * children render uncoalesced so retries and duplicated-stage emissions
 * stay individually inspectable.
 */
function coalesceKey(entry: LogsEntry): string {
  return JSON.stringify([
    entry.event ?? '',
    entry.message ?? '',
    entry.stage ?? '',
    entry.module ?? entry.source ?? '',
    entry.level,
    entry.requestId ?? '',
    entry.source ?? '',
    entry.runId ?? '',
    String(entry.processId ?? ''),
    String(entry.latencyMs ?? ''),
    stableStringify(entry.context),
    stableStringify(entry.metadata),
    stableStringify(entry.error),
  ]);
}

/**
 * For an entry without an explicit `stage` field, derive a short chip label
 * from the event name so the trace timeline still renders meaningful badges
 * instead of empty pills. Last `.`-segment, capped at 12 chars.
 */
export function deriveStageHint(entry: LogsEntry): string | undefined {
  if (entry.stage && entry.stage.length > 0) return entry.stage;
  if (entry.event && entry.event.length > 0) {
    const last = entry.event.split('.').pop() ?? entry.event;
    return last.slice(0, 12);
  }
  return undefined;
}

/**
 * Pure helper: derive a list of either standalone leaves or trace groups
 * (entries sharing a `requestId`).
 *
 * Single-pass, O(n). Walks `entries` in input order so leaf coalescing
 * sees the *real* adjacency: a leaf only extends the previous leaf when
 * no other entry (trace child included) appeared between them. This
 * preserves signal — two identical no-requestId entries split by an
 * unrelated trace stay as two separate rows, not a fake `×2`.
 *
 * Trace groups gather all children sharing a requestId regardless of
 * interleaving; they're sorted by `ts asc` before display, with the
 * group's positional `ts` set to the oldest child so it slots correctly
 * in the reverse-chronological display sort below. Children are NOT
 * coalesced — every stage is preserved for individual inspection.
 */
export function deriveTraceGroups(entries: LogsEntry[]): DerivedItem[] {
  const items: DerivedItem[] = [];
  const traceIndex = new Map<string, number>(); // requestId -> index in items
  let lastLeafIdx = -1;
  let lastLeafKey = '';

  for (const entry of entries) {
    if (entry.requestId) {
      // Trace child. Append to existing group or create one.
      const existingIdx = traceIndex.get(entry.requestId);
      if (existingIdx !== undefined) {
        (items[existingIdx] as TraceGroup).children.push(entry);
      } else {
        const grp: TraceGroup = {
          kind: 'trace',
          requestId: entry.requestId,
          module: entry.module ?? entry.source,
          source: entry.source,
          ts: entry.timestamp,
          maxLevel: entry.level,
          totalLatencyMs: 0,
          children: [entry],
        };
        items.push(grp);
        traceIndex.set(entry.requestId, items.length - 1);
      }
      // A trace entry breaks any leaf-run adjacency.
      lastLeafIdx = -1;
      lastLeafKey = '';
    } else {
      // Standalone leaf.
      const key = coalesceKey(entry);
      if (lastLeafIdx >= 0 && key === lastLeafKey) {
        const prev = items[lastLeafIdx] as LeafItem;
        prev.repeatCount = (prev.repeatCount ?? 1) + 1;
        prev.collapsedRange = {
          fromTs: prev.collapsedRange?.fromTs ?? prev.entry.timestamp,
          toTs: entry.timestamp,
        };
      } else {
        const leaf: LeafItem = { kind: 'leaf', entry };
        items.push(leaf);
        lastLeafIdx = items.length - 1;
        lastLeafKey = key;
      }
    }
  }

  // Finalize trace groups: sort children, compute aggregates, set group ts.
  for (const item of items) {
    if (item.kind === 'trace') {
      item.children.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      let maxLevel: LogsLevel = 'debug';
      let total = 0;
      for (const c of item.children) {
        if (LEVEL_RANK[c.level] > LEVEL_RANK[maxLevel]) maxLevel = c.level;
        if (typeof c.latencyMs === 'number') total += c.latencyMs;
      }
      item.maxLevel = maxLevel;
      item.totalLatencyMs = total;
      const head = item.children[0];
      if (head) item.ts = head.timestamp;
    }
  }

  // Display sort: newest first.
  return items.sort((a, b) => {
    const at = a.kind === 'trace' ? a.ts : a.entry.timestamp;
    const bt = b.kind === 'trace' ? b.ts : b.entry.timestamp;
    return bt.localeCompare(at);
  });
}
