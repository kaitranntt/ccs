import { randomUUID } from 'crypto';
import { getResolvedLoggingConfig } from './log-config';
import { getRequestContext } from './log-context';
import { maskSecretTokens, redactContext } from './log-redaction';
import { appendStructuredLogEntry } from './log-storage';
import type { LogEntry, LogStage, LoggingLevel } from './log-types';

const processRunId = `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;

interface CreateEntryOptions {
  stage?: LogStage;
  latencyMs?: number;
  error?: LogEntry['error'];
}

function createEntry(
  source: string,
  level: LoggingLevel,
  event: string,
  message: string,
  context: Record<string, unknown>,
  options: CreateEntryOptions = {}
): LogEntry {
  const config = getResolvedLoggingConfig();
  const reqCtx = getRequestContext();
  const entry: LogEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    level,
    source,
    event,
    message: maskSecretTokens(message),
    processId: process.pid,
    runId: processRunId,
    context: config.redact ? redactContext(context) : context,
  };
  if (reqCtx?.requestId) entry.requestId = reqCtx.requestId;
  if (options.stage) entry.stage = options.stage;
  if (typeof options.latencyMs === 'number') entry.latencyMs = options.latencyMs;
  if (options.error) entry.error = options.error;
  return entry;
}

export interface StageOptions {
  /** Optional level override; default `'info'`. */
  level?: LoggingLevel;
  /** Optional latency in ms (typically attached to `respond`/`cleanup`). */
  latencyMs?: number;
  /** Optional structured error info for `cleanup` stages. */
  error?: LogEntry['error'];
}

export interface Logger {
  child(context: Record<string, unknown>): Logger;
  debug(event: string, message: string, context?: Record<string, unknown>): void;
  info(event: string, message: string, context?: Record<string, unknown>): void;
  warn(event: string, message: string, context?: Record<string, unknown>): void;
  error(event: string, message: string, context?: Record<string, unknown>): void;
  /**
   * Emit a stage-tagged log entry.
   *
   * Locked signature: `stage(stage, event, message, context?, options?)`.
   * `options.level` defaults to `'info'`. Use `options.latencyMs` on
   * `respond`/`cleanup`. Use `options.error` for structured error info.
   */
  stage(
    stage: LogStage,
    event: string,
    message: string,
    context?: Record<string, unknown>,
    options?: StageOptions
  ): void;
}

export function createLogger(source: string, baseContext: Record<string, unknown> = {}): Logger {
  const write = (
    level: LoggingLevel,
    event: string,
    message: string,
    context?: Record<string, unknown>,
    extra: CreateEntryOptions = {}
  ) => {
    appendStructuredLogEntry(
      createEntry(source, level, event, message, { ...baseContext, ...(context || {}) }, extra)
    );
  };

  return {
    child(context: Record<string, unknown>) {
      return createLogger(source, { ...baseContext, ...context });
    },
    debug(event, message, context) {
      write('debug', event, message, context);
    },
    info(event, message, context) {
      write('info', event, message, context);
    },
    warn(event, message, context) {
      write('warn', event, message, context);
    },
    error(event, message, context) {
      write('error', event, message, context);
    },
    stage(stage, event, message, context, options) {
      const level = options?.level ?? 'info';
      write(level, event, message, context, {
        stage,
        latencyMs: options?.latencyMs,
        error: options?.error,
      });
    },
  };
}
