import * as http from 'http';
import { Readable } from 'stream';

const MAX_BODY_SIZE = 10 * 1024 * 1024;

export function writeJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

export function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const resolveOnce = (payload: unknown) => {
      if (!settled) {
        settled = true;
        resolve(payload);
      }
    };

    const rejectOnce = (error: Error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_SIZE) {
        req.pause();
        rejectOnce(new Error('Request body too large (max 10MB)'));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolveOnce({});
        return;
      }

      try {
        resolveOnce(JSON.parse(raw));
      } catch {
        rejectOnce(new Error('Invalid JSON in request body'));
      }
    });

    req.on('error', (error) => {
      rejectOnce(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

/**
 * Read the raw request body as a UTF-8 string, suitable for forwarding
 * verbatim in passthrough mode. Rejects bodies larger than 10MB.
 */
export function readRawBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const resolveOnce = (payload: string) => {
      if (!settled) {
        settled = true;
        resolve(payload);
      }
    };

    const rejectOnce = (error: Error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_SIZE) {
        req.pause();
        rejectOnce(new Error('Request body too large (max 10MB)'));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      resolveOnce(Buffer.concat(chunks).toString('utf8'));
    });

    req.on('error', (error) => {
      rejectOnce(error instanceof Error ? error : new Error(String(error)));
    });
  });
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
