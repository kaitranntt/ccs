import * as https from 'https';
import {
  buildManagementHeaders,
  buildProxyUrl,
  getProxyTarget,
  type ProxyTarget,
} from '../proxy/proxy-target-resolver';

const ROUTING_TIMEOUT_MS = 5000;
const CLIPROXY_ROUTING_MANAGEMENT_PATH = '/v0/management/routing/strategy';

export type CliproxyRetryManagementSetting = 'request-retry' | 'max-retry-interval';

export function getCliproxyRoutingManagementUrl(target: ProxyTarget): string {
  return buildProxyUrl(target, CLIPROXY_ROUTING_MANAGEMENT_PATH);
}

export function getCliproxyRetryManagementUrl(
  target: ProxyTarget,
  setting: CliproxyRetryManagementSetting
): string {
  return buildProxyUrl(target, `/v0/management/${setting}`);
}

export async function fetchCliproxyRoutingResponse(
  target: ProxyTarget,
  method: 'GET' | 'PUT',
  body?: Record<string, string>
): Promise<Response> {
  return fetchCliproxyManagementResponse(
    target,
    getCliproxyRoutingManagementUrl(target),
    method,
    body
  );
}

async function fetchCliproxyManagementResponse(
  target: ProxyTarget,
  url: string,
  method: 'GET' | 'PUT',
  body?: Record<string, string | number>
): Promise<Response> {
  const headers = buildManagementHeaders(
    target,
    body ? { 'Content-Type': 'application/json' } : {}
  );

  if (target.protocol !== 'https' || !target.allowSelfSigned) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ROUTING_TIMEOUT_MS);

    try {
      return await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const requestUrl = new URL(url);

  return new Promise<Response>((resolve, reject) => {
    const agent = new https.Agent({ rejectUnauthorized: false });
    let settled = false;

    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      callback();
    };

    let req: ReturnType<typeof https.request> | undefined;
    const timeoutId = setTimeout(() => {
      const error = new Error('Request timeout');
      req?.destroy(error);
      settle(() => reject(error));
    }, ROUTING_TIMEOUT_MS);

    try {
      req = https.request(
        requestUrl,
        {
          method,
          headers,
          agent,
          timeout: ROUTING_TIMEOUT_MS,
        },
        (res) => {
          let payload = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            payload += chunk;
          });
          res.on('end', () => {
            settle(() =>
              resolve(
                new Response(payload, {
                  status: res.statusCode || 500,
                  statusText: res.statusMessage ?? '',
                  headers:
                    typeof res.headers['content-type'] === 'string'
                      ? { 'Content-Type': res.headers['content-type'] }
                      : undefined,
                })
              )
            );
          });
        }
      );
    } catch (error) {
      settle(() => reject(error));
      return;
    }

    const request = req;

    request.on('error', (error) => {
      settle(() => reject(error));
    });

    request.on('timeout', () => {
      const error = new Error('Request timeout');
      request.destroy(error);
      settle(() => reject(error));
    });

    if (body) {
      request.write(JSON.stringify(body));
    }
    request.end();
  });
}

export async function fetchCliproxyRetryResponse(
  target: ProxyTarget,
  setting: CliproxyRetryManagementSetting,
  method: 'GET' | 'PUT',
  value?: number
): Promise<Response> {
  return fetchCliproxyManagementResponse(
    target,
    getCliproxyRetryManagementUrl(target, setting),
    method,
    value === undefined ? undefined : { value }
  );
}

export function getCliproxyRoutingTarget(): ProxyTarget {
  return getProxyTarget();
}

export function getRoutingErrorMessage(response: Response, fallback: string): Promise<string> {
  return response
    .json()
    .then((data) => {
      if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
        return data.error;
      }
      return fallback;
    })
    .catch(() => fallback);
}
