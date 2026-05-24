import type { CursorConfig } from '../config/unified-config-types';
import { checkAuthStatus } from './cursor-auth';
import { isDaemonRunning, startDaemon } from './cursor-daemon';
import { getCursorDaemonToken } from './cursor-daemon-auth';
import { getModelsForDaemon, resolveCursorRequestModel } from './cursor-models';

export interface CursorProbeResult {
  ok: boolean;
  stage: 'config' | 'auth' | 'daemon' | 'runtime';
  status: number;
  duration_ms: number;
  model?: string;
  error_type?: string | null;
  message: string;
}

const PROBE_PROMPT = 'Reply with OK only.';
const PROBE_TIMEOUT_MS = 15_000;
const PROBE_SUCCESS_PATTERN = /^ok[.!]?$/i;

function isDaemonReachabilityError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  if (
    message.includes('fetch failed') ||
    message.includes('econnrefused') ||
    message.includes('econnreset') ||
    message.includes('socket hang up') ||
    message.includes('connection refused')
  ) {
    return true;
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  if (!cause || typeof cause !== 'object' || !('code' in cause)) {
    return false;
  }

  const code = String((cause as { code?: unknown }).code ?? '').toUpperCase();
  return ['ECONNREFUSED', 'ECONNRESET', 'ECONNABORTED', 'EPIPE', 'UND_ERR_SOCKET'].includes(code);
}

function parseProbeError(text: string): { errorType: string | null; message: string } {
  try {
    const parsed = JSON.parse(text) as {
      error?: { type?: string; message?: string };
      type?: string;
    };

    if (parsed.error?.message) {
      return {
        errorType: parsed.error.type ?? null,
        message: parsed.error.message,
      };
    }

    if (parsed.type === 'error') {
      return {
        errorType: null,
        message: text,
      };
    }
  } catch {
    // fall through to raw text
  }

  return {
    errorType: null,
    message: text || 'Unknown probe failure',
  };
}

function parseProbeSuccess(text: string): { ok: boolean; message: string } {
  try {
    const parsed = JSON.parse(text) as {
      choices?: Array<{
        message?: { content?: string | null };
      }>;
      error?: { message?: string };
    };

    if (parsed.error?.message) {
      return { ok: false, message: parsed.error.message };
    }

    const content = parsed.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return { ok: false, message: 'Probe response was missing assistant content.' };
    }

    return {
      ok: PROBE_SUCCESS_PATTERN.test(content.trim()),
      message: PROBE_SUCCESS_PATTERN.test(content.trim())
        ? 'Live probe succeeded.'
        : `Probe returned unexpected assistant content: ${content.trim()}`,
    };
  } catch {
    return { ok: false, message: 'Probe response was not valid JSON.' };
  }
}

export async function probeCursorRuntime(config: CursorConfig): Promise<CursorProbeResult> {
  const startedAt = Date.now();

  if (!config.enabled) {
    return {
      ok: false,
      stage: 'config',
      status: 400,
      duration_ms: Date.now() - startedAt,
      message: 'Cursor integration is disabled.',
      error_type: 'configuration_error',
    };
  }

  const authStatus = checkAuthStatus();
  if (!authStatus.authenticated || !authStatus.credentials) {
    return {
      ok: false,
      stage: 'auth',
      status: 401,
      duration_ms: Date.now() - startedAt,
      message: 'Cursor credentials not found. Run `ccs legacy cursor auth` first.',
      error_type: 'authentication_error',
    };
  }

  if (authStatus.expired) {
    return {
      ok: false,
      stage: 'auth',
      status: 401,
      duration_ms: Date.now() - startedAt,
      message: 'Cursor credentials expired. Run `ccs legacy cursor auth` again.',
      error_type: 'authentication_error',
    };
  }

  const daemonToken = getCursorDaemonToken();
  let daemonRunning = await isDaemonRunning(config.port, daemonToken);
  if (!daemonRunning && config.auto_start) {
    const startResult = await startDaemon({
      port: config.port,
      ghost_mode: config.ghost_mode,
    });

    if (!startResult.success) {
      daemonRunning = await isDaemonRunning(config.port, daemonToken);
    } else {
      daemonRunning = true;
    }

    if (!daemonRunning) {
      return {
        ok: false,
        stage: 'daemon',
        status: 503,
        duration_ms: Date.now() - startedAt,
        message: startResult.error || 'Failed to start Cursor daemon for live probe.',
        error_type: 'daemon_start_failed',
      };
    }
  }

  if (!daemonRunning) {
    return {
      ok: false,
      stage: 'daemon',
      status: 503,
      duration_ms: Date.now() - startedAt,
      message:
        'Cursor daemon is not running. Start it with `ccs legacy cursor start` or enable auto_start.',
      error_type: 'daemon_not_running',
    };
  }

  try {
    const credentials = {
      accessToken: authStatus.credentials.accessToken,
      machineId: authStatus.credentials.machineId,
      ghostMode: config.ghost_mode,
    };
    const availableModels = await getModelsForDaemon({ credentials });
    const model = resolveCursorRequestModel(config.model, availableModels);

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), PROBE_TIMEOUT_MS);

    try {
      const response = await fetch(`http://127.0.0.1:${config.port}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          max_tokens: 8,
          messages: [{ role: 'user', content: PROBE_PROMPT }],
        }),
        signal: abortController.signal,
      });
      const text = await response.text();
      const duration = Date.now() - startedAt;

      if (!response.ok) {
        const error = parseProbeError(text);
        return {
          ok: false,
          stage: 'runtime',
          status: response.status,
          duration_ms: duration,
          model,
          error_type: error.errorType,
          message: error.message,
        };
      }

      const success = parseProbeSuccess(text);
      return {
        ok: success.ok,
        stage: 'runtime',
        status: success.ok ? response.status : 502,
        duration_ms: duration,
        model,
        error_type: success.ok ? null : 'probe_validation_failed',
        message: success.message,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const daemonReachabilityError = isDaemonReachabilityError(error);

    return {
      ok: false,
      stage:
        error instanceof Error && error.name === 'AbortError'
          ? 'runtime'
          : daemonReachabilityError
            ? 'daemon'
            : 'runtime',
      status:
        error instanceof Error && error.name === 'AbortError'
          ? 504
          : daemonReachabilityError
            ? 503
            : 500,
      duration_ms: Date.now() - startedAt,
      error_type:
        error instanceof Error && error.name === 'AbortError'
          ? 'probe_timeout'
          : daemonReachabilityError
            ? 'daemon_unreachable'
            : 'runtime_error',
      message:
        error instanceof Error && error.name === 'AbortError'
          ? `Live probe timed out after ${PROBE_TIMEOUT_MS}ms.`
          : daemonReachabilityError
            ? 'Cursor daemon became unreachable during the live probe. Start it again and retry.'
            : error instanceof Error
              ? error.message
              : 'Unknown runtime probe failure.',
    };
  }
}
