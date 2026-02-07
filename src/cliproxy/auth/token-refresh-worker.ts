/**
 * Token Refresh Worker
 *
 * Background worker that periodically checks and refreshes OAuth tokens
 * before they expire. Runs as interval loop with retry logic.
 */

import { CLIProxyProvider } from '../types';
import { getAllTokenExpiryInfo, TokenExpiryInfo } from './token-expiry-checker';
import { refreshToken, isRefreshDelegated } from './provider-refreshers';

/** Worker configuration */
export interface TokenRefreshConfig {
  /** Refresh check interval in minutes (default: 30) */
  refreshInterval: number;
  /** Preemptive refresh time in minutes (default: 45) */
  preemptiveTime: number;
  /** Maximum retry attempts per token (default: 3) */
  maxRetries: number;
  /** Base delay for exponential backoff in ms (default: 1000) */
  retryBaseDelay: number;
  /** Timeout for refresh operations in ms (default: 10000) */
  refreshTimeout: number;
  /** Enable verbose logging */
  verbose: boolean;
}

/** Result of a token refresh attempt */
export interface RefreshResult {
  provider: CLIProxyProvider;
  accountId: string;
  success: boolean;
  error?: string;
  refreshedAt?: Date;
  nextExpiry?: number;
}

/** Default worker configuration */
const DEFAULT_CONFIG: TokenRefreshConfig = {
  refreshInterval: 30,
  preemptiveTime: 45,
  maxRetries: 3,
  retryBaseDelay: 1000,
  refreshTimeout: 10000,
  verbose: false,
};

/** Minimum config values to prevent infinite loops */
const MIN_REFRESH_INTERVAL = 1; // 1 minute minimum
const MIN_RETRY_BASE_DELAY = 100; // 100ms minimum

/** Unrecoverable error patterns - don't retry these */
const UNRECOVERABLE_ERRORS = [
  'No refresh token',
  'Invalid client',
  'Invalid grant',
  'Token has been revoked',
  'Token not found',
];

/** Validate and sanitize config values */
function sanitizeConfig(config: TokenRefreshConfig): TokenRefreshConfig {
  return {
    refreshInterval: Math.max(
      MIN_REFRESH_INTERVAL,
      config.refreshInterval || DEFAULT_CONFIG.refreshInterval
    ),
    preemptiveTime: Math.max(0, config.preemptiveTime || DEFAULT_CONFIG.preemptiveTime),
    maxRetries: Math.max(1, config.maxRetries || DEFAULT_CONFIG.maxRetries),
    retryBaseDelay: Math.max(
      MIN_RETRY_BASE_DELAY,
      config.retryBaseDelay || DEFAULT_CONFIG.retryBaseDelay
    ),
    refreshTimeout: Math.max(1000, config.refreshTimeout || DEFAULT_CONFIG.refreshTimeout),
    verbose: config.verbose ?? DEFAULT_CONFIG.verbose,
  };
}

/** Promise with timeout */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMsg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), timeoutMs)),
  ]);
}

/**
 * Background token refresh worker
 * Manages periodic token refresh checks with retry logic
 */
export class TokenRefreshWorker {
  private config: TokenRefreshConfig;
  private intervalId: NodeJS.Timeout | null = null;
  private running = false;
  private lastResults: RefreshResult[] = [];
  private exitHandler: (() => void) | null = null;

  constructor(config: Partial<TokenRefreshConfig> = {}) {
    this.config = sanitizeConfig({ ...DEFAULT_CONFIG, ...config });
  }

  /**
   * Start the worker
   * Runs refresh loop immediately, then on interval
   */
  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.log('[i] Token refresh worker started');

    // Register process exit handlers for cleanup
    this.exitHandler = () => this.stop();
    process.on('SIGINT', this.exitHandler);
    process.on('SIGTERM', this.exitHandler);
    process.on('beforeExit', this.exitHandler);

    // Run immediately on start
    void this.refreshLoop();

    // Then run on interval
    const intervalMs = this.config.refreshInterval * 60 * 1000;
    this.intervalId = setInterval(() => {
      void this.refreshLoop();
    }, intervalMs);
  }

  /**
   * Stop the worker
   */
  stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Remove process exit handlers
    if (this.exitHandler) {
      process.off('SIGINT', this.exitHandler);
      process.off('SIGTERM', this.exitHandler);
      process.off('beforeExit', this.exitHandler);
      this.exitHandler = null;
    }

    this.log('[i] Token refresh worker stopped');
  }

  /**
   * Check if worker is active
   */
  isActive(): boolean {
    return this.running;
  }

  /**
   * Manually trigger refresh check now
   */
  async refreshNow(): Promise<RefreshResult[]> {
    return await this.refreshLoop();
  }

  /**
   * Get results from last refresh cycle
   */
  getLastRefreshResults(): RefreshResult[] {
    return [...this.lastResults];
  }

  /**
   * Main refresh loop
   * Checks all tokens and refreshes those needing refresh
   */
  private async refreshLoop(): Promise<RefreshResult[]> {
    const results: RefreshResult[] = [];

    try {
      const tokens = getAllTokenExpiryInfo();
      // Skip CLIProxy-delegated providers — they handle their own refresh
      const tokensNeedingRefresh = tokens.filter(
        (t) => t.needsRefresh && !isRefreshDelegated(t.provider)
      );

      if (tokensNeedingRefresh.length === 0) {
        this.log('[OK] All tokens valid, no refresh needed');
        this.lastResults = [];
        return results;
      }

      this.log(`[i] Refreshing ${tokensNeedingRefresh.length} token(s)...`);

      for (const token of tokensNeedingRefresh) {
        const result = await this.refreshWithRetry(token);
        results.push(result);

        if (result.success) {
          this.log(`[OK] ${token.provider}/${token.accountId} refreshed`);
        } else {
          this.log(`[X] ${token.provider}/${token.accountId} failed: ${result.error}`);
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.log(`[X] Refresh loop error: ${msg}`);
    }

    this.lastResults = results;
    return results;
  }

  /**
   * Refresh a single token with retry logic
   * Uses exponential backoff on failures
   */
  private async refreshWithRetry(token: TokenExpiryInfo): Promise<RefreshResult> {
    let lastError = 'Unknown error';

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        // Apply timeout to refresh operation
        const result = await withTimeout(
          refreshToken(token.provider, token.accountId),
          this.config.refreshTimeout,
          `Refresh timeout after ${this.config.refreshTimeout}ms`
        );

        if (result.success) {
          return {
            provider: token.provider,
            accountId: token.accountId,
            success: true,
            refreshedAt: new Date(),
            nextExpiry: result.expiresAt,
          };
        }

        lastError = result.error || 'Refresh failed';

        // Don't retry if error indicates unrecoverable issue
        if (this.isUnrecoverableError(lastError)) {
          break;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
      }

      // Exponential backoff before retry
      if (attempt < this.config.maxRetries - 1) {
        const delay = this.config.retryBaseDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    return {
      provider: token.provider,
      accountId: token.accountId,
      success: false,
      error: lastError,
    };
  }

  /**
   * Check if error is unrecoverable (should not retry)
   */
  private isUnrecoverableError(error: string): boolean {
    return UNRECOVERABLE_ERRORS.some((pattern) => error.includes(pattern));
  }

  /**
   * Log message if verbose enabled
   */
  private log(msg: string): void {
    if (this.config.verbose) {
      console.error(`[token-refresh] ${msg}`);
    }
  }
}
