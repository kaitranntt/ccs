import { describe, it, expect } from 'bun:test';
import * as http from 'http';
import {
  hasEncodedBody,
  setUpstreamAcceptEncoding,
  UPSTREAM_ACCEPT_ENCODING,
} from '../content-encoding';

describe('setUpstreamAcceptEncoding', () => {
  it('replaces the client value, whatever its casing', () => {
    const headers: http.OutgoingHttpHeaders = {
      'accept-encoding': 'gzip, deflate, br, zstd',
      'ACCEPT-ENCODING': 'br',
      'content-type': 'application/json',
    };

    setUpstreamAcceptEncoding(headers);

    expect(headers).toEqual({
      'content-type': 'application/json',
      'Accept-Encoding': UPSTREAM_ACCEPT_ENCODING,
    });
  });

  it('sets identity when the client sent no Accept-Encoding', () => {
    const headers: http.OutgoingHttpHeaders = {};

    setUpstreamAcceptEncoding(headers);

    expect(headers['Accept-Encoding']).toBe('identity');
  });
});

describe('hasEncodedBody', () => {
  it('is false without a content coding', () => {
    expect(hasEncodedBody({})).toBe(false);
    expect(hasEncodedBody({ 'content-encoding': '' })).toBe(false);
    expect(hasEncodedBody({ 'content-encoding': 'identity' })).toBe(false);
    expect(hasEncodedBody({ 'content-encoding': ' Identity ' })).toBe(false);
  });

  it('is true for any applied coding', () => {
    expect(hasEncodedBody({ 'content-encoding': 'zstd' })).toBe(true);
    expect(hasEncodedBody({ 'content-encoding': 'GZIP' })).toBe(true);
    expect(hasEncodedBody({ 'content-encoding': 'identity, br' })).toBe(true);
  });

  it('reads a repeated header given as an array', () => {
    const headers = {
      'content-encoding': ['identity', 'gzip'],
    } as unknown as http.IncomingHttpHeaders;
    expect(hasEncodedBody(headers)).toBe(true);
  });
});
