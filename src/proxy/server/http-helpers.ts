import * as http from 'http';
import { Readable } from 'stream';
import { ValidationError } from '../../errors/error-types';
import { readRequestBody } from '../../utils/request-body';

export function writeJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

/**
 * Read and parse a JSON request body. An empty body parses as `{}`.
 * Rejects with RequestBodyTooLargeError past the shared proxy body limit.
 */
export async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const raw = (await readRequestBody(req)).trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new ValidationError('Invalid JSON in request body', 'body');
  }
}

/**
 * Read the raw request body as a UTF-8 string, suitable for forwarding
 * verbatim in passthrough mode. Rejects with RequestBodyTooLargeError past
 * the shared proxy body limit.
 */
export function readRawBody(req: http.IncomingMessage): Promise<string> {
  return readRequestBody(req);
}

export async function pipeWebResponseToNode(
  response: Response,
  res: http.ServerResponse
): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (!response.body) {
    res.end();
    return;
  }

  const nodeStream = Readable.fromWeb(response.body as unknown as ReadableStream<Uint8Array>);
  await new Promise<void>((resolve, reject) => {
    nodeStream.on('error', reject);
    nodeStream.on('end', resolve);
    nodeStream.pipe(res);
  });
}
