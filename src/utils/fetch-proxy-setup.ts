/**
 * Global Fetch Proxy Setup
 *
 * Configures undici's global dispatcher to respect standard proxy environment
 * variables without routing CCS loopback traffic back through the proxy.
 */

import { Agent, Dispatcher, ProxyAgent, fetch as undiciFetch, setGlobalDispatcher } from 'undici';
import { getProxyResolution, shouldBypassProxy } from './proxy-env';

const FETCH_PROXY_PROTOCOLS = ['http:', 'https:'];
type RoutingDispatchOptions = Parameters<Dispatcher['dispatch']>[0];
type RoutingDispatchHandler = Parameters<Dispatcher['dispatch']>[1];

export type UpstreamAgentTimeoutOptions = Pick<Agent.Options, 'headersTimeout' | 'bodyTimeout'>;

type GlobalFetchProxyConfig = {
  httpProxyUrl?: string;
  httpsProxyUrl?: string;
  error?: string;
};

class RoutingProxyDispatcher extends Dispatcher {
  private readonly directDispatcher: Agent;
  private readonly httpProxyDispatcher: ProxyAgent | null;
  private readonly httpsProxyDispatcher: ProxyAgent | null;

  constructor(
    httpProxyUrl: string | undefined,
    httpsProxyUrl: string | undefined,
    agentOptions: UpstreamAgentTimeoutOptions = {}
  ) {
    super();
    this.directDispatcher = new Agent(agentOptions);
    this.httpProxyDispatcher = httpProxyUrl
      ? new ProxyAgent({ uri: httpProxyUrl, ...agentOptions })
      : null;
    this.httpsProxyDispatcher = httpsProxyUrl
      ? new ProxyAgent({ uri: httpsProxyUrl, ...agentOptions })
      : null;
  }

  dispatch(options: RoutingDispatchOptions, handler: RoutingDispatchHandler): boolean {
    return this.resolveDispatcher(options.origin).dispatch(options, handler);
  }

  close(): Promise<void>;
  close(callback: () => void): void;
  close(callback?: () => void): Promise<void> | void {
    const promise = Promise.all(this.getDispatchers().map((dispatcher) => dispatcher.close())).then(
      () => undefined
    );

    if (callback) {
      promise.then(
        () => callback(),
        () => callback()
      );
      return;
    }

    return promise;
  }

  destroy(): Promise<void>;
  destroy(err: Error | null): Promise<void>;
  destroy(callback: () => void): void;
  destroy(err: Error | null, callback: () => void): void;
  destroy(
    errOrCallback?: Error | null | (() => void),
    callback?: () => void
  ): Promise<void> | void {
    const error = typeof errOrCallback === 'function' ? null : errOrCallback;
    const done = typeof errOrCallback === 'function' ? errOrCallback : callback;
    const promise = Promise.all(
      this.getDispatchers().map((dispatcher) => dispatcher.destroy(error ?? null))
    ).then(() => undefined);

    if (done) {
      promise.then(
        () => done(),
        () => done()
      );
      return;
    }

    return promise;
  }

  private resolveDispatcher(origin: string | URL | undefined): Dispatcher {
    if (!origin) {
      return this.directDispatcher;
    }

    let url: URL;
    try {
      url = origin instanceof URL ? origin : new URL(origin);
    } catch {
      return this.directDispatcher;
    }

    if (shouldBypassProxy(url.hostname)) {
      return this.directDispatcher;
    }

    if (url.protocol === 'https:' && this.httpsProxyDispatcher) {
      return this.httpsProxyDispatcher;
    }

    if (url.protocol === 'http:' && this.httpProxyDispatcher) {
      return this.httpProxyDispatcher;
    }

    return this.directDispatcher;
  }

  private getDispatchers(): Dispatcher[] {
    return Array.from(
      new Set(
        [this.directDispatcher, this.httpProxyDispatcher, this.httpsProxyDispatcher].filter(
          (dispatcher): dispatcher is Dispatcher => dispatcher !== null
        )
      )
    );
  }
}

export function createGlobalFetchProxyDispatcher(
  agentOptions: UpstreamAgentTimeoutOptions = {}
): Dispatcher | null {
  const { httpProxyUrl, httpsProxyUrl } = resolveGlobalFetchProxyConfig();

  if (!httpProxyUrl && !httpsProxyUrl) {
    return null;
  }

  return new RoutingProxyDispatcher(httpProxyUrl, httpsProxyUrl, agentOptions);
}

export function applyGlobalFetchProxy(): { enabled: boolean; error?: string } {
  try {
    const config = resolveGlobalFetchProxyConfig();
    if (!config.httpProxyUrl && !config.httpsProxyUrl) {
      return config.error ? { enabled: false, error: config.error } : { enabled: false };
    }

    const dispatcher = createGlobalFetchProxyDispatcher();
    if (!dispatcher) {
      return { enabled: false };
    }

    setGlobalDispatcher(dispatcher);
    globalThis.fetch = undiciFetch as typeof globalThis.fetch;
    return { enabled: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown proxy configuration error';
    return { enabled: false, error: message };
  }
}

const setupResult = applyGlobalFetchProxy();
if (setupResult.error) {
  console.error(`[!] Skipping global fetch proxy setup: ${setupResult.error}`);
}

function resolveGlobalFetchProxyConfig(): GlobalFetchProxyConfig {
  const httpProxy = getProxyResolution(false, process.env, {
    allowedProtocols: FETCH_PROXY_PROTOCOLS,
  });
  const httpsProxy = getProxyResolution(true, process.env, {
    allowedProtocols: FETCH_PROXY_PROTOCOLS,
  });

  return {
    httpProxyUrl: httpProxy.url,
    httpsProxyUrl: httpsProxy.url,
    error: httpProxy.error ?? httpsProxy.error,
  };
}
