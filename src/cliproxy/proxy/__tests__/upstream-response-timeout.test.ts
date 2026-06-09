/**
 * Unit tests for attachUpstreamResponseTimeout
 *
 * The stubs mirror Node's IncomingMessage.setTimeout semantics, which delegate
 * to this.socket.setTimeout() without a null guard (node:_http_incoming). The
 * published CLI runs under Node, where keep-alive agents detach the socket from
 * the response before user 'end' listeners run — Bun keeps the socket attached,
 * so a real-socket integration test cannot reproduce the Node-only crash.
 */

import { describe, it, expect } from 'bun:test';
import * as http from 'http';
import {
  attachUpstreamResponseTimeout,
  UPSTREAM_RESPONSE_TIMEOUT_MESSAGE,
} from '../upstream-response-timeout';

interface UpstreamResStub {
  socket: { setTimeout: (ms: number) => void } | null;
  headers: http.IncomingHttpHeaders;
  destroyedWith: Error | undefined;
  setTimeout: (ms: number, callback?: () => void) => UpstreamResStub;
  destroy: (error?: Error) => void;
  fireTimeout: () => void;
  socketTimeoutCalls: number[];
}

function createUpstreamResStub(): UpstreamResStub {
  const socketTimeoutCalls: number[] = [];
  let timeoutCallback: (() => void) | undefined;

  const stub: UpstreamResStub = {
    socket: {
      setTimeout(ms: number) {
        socketTimeoutCalls.push(ms);
      },
    },
    headers: {},
    destroyedWith: undefined,
    setTimeout(ms: number, callback?: () => void) {
      if (callback) timeoutCallback = callback;
      // Intentionally unguarded, matching node:_http_incoming.
      stub.socket!.setTimeout(ms);
      return stub;
    },
    destroy(error?: Error) {
      stub.destroyedWith = error;
    },
    fireTimeout() {
      timeoutCallback?.();
    },
    socketTimeoutCalls,
  };

  return stub;
}

function createUpstreamReqStub() {
  return {
    destroyedWith: undefined as Error | undefined,
    destroy(error?: Error) {
      this.destroyedWith = error;
    },
  };
}

function createClientResStub() {
  return {
    headersSent: false,
    destroyed: false,
    writableEnded: false,
    statusCode: undefined as number | undefined,
    body: '',
    writeHead(statusCode: number) {
      this.statusCode = statusCode;
      this.headersSent = true;
      return this;
    },
    write(chunk: string) {
      this.body += chunk;
      return true;
    },
    end() {
      this.writableEnded = true;
    },
  };
}

function attach(
  upstreamRes: UpstreamResStub,
  upstreamReq = createUpstreamReqStub(),
  clientRes = createClientResStub()
) {
  const clear = attachUpstreamResponseTimeout({
    upstreamReq: upstreamReq as unknown as http.ClientRequest,
    upstreamRes: upstreamRes as unknown as http.IncomingMessage,
    clientRes: clientRes as unknown as http.ServerResponse,
    timeoutMs: 1_000,
  });
  return { clear, upstreamReq, clientRes };
}

describe('attachUpstreamResponseTimeout', () => {
  it('arms the socket timeout on attach and clears it while the socket is attached', () => {
    const upstreamRes = createUpstreamResStub();
    const { clear } = attach(upstreamRes);

    expect(upstreamRes.socketTimeoutCalls).toEqual([1_000]);

    clear();

    expect(upstreamRes.socketTimeoutCalls).toEqual([1_000, 0]);
  });

  it('does not throw when a keep-alive agent detached the socket before cleanup', () => {
    const upstreamRes = createUpstreamResStub();
    const { clear } = attach(upstreamRes);

    // Node nulls res.socket when the agent reclaims the connection after 'end'.
    upstreamRes.socket = null;

    expect(() => clear()).not.toThrow();
  });

  it('writes a timeout response and destroys both sides when the timeout fires', () => {
    const upstreamRes = createUpstreamResStub();
    const { upstreamReq, clientRes } = attach(upstreamRes);

    upstreamRes.fireTimeout();

    expect(clientRes.statusCode).toBe(504);
    expect(clientRes.body).toContain(UPSTREAM_RESPONSE_TIMEOUT_MESSAGE);
    expect(upstreamRes.destroyedWith?.message).toBe(UPSTREAM_RESPONSE_TIMEOUT_MESSAGE);
    expect(upstreamReq.destroyedWith?.message).toBe(UPSTREAM_RESPONSE_TIMEOUT_MESSAGE);
  });

  it('ignores a late timeout after clear() settled the response', () => {
    const upstreamRes = createUpstreamResStub();
    const { clear, upstreamReq, clientRes } = attach(upstreamRes);

    clear();
    upstreamRes.fireTimeout();

    expect(clientRes.statusCode).toBeUndefined();
    expect(clientRes.body).toBe('');
    expect(upstreamRes.destroyedWith).toBeUndefined();
    expect(upstreamReq.destroyedWith).toBeUndefined();
  });
});
