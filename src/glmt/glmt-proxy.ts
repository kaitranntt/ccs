/**
 * GlmtProxy - Legacy embedded HTTP proxy retained for compatibility work.
 *
 * Architecture:
 * - Intercepts Claude CLI → Z.AI calls
 * - Transforms Anthropic format → OpenAI format
 * - Converts reasoning_content → thinking blocks
 * - Supports both streaming and buffered modes
 *
 * Current status:
 * - No longer started by the normal `ccs glmt` runtime path
 * - Kept for legacy/internal compatibility and transformer-adjacent tests
 * - Binds to 127.0.0.1:random_port (security + avoid conflicts)
 * - Terminates when parent process exits
 *
 * Debugging:
 * - Verbose: Pass --verbose to see request/response logs
 * - Debug: Set CCS_DEBUG=1 to write logs to ~/.ccs/logs/
 */

import * as http from 'http';
import * as https from 'https';
import { GlmtTransformer } from './glmt-transformer';
import { SSEParser } from './sse-parser';
import { DeltaAccumulator } from './delta-accumulator';
import { createLogger } from '../services/logging';

const logger = createLogger('glmt:proxy');

interface GlmtProxyConfig {
  verbose?: boolean;
  debugLog?: boolean;
  timeout?: number;
}

/**
 * Configuration for retry behavior on rate limit errors
 */
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  enabled: boolean;
}

interface ThinkingConfig {
  thinking: boolean;
  effort: string;
}

interface OpenAIRequest {
  model: string;
  messages: unknown[];
  max_tokens?: number;
  stream?: boolean;
  [key: string]: unknown;
}

interface AnthropicRequest {
  model: string;
  messages: unknown[];
  max_tokens?: number;
  stream?: boolean;
  thinking?: {
    type: 'enabled' | 'disabled';
    budget_tokens?: number;
  };
  [key: string]: unknown;
}

interface OpenAIResponse {
  id?: string;
  model?: string;
  choices?: Array<{
    message: {
      role: string;
      content?: string;
      reasoning_content?: string;
      tool_calls?: unknown[];
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

export class GlmtProxy {
  private transformer: GlmtTransformer;
  private upstreamUrl: string;
  private server: http.Server | null;
  private port: number | null;
  private verbose: boolean;
  private timeout: number;
  private retryConfig: RetryConfig;
  private httpsAgent: https.Agent;

  constructor(config: GlmtProxyConfig = {}) {
    this.transformer = new GlmtTransformer({
      verbose: config.verbose,
      debugLog:
        config.debugLog || process.env.CCS_DEBUG === '1' || process.env.CCS_DEBUG_LOG === '1',
    });
    // Use ANTHROPIC_BASE_URL from environment (set by settings.json) or fallback to Z.AI default
    this.upstreamUrl =
      process.env.ANTHROPIC_BASE_URL || 'https://api.z.ai/api/coding/paas/v4/chat/completions';
    this.server = null;
    this.port = null;
    this.verbose = config.verbose || false;
    this.timeout = config.timeout || 120000; // 120s default

    // Retry configuration for handling 429 rate limit errors
    const maxRetries = parseInt(process.env.GLMT_MAX_RETRIES || '3', 10);
    const baseDelay = parseInt(process.env.GLMT_RETRY_BASE_DELAY || '1000', 10);
    this.retryConfig = {
      maxRetries: isNaN(maxRetries) || maxRetries < 0 ? 3 : Math.min(maxRetries, 10),
      baseDelay: isNaN(baseDelay) || baseDelay < 0 ? 1000 : baseDelay,
      enabled: process.env.GLMT_DISABLE_RETRY !== '1',
    };

    // Connection pooling for better performance
    this.httpsAgent = new https.Agent({
      keepAlive: true,
      maxSockets: 5,
      maxFreeSockets: 2,
      timeout: this.timeout,
    });
  }

  /**
   * Start HTTP server on random port
   */
  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      // Bind to 127.0.0.1:0 (random port for security + avoid conflicts)
      this.server.listen(0, '127.0.0.1', () => {
        const address = this.server?.address();
        this.port = typeof address === 'object' && address ? address.port : 0;
        logger.stage('intake', 'glmt.proxy.listening', 'GLMT proxy listening', {
          provider: 'glmt',
          port: this.port,
        });
        // Signal parent process
        console.log(`PROXY_READY:${this.port}`);

        // Info message (only show in verbose mode)
        if (this.verbose) {
          logger.info(
            'glmt.proxy.listening_verbose',
            'GLMT proxy listening (streaming with auto-fallback)',
            {
              port: this.port,
            }
          );
        }

        // Debug mode notice
        if ((this.transformer as unknown as { debugLog: boolean }).debugLog) {
          logger.info('glmt.proxy.debug_log_enabled', 'Debug logging enabled', {
            debugLogDir: (this.transformer as unknown as { debugLogDir: string }).debugLogDir,
          });
          logger.warn(
            'glmt.proxy.debug_log_warning',
            'Debug logs contain full request/response data'
          );
        }

        this.log(`Verbose logging enabled`);
        resolve(this.port);
      });

      this.server.on('error', (error) => {
        logger.error('glmt.proxy.server_error', 'GLMT proxy server error', {
          err:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : { message: String(error) },
        });
        reject(error);
      });
    });
  }

  /**
   * Handle incoming HTTP request
   */
  async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const startTime = Date.now();
    this.log(`Request: ${req.method} ${req.url}`);

    try {
      // Only accept POST requests
      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      // Read request body
      const body = await this.readBody(req);
      this.log(`Request body size: ${body.length} bytes`);

      // Parse JSON with error handling
      let anthropicRequest: AnthropicRequest;
      try {
        anthropicRequest = JSON.parse(body);
      } catch (jsonError) {
        const err = jsonError as Error;
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: {
              type: 'invalid_request_error',
              message: 'Invalid JSON in request body: ' + err.message,
            },
          })
        );
        return;
      }

      // Log thinking parameter for debugging
      if (anthropicRequest.thinking) {
        this.log(
          `Request contains thinking parameter: ${JSON.stringify(anthropicRequest.thinking)}`
        );
      } else {
        this.log(`Request does NOT contain thinking parameter (will use message tags or default)`);
      }

      // Try streaming first (default), fallback to buffered on error
      const useStreaming = anthropicRequest.stream !== false;

      if (useStreaming) {
        try {
          await this.handleStreamingRequest(req, res, anthropicRequest, startTime);
        } catch (streamError) {
          const err = streamError as Error;
          this.log(`Streaming failed: ${err.message}, retrying buffered mode`);
          try {
            await this.handleBufferedRequest(req, res, anthropicRequest, startTime);
          } catch (bufferedError) {
            // Both modes failed, propagate error
            throw bufferedError;
          }
        }
      } else {
        await this.handleBufferedRequest(req, res, anthropicRequest, startTime);
      }
    } catch (error) {
      const err = error as Error;
      logger.error('glmt.proxy.request_error', 'GLMT proxy request error', {
        err: { name: err.name, message: err.message },
        method: req.method,
        url: req.url,
        durationMs: Date.now() - startTime,
      });
      const duration = Date.now() - startTime;
      this.log(`Request failed after ${duration}ms: ${err.message}`);

      // Parse error to provide clearer messages
      const errorInfo = this.parseUpstreamError(err);

      // Check if headers already sent (streaming mode may have started)
      if (res.headersSent) {
        // Headers already sent, write error as SSE event and close
        this.log('Headers already sent, writing error as SSE event');
        res.write(`event: error\n`);
        res.write(`data: ${JSON.stringify({ error: errorInfo })}\n\n`);
        res.end();
        return;
      }

      res.writeHead(errorInfo.statusCode, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: {
            type: errorInfo.type,
            message: errorInfo.message,
          },
        })
      );
    }
  }

  /**
   * Handle buffered (non-streaming) request
   */
  private async handleBufferedRequest(
    _req: http.IncomingMessage,
    res: http.ServerResponse,
    anthropicRequest: AnthropicRequest,
    startTime: number
  ): Promise<void> {
    // Transform to OpenAI format
    const { openaiRequest, thinkingConfig } = this.transformer.transformRequest(
      anthropicRequest as unknown as Parameters<typeof this.transformer.transformRequest>[0]
    );

    this.log(`Transformed request, thinking: ${thinkingConfig.thinking}`);

    // Forward to Z.AI with retry on rate limit
    const openaiResponse = (await this.forwardWithRetry(
      openaiRequest as unknown as OpenAIRequest,
      {}
    )) as OpenAIResponse;

    this.log(`Received response from upstream`);

    // Transform back to Anthropic format
    const anthropicResponse = this.transformer.transformResponse(
      openaiResponse as Parameters<typeof this.transformer.transformResponse>[0],
      thinkingConfig
    );

    // Return to Claude CLI
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(anthropicResponse));

    const duration = Date.now() - startTime;
    this.log(`Request completed in ${duration}ms`);
  }

  /**
   * Handle streaming request
   */
  private async handleStreamingRequest(
    _req: http.IncomingMessage,
    res: http.ServerResponse,
    anthropicRequest: AnthropicRequest,
    startTime: number
  ): Promise<void> {
    this.log('Using streaming mode');

    // Transform request
    const { openaiRequest, thinkingConfig } = this.transformer.transformRequest(
      anthropicRequest as unknown as Parameters<typeof this.transformer.transformRequest>[0]
    );

    // Force streaming
    (openaiRequest as OpenAIRequest).stream = true;

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no', // Disable proxy buffering
    });

    // Disable Nagle's algorithm to prevent buffering at socket level
    if (res.socket) {
      res.socket.setNoDelay(true);
    }

    this.log('Starting SSE stream to Claude CLI (socket buffering disabled)');

    // Forward and stream with retry on rate limit
    await this.forwardAndStreamWithRetry(
      openaiRequest as unknown as OpenAIRequest,
      {},
      res,
      thinkingConfig,
      startTime
    );
  }

  /**
   * Read request body
   */
  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const maxSize = 10 * 1024 * 1024; // 10MB limit
      let totalSize = 0;

      req.on('data', (chunk: Buffer) => {
        totalSize += chunk.length;
        if (totalSize > maxSize) {
          reject(new Error('Request body too large (max 10MB)'));
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', () => resolve(Buffer.concat(chunks).toString()));
      req.on('error', reject);
    });
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   * Honors Retry-After header if provided
   */
  private calculateRetryDelay(attempt: number, retryAfterHeader?: string): number {
    const MAX_DELAY_MS = 30000;
    // Honor Retry-After header if present and valid
    if (retryAfterHeader) {
      const retryAfter = parseInt(retryAfterHeader, 10);
      if (!isNaN(retryAfter) && retryAfter > 0) {
        return Math.min(retryAfter * 1000, MAX_DELAY_MS); // Cap at 30s
      }
    }
    // Exponential backoff: 2^attempt * baseDelay + random jitter (0-500ms), capped at 30s
    const exponentialDelay = Math.min(
      Math.pow(2, attempt) * this.retryConfig.baseDelay,
      MAX_DELAY_MS
    );
    const jitter = Math.random() * 500;
    return exponentialDelay + jitter;
  }

  /**
   * Check if error is retryable (429 rate limit)
   * Returns retryable status and optional Retry-After value
   */
  private isRetryableError(error: Error): { retryable: boolean; retryAfter?: string } {
    const message = error.message;
    if (message.includes('429') || message.toLowerCase().includes('rate limit')) {
      // Prefer Retry-After from error property (captured from HTTP header), fallback to parsing message
      const errWithRetryAfter = error as Error & { retryAfter?: string };
      if (errWithRetryAfter.retryAfter) {
        return { retryable: true, retryAfter: errWithRetryAfter.retryAfter };
      }
      const retryAfterMatch = message.match(/retry-after:\s*(\d+)/i);
      return {
        retryable: true,
        retryAfter: retryAfterMatch?.[1],
      };
    }
    return { retryable: false };
  }

  /**
   * Forward request with retry logic for rate limit errors
   */
  private async forwardWithRetry(
    openaiRequest: OpenAIRequest,
    headers: Record<string, string | undefined>
  ): Promise<unknown> {
    if (!this.retryConfig.enabled) {
      return this.forwardToUpstream(openaiRequest, headers);
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await this.forwardToUpstream(openaiRequest, headers);
      } catch (error) {
        const err = error as Error;
        const { retryable, retryAfter } = this.isRetryableError(err);

        if (!retryable || attempt >= this.retryConfig.maxRetries) {
          throw err;
        }

        lastError = err;
        const delay = this.calculateRetryDelay(attempt, retryAfter);

        logger.stage(
          'upstream',
          'glmt.upstream.retry',
          'Retrying GLMT upstream after retryable error',
          { provider: 'glmt', attempt: attempt + 1, maxRetries: this.retryConfig.maxRetries },
          { level: 'warn' }
        );

        if (this.verbose) {
          logger.warn('glmt.proxy.rate_limited_retry', 'Rate limited, retrying after backoff', {
            attempt: attempt + 1,
            maxRetries: this.retryConfig.maxRetries,
            delayMs: Math.round(delay),
          });
        }

        await this.sleep(delay);
      }
    }

    throw lastError ?? new Error('Retry failed');
  }

  /**
   * Forward streaming request with retry logic for rate limit errors
   * Only retries if headers haven't been sent yet
   */
  private async forwardAndStreamWithRetry(
    openaiRequest: OpenAIRequest,
    headers: Record<string, string | undefined>,
    clientRes: http.ServerResponse,
    thinkingConfig: ThinkingConfig,
    startTime: number
  ): Promise<void> {
    if (!this.retryConfig.enabled) {
      return this.forwardAndStreamUpstream(
        openaiRequest,
        headers,
        clientRes,
        thinkingConfig,
        startTime
      );
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await this.forwardAndStreamUpstream(
          openaiRequest,
          headers,
          clientRes,
          thinkingConfig,
          startTime
        );
      } catch (error) {
        const err = error as Error;

        // Don't retry if headers already sent (streaming started)
        if (clientRes.headersSent) {
          throw err;
        }

        const { retryable, retryAfter } = this.isRetryableError(err);

        if (!retryable || attempt >= this.retryConfig.maxRetries) {
          throw err;
        }

        lastError = err;
        const delay = this.calculateRetryDelay(attempt, retryAfter);

        if (this.verbose) {
          logger.warn(
            'glmt.proxy.rate_limited_retry_stream',
            'Rate limited (streaming), retrying after backoff',
            {
              attempt: attempt + 1,
              maxRetries: this.retryConfig.maxRetries,
              delayMs: Math.round(delay),
            }
          );
        }

        await this.sleep(delay);
      }
    }

    throw lastError ?? new Error('Retry failed');
  }

  /**
   * Forward request to Z.AI upstream
   */
  private forwardToUpstream(
    openaiRequest: OpenAIRequest,
    _originalHeaders: Record<string, string | undefined>
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.upstreamUrl);
      const requestBody = JSON.stringify(openaiRequest);

      // OpenAI-compatible endpoints require "Bearer " prefix
      const token = process.env.ANTHROPIC_AUTH_TOKEN || '';
      const authHeader = this.formatAuthHeader(token, url.pathname);

      const options: https.RequestOptions = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname || '/api/coding/paas/v4/chat/completions',
        method: 'POST',
        agent: this.httpsAgent,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestBody),
          Authorization: authHeader,
          'User-Agent': 'CCS-GLMT-Proxy/1.0',
        },
      };

      // Debug logging
      this.log(`Forwarding to: ${url.hostname}${url.pathname}`);

      // Set timeout
      const timeoutHandle = setTimeout(() => {
        req.destroy();
        reject(new Error('Upstream request timeout'));
      }, this.timeout);

      const req = https.request(options, (res) => {
        clearTimeout(timeoutHandle);

        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));

        res.on('end', () => {
          try {
            const body = Buffer.concat(chunks).toString();
            this.log(`Upstream response size: ${body.length} bytes`);

            // Check for non-200 status
            if (res.statusCode !== 200) {
              const err = new Error(
                `Upstream error: ${res.statusCode} ${res.statusMessage}\n${body}`
              ) as Error & { retryAfter?: string };
              // Capture Retry-After header for rate limit handling
              const retryAfterHeader = res.headers['retry-after'];
              if (retryAfterHeader) {
                err.retryAfter = Array.isArray(retryAfterHeader)
                  ? retryAfterHeader[0]
                  : retryAfterHeader;
              }
              reject(err);
              return;
            }

            const response = JSON.parse(body);
            resolve(response);
          } catch (error) {
            const err = error as Error;
            reject(new Error('Invalid JSON from upstream: ' + err.message));
          }
        });
      });

      req.on('error', (error) => {
        clearTimeout(timeoutHandle);
        reject(error);
      });

      req.write(requestBody);
      req.end();
    });
  }

  /**
   * Forward request to Z.AI and stream response
   */
  private async forwardAndStreamUpstream(
    openaiRequest: OpenAIRequest,
    _originalHeaders: Record<string, string | undefined>,
    clientRes: http.ServerResponse,
    thinkingConfig: ThinkingConfig,
    startTime: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.upstreamUrl);
      const requestBody = JSON.stringify(openaiRequest);

      // OpenAI-compatible endpoints require "Bearer " prefix
      const token = process.env.ANTHROPIC_AUTH_TOKEN || '';
      const authHeader = this.formatAuthHeader(token, url.pathname);

      const options: https.RequestOptions = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname || '/api/coding/paas/v4/chat/completions',
        method: 'POST',
        agent: this.httpsAgent,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestBody),
          Authorization: authHeader,
          'User-Agent': 'CCS-GLMT-Proxy/1.0',
          Accept: 'text/event-stream',
        },
      };

      this.log(`Forwarding streaming request to: ${url.hostname}${url.pathname}`);

      // Apply timeout to streaming requests
      const timeoutHandle = setTimeout(() => {
        req.destroy();
        reject(new Error(`Streaming request timeout after ${this.timeout}ms`));
      }, this.timeout);

      const req = https.request(options, (upstreamRes) => {
        clearTimeout(timeoutHandle);
        if (upstreamRes.statusCode !== 200) {
          let body = '';
          upstreamRes.on('data', (chunk: Buffer) => (body += chunk.toString()));
          upstreamRes.on('end', () => {
            const err = new Error(`Upstream error: ${upstreamRes.statusCode}\n${body}`) as Error & {
              retryAfter?: string;
            };
            // Capture Retry-After header for rate limit handling
            const retryAfterHeader = upstreamRes.headers['retry-after'];
            if (retryAfterHeader) {
              err.retryAfter = Array.isArray(retryAfterHeader)
                ? retryAfterHeader[0]
                : retryAfterHeader;
            }
            reject(err);
          });
          return;
        }

        const parser = new SSEParser();
        const accumulator = new DeltaAccumulator(
          thinkingConfig as unknown as Record<string, unknown>
        );

        upstreamRes.on('data', (chunk: Buffer) => {
          try {
            const events = parser.parse(chunk);

            events.forEach((event) => {
              // Transform OpenAI delta → Anthropic events
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const anthropicEvents = this.transformer.transformDelta(event as any, accumulator);

              // Forward to Claude CLI with immediate flush
              anthropicEvents.forEach((evt) => {
                const eventLine = `event: ${evt.event}\n`;
                const dataLine = `data: ${JSON.stringify(evt.data)}\n\n`;
                clientRes.write(eventLine + dataLine);

                // Flush immediately if method available
                if (typeof (clientRes as unknown as { flush?: () => void }).flush === 'function') {
                  (clientRes as unknown as { flush: () => void }).flush();
                }
              });
            });
          } catch (error) {
            const err = error as Error;
            this.log(`Error processing chunk: ${err.message}`);
          }
        });

        upstreamRes.on('end', () => {
          const duration = Date.now() - startTime;
          this.log(`Streaming completed in ${duration}ms`);
          clientRes.end();
          resolve();
        });

        upstreamRes.on('error', (error) => {
          clearTimeout(timeoutHandle);
          this.log(`Upstream stream error: ${error.message}`);
          clientRes.write(`event: error\n`);
          clientRes.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
          clientRes.end();
          reject(error);
        });
      });

      req.on('error', (error) => {
        clearTimeout(timeoutHandle);
        this.log(`Request error: ${error.message}`);
        clientRes.write(`event: error\n`);
        clientRes.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        clientRes.end();
        reject(error);
      });

      req.write(requestBody);
      req.end();
    });
  }

  /**
   * Stop proxy server
   */
  stop(): void {
    if (this.server) {
      this.log('Stopping proxy server');
      this.server.close();
    }
    // Destroy connection pool
    if (this.httpsAgent) {
      this.httpsAgent.destroy();
    }
  }

  /**
   * Log message if verbose
   */
  private log(message: string): void {
    if (this.verbose) {
      logger.info('glmt.proxy.verbose', message);
    }
  }

  /**
   * Format Authorization header based on endpoint type
   * OpenAI-compatible endpoints (chat/completions) require "Bearer " prefix
   * Anthropic-compatible endpoints use token directly
   */
  private formatAuthHeader(token: string, pathname: string): string {
    // OpenAI-compatible endpoints use Bearer token format
    const isOpenAICompatible =
      pathname.includes('chat/completions') ||
      pathname.includes('/v1/') ||
      pathname.includes('/paas/');

    if (isOpenAICompatible && token && !token.startsWith('Bearer ')) {
      return `Bearer ${token}`;
    }
    return token;
  }

  /**
   * Parse upstream error and return user-friendly error info
   */
  private parseUpstreamError(err: Error): {
    statusCode: number;
    type: string;
    message: string;
  } {
    const errorMessage = err.message;

    // Check for 401 Unauthorized / auth token missing
    if (
      errorMessage.includes('401') ||
      errorMessage.toLowerCase().includes('unauthorized') ||
      errorMessage.toLowerCase().includes('authorization token missing') ||
      errorMessage.toLowerCase().includes('invalid token')
    ) {
      return {
        statusCode: 401,
        type: 'authentication_error',
        message:
          'API key rejected by Z.AI. This can happen when:\n' +
          '  1. Key expired on Z.AI server (most common after idle periods)\n' +
          '  2. Key was revoked or regenerated\n' +
          '  3. Key is missing or malformed\n\n' +
          'To fix:\n' +
          '  1. Go to Z.AI dashboard and regenerate your API key\n' +
          '  2. Update ~/.ccs/glm.settings.json with the new key\n' +
          '  3. Or run: ccs config -> API Profiles -> GLM -> Update key',
      };
    }

    // Check for 403 Forbidden
    if (errorMessage.includes('403') || errorMessage.toLowerCase().includes('forbidden')) {
      return {
        statusCode: 403,
        type: 'permission_error',
        message: 'Access forbidden. Your token may not have permission to access this resource.',
      };
    }

    // Check for 429 Rate limit
    if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('rate limit')) {
      return {
        statusCode: 429,
        type: 'rate_limit_error',
        message: 'Rate limit exceeded. Please wait before making more requests.',
      };
    }

    // Check for timeout
    if (errorMessage.toLowerCase().includes('timeout')) {
      return {
        statusCode: 504,
        type: 'timeout_error',
        message: 'Request timed out. The upstream server took too long to respond.',
      };
    }

    // Check for connection errors
    if (
      errorMessage.toLowerCase().includes('econnrefused') ||
      errorMessage.toLowerCase().includes('enotfound') ||
      errorMessage.toLowerCase().includes('connection')
    ) {
      return {
        statusCode: 502,
        type: 'connection_error',
        message:
          'Failed to connect to upstream server. Please check your network and ANTHROPIC_BASE_URL configuration.',
      };
    }

    // Default: proxy error
    return {
      statusCode: 500,
      type: 'proxy_error',
      message: errorMessage,
    };
  }
}

// Main entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');

  const proxy = new GlmtProxy({ verbose });

  proxy.start().catch((error) => {
    logger.error('glmt.proxy.start_failed', 'GLMT proxy failed to start', {
      err:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
    process.exit(1);
  });

  // Cleanup on signals
  process.on('SIGTERM', () => {
    proxy.stop();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    proxy.stop();
    process.exit(0);
  });

  // Keep process alive
  process.on('uncaughtException', (error) => {
    logger.error('glmt.proxy.uncaught_exception', 'GLMT proxy uncaught exception', {
      err:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
    proxy.stop();
    process.exit(1);
  });
}

export default GlmtProxy;
