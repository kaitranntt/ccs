import { describe, it, expect, mock } from 'bun:test';
import { EventEmitter } from 'events';

const infoSpy = mock(() => {});

mock.module('../../../src/services/logging', () => ({
  createLogger: () => ({
    info: infoSpy,
  }),
}));

describe('requestLoggingMiddleware', () => {
  it('skips logging failed unauthenticated responses', async () => {
    const { requestLoggingMiddleware } = await import(
      '../../../src/web-server/middleware/request-logging-middleware'
    );

    const req = {
      originalUrl: '/api/profiles',
      method: 'GET',
      headers: { 'user-agent': 'test-agent' },
      socket: { remoteAddress: '10.0.0.10' },
    } as never;

    const res = new EventEmitter() as EventEmitter & {
      locals: Record<string, unknown>;
      statusCode: number;
      setHeader: (name: string, value: string) => void;
    };
    res.locals = {};
    res.statusCode = 401;
    res.setHeader = () => {};

    let nextCalled = false;
    requestLoggingMiddleware(req, res as never, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    res.emit('finish');
    expect(infoSpy).toHaveBeenCalledTimes(0);
  });

  it('logs successful responses', async () => {
    const { requestLoggingMiddleware } = await import(
      '../../../src/web-server/middleware/request-logging-middleware'
    );

    const req = {
      originalUrl: '/api/profiles',
      method: 'GET',
      headers: { 'user-agent': 'test-agent' },
      socket: { remoteAddress: '127.0.0.1' },
    } as never;

    const res = new EventEmitter() as EventEmitter & {
      locals: Record<string, unknown>;
      statusCode: number;
      setHeader: (name: string, value: string) => void;
    };
    res.locals = {};
    res.statusCode = 200;
    res.setHeader = () => {};

    requestLoggingMiddleware(req, res as never, () => {});
    res.emit('finish');

    expect(infoSpy).toHaveBeenCalledTimes(1);
  });
});
