import * as http from 'http';

export const UPSTREAM_RESPONSE_TIMEOUT_MESSAGE =
  'Upstream response timed out while streaming response body';

export function buildTimeoutSafeResponseHeaders(
  headers: http.IncomingHttpHeaders
): http.OutgoingHttpHeaders {
  const safeHeaders: http.OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(headers)) {
    const normalized = name.toLowerCase();
    if (normalized === 'content-length' || normalized === 'transfer-encoding') {
      continue;
    }
    safeHeaders[name] = value;
  }
  return safeHeaders;
}

export function writeForwardResponseHead(
  clientRes: http.ServerResponse,
  statusCode: number,
  headers: http.IncomingHttpHeaders
): void {
  if (clientRes.headersSent) return;
  clientRes.writeHead(statusCode, buildTimeoutSafeResponseHeaders(headers));
}

export function writeTimeoutResponse(
  clientRes: http.ServerResponse,
  headers: http.IncomingHttpHeaders,
  message = UPSTREAM_RESPONSE_TIMEOUT_MESSAGE
): void {
  if (clientRes.destroyed || clientRes.writableEnded) return;

  const contentType = String(headers['content-type'] ?? '').toLowerCase();

  try {
    if (contentType.includes('text/event-stream')) {
      const payload = {
        type: 'error',
        error: {
          type: 'timeout_error',
          message,
        },
      };
      clientRes.write(`event: error\ndata: ${JSON.stringify(payload)}\n\n`);
    } else if (!clientRes.headersSent) {
      clientRes.writeHead(504, { 'Content-Type': 'application/json' });
      clientRes.write(JSON.stringify({ error: message }));
    } else {
      clientRes.write(`\n${JSON.stringify({ error: message })}`);
    }

    clientRes.end();
  } catch {
    // Client may have disconnected while the upstream response was stalled.
  }
}

export function attachUpstreamResponseTimeout(options: {
  upstreamReq: http.ClientRequest;
  upstreamRes: http.IncomingMessage;
  clientRes: http.ServerResponse;
  timeoutMs: number;
  onTimeout?: (error: Error) => void;
}): () => void {
  const { upstreamReq, upstreamRes, clientRes, timeoutMs, onTimeout } = options;
  let settled = false;

  const clear = () => {
    settled = true;
    upstreamRes.setTimeout(0);
  };

  upstreamRes.setTimeout(timeoutMs, () => {
    if (settled) return;
    settled = true;
    const error = new Error(UPSTREAM_RESPONSE_TIMEOUT_MESSAGE);
    writeTimeoutResponse(clientRes, upstreamRes.headers, error.message);
    onTimeout?.(error);
    upstreamRes.destroy(error);
    upstreamReq.destroy(error);
  });

  return clear;
}
