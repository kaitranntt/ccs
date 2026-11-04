import { describe, expect, it } from 'vitest';
import { parseErrorLog, parseFilename } from '@/lib/error-log-parser';

// Shape of a CLIProxyAPI request log for a direct /v1/messages call: the provider
// is not in the URL, only on the per-attempt "Auth:" line of each API REQUEST.
const directMessagesLog = `=== REQUEST INFO ===
Version: v8.0.15-22-g34c0410b-custom
URL: /v1/messages?beta=true
Method: POST
Timestamp: 2026-10-06T15:12:00.003049+08:00


=== HEADERS ===
Anthropic-Version: 2023-06-01


=== REQUEST BODY ===
{"model":"claude-opus-5-5","messages":[]}


=== API REQUEST 1 ===
Timestamp: 2026-10-06T15:12:00.045644+08:00
Upstream URL: http://127.0.0.1:8787/v1/messages?beta=true
HTTP Method: POST
Auth: provider=claude, auth_id=claude-a.json, label=a, type=oauth

Body:
{"model":"claude-opus-5-5","messages":[],"upstream":true}


=== API RESPONSE ===
Timestamp: 2026-10-06T15:16:06.071866+08:00
{"type":"error","error":{"type":"rate_limit_error","message":"limited"}}


=== RESPONSE ===
Status: 429
Content-Type: application/json

{"type":"error","error":{"type":"rate_limit_error","message":"limited"}}
`;

describe('error-log-parser with direct CLIProxy routes', () => {
  it('takes provider from the API REQUEST auth line and endpoint from the URL path', () => {
    const parsed = parseErrorLog(directMessagesLog);

    expect(parsed.provider).toBe('claude');
    expect(parsed.endpoint).toBe('v1/messages');
    expect(parsed.statusCode).toBe(429);
    expect(parsed.errorType).toBe('rate_limit');
  });

  it('keeps the client request body instead of the upstream attempt', () => {
    const parsed = parseErrorLog(directMessagesLog);

    expect(parsed.requestBody).toBe('{"model":"claude-opus-5-5","messages":[]}');
    expect(parsed.model).toBe('claude-opus-5-5');
  });

  it('still prefers the provider segment of /api/provider URLs', () => {
    const parsed = parseErrorLog(
      directMessagesLog.replace('URL: /v1/messages?beta=true', 'URL: /api/provider/agy/v1/messages')
    );

    expect(parsed.provider).toBe('agy');
    expect(parsed.endpoint).toBe('v1/messages');
  });

  it('derives the endpoint from direct-route filenames', () => {
    expect(parseFilename('error-v1-messages-2026-10-06T151606-681f3f2b.log').endpoint).toBe(
      'v1/messages'
    );
    expect(
      parseFilename('error-api-provider-agy-v1-messages-2025-12-29T105823-a12b73f8.log')
    ).toMatchObject({ provider: 'agy', endpoint: 'v1/messages' });
  });
});
