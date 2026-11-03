import * as http from 'http';

/**
 * Accept-Encoding the body-reading proxies send upstream. They scan and rewrite
 * response bytes (tool names, SSE lifecycle, error bodies), which only works on
 * an uncompressed body. The client's own Accept-Encoding is not forwarded: a
 * compressed reply would reach code that treats it as text. Dropping the header
 * is not enough, since an absent Accept-Encoding means any content coding is
 * acceptable (RFC 9110 §12.5.3).
 */
export const UPSTREAM_ACCEPT_ENCODING = 'identity';

/** Replace the client's Accept-Encoding on forwarded headers with {@link UPSTREAM_ACCEPT_ENCODING}. */
export function setUpstreamAcceptEncoding(headers: http.OutgoingHttpHeaders): void {
  for (const name of Object.keys(headers)) {
    if (name.toLowerCase() === 'accept-encoding') {
      delete headers[name];
    }
  }
  headers['Accept-Encoding'] = UPSTREAM_ACCEPT_ENCODING;
}

/**
 * True when a response body carries a content coding (gzip, br, zstd, ...).
 * The proxies must then pass the bytes through untouched: decoding them as text
 * or appending plain-text events corrupts the stream the client decompresses.
 */
export function hasEncodedBody(headers: http.IncomingHttpHeaders): boolean {
  const value = headers['content-encoding'];
  const raw = Array.isArray(value) ? value.join(',') : (value ?? '');
  return raw
    .split(',')
    .map((coding) => coding.trim().toLowerCase())
    .some((coding) => coding !== '' && coding !== 'identity');
}
