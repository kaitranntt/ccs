import { OAuthTraceEvent, OAuthTracePhase, OAuthTraceSink } from './trace-events';
import { createMemorySink } from './sink-memory';
import { createVerboseStdoutSink } from './sink-verbose-stdout';
import { redactJsonShallow, redactString } from './redactor';

export interface OAuthTraceRecorder {
  record(
    phase: OAuthTracePhase,
    data?: Record<string, unknown>,
    error?: { code?: string; message: string } | Error
  ): void;
  snapshot(): OAuthTraceEvent[];
  summary(): {
    totalMs: number;
    phaseCounts: Record<string, number>;
    lastPhase?: OAuthTracePhase;
  };
  flush(): Promise<void>;
}

export interface OAuthTraceRecorderOptions {
  sessionId: string;
  provider: string;
  verbose: boolean;
  fileSink?: OAuthTraceSink;
  /** Test seam — defaults to `Date.now`. */
  now?: () => number;
  /** Test seam — override verbose sink output channel. */
  verboseOut?: (line: string) => void;
}

/**
 * Create a per-attempt recorder. Always wires:
 *  - memory sink (read via `snapshot()`)
 *  - verbose stdout sink (no-op when verbose=false)
 *  - optional file sink (Phase 8)
 *
 * All event data passes through the redactor before reaching any sink.
 */
export function createOAuthTraceRecorder(options: OAuthTraceRecorderOptions): OAuthTraceRecorder {
  const now = options.now ?? Date.now;
  const start = now();
  const memory = createMemorySink();
  const verbose = createVerboseStdoutSink({ enabled: options.verbose, out: options.verboseOut });
  const sinks: OAuthTraceSink[] = [memory, verbose];
  if (options.fileSink) sinks.push(options.fileSink);

  const phaseCounts: Record<string, number> = {};
  let lastPhase: OAuthTracePhase | undefined;

  function toErrorObj(
    err: { code?: string; message: string } | Error | undefined
  ): { code?: string; message: string } | undefined {
    if (!err) return undefined;
    if (err instanceof Error) {
      return { message: redactString(err.message) };
    }
    return { code: err.code, message: redactString(err.message) };
  }

  return {
    record(phase, data, error) {
      const ts = now();
      const elapsedMs = ts - start;
      const redacted = data ? redactJsonShallow(data) : undefined;
      const event: OAuthTraceEvent = {
        sessionId: options.sessionId,
        provider: options.provider,
        phase,
        ts,
        elapsedMs,
        data: redacted,
        error: toErrorObj(error),
      };
      phaseCounts[phase] = (phaseCounts[phase] ?? 0) + 1;
      lastPhase = phase;
      for (const sink of sinks) {
        try {
          sink.write(event);
        } catch {
          // Sinks must never throw out — drop on failure.
        }
      }
    },
    snapshot() {
      return memory.snapshot();
    },
    summary() {
      return {
        totalMs: now() - start,
        phaseCounts: { ...phaseCounts },
        lastPhase,
      };
    },
    async flush() {
      for (const sink of sinks) {
        if (sink.flush) {
          try {
            await sink.flush();
          } catch {
            // ignore
          }
        }
      }
    },
  };
}
