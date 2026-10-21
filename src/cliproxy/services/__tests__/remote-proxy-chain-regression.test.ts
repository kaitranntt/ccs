import { describe, expect, it } from 'bun:test';
import * as http from 'http';
import * as https from 'https';
import type { AddressInfo } from 'net';
import { CodexReasoningProxy } from '../../ai-providers/codex-reasoning-proxy';
import { ToolSanitizationProxy } from '../../proxy/tool-sanitization-proxy';

const SELF_SIGNED_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDGH5Akfta94U5O
X7LZIeoRN9pOKiXuqiTnIrOh/dW/RZJp1Fg0M+t+Gv/WFu/KOMrUwpsPZ8ectOCy
cwdv+ME/+4RlAiGmALLinlDqCPv0Z8gRiZpfEeOinzrnBR26fphtebdlRF4Xy0rI
QcnMsC6Wr1V484CP5iM6GAdVP+gXoYINV2VtooXS/ViptmxLMqMqhjDhz6ZUfEP4
XmQU73eM8/OaQSRIqJx1UyByERjgz0m/ySHAStS/IIKyjZVB9i0iZtwqO8Jl63ib
rzxKehVNDB0iCW9BawpQx6tqoO/hXKIUNPQaBQ8GfLwM7lCvGVSNuPLsB5mf1V65
6UqvNVEfAgMBAAECggEAQ6Nm7G65FV4kA7G8N1DSvkoZJ3JQPOitbJN2TCmCnag8
0hCChF/tV8IT8Z0nBBzbckN1+I5voVpHE+Udduav4w4VJv7RSgEXETMHYL7sdYYw
0XvuzeInms9Npq0idxbdJxLUv6fVj74Bq9h58n17ikoVnhNToszo3d5yMnJ85APP
tTHPJrv4oQYcrYfxksuL3RRqy4VpH/E8zA2AlakbuxfrwcqJ/kqvHCBFd/l3qfnf
U06ZqxZDYvZW9GYMvao+e2XLxT44A50EsTH0C3XIMsGGRVO+4ZzhbUBSDOgxx9pl
Lg75MrpKpFZSGO5EqjT1SX4E3eZijerHaqBS3P5sQQKBgQDnJgYyToRUq3Fb4pHF
XelW5cVg93XA/XtFWcx9ndwGRtwFYVs+b63MhILGGyDzsDzsmUjyNK013ldMTp0F
6TpMUFsc0mpyf63khNUyw7J/le447zZgwAEv/IaDf0CepCfJ149a7Y7jbZPG2R43
ldFOxV1t8ERIiZnDd4iZjG9O7wKBgQDbbJMT8p6CGws5ZqKu0DYRbWoPvSFvMt3K
f5rXKl+PhhSOkljYXAzCi2Cjp/s/fU5cirtxf/If7ZqfR+VJwrJyzLvS/P4JDahI
HOiTulauN7QWmgHCifmHGX33Rwupo2ctUDXvMmrN53tLTKkQJVKODMmnlaQ8SDfu
CVTjyQgg0QKBgQDeND52s+YgYuNJeme5fMrof1+cFKc9TC/pfibHhy5RVmMCRRHq
1n8UATqZ6NBnkr8ujziBpcPw6fmv4E6wtQEXBZRhA6HSygzHhi5Ra7E3V1E3qDX1
Ef7SO4av+G+NUa7yKOeleIMI/Hi4ClYzBzG78J0dJ4Ds3mJTdqB5Q3hpPwKBgGSR
8R+Vdl0/s/dNOYdSW1XFhnVMRITJFar4rams/Du2QrnODfasyhRo+ZRJK/k/n6j+
1UcCU6Gar+INe+RA3rWLbRMZbf4MSnMy/M6o+43CbkJluCTIRJxNbNTntUq9YE7+
kpndy+IwFOzAaETENoBxEARFrA8NMsVhdY0p2RXhAoGBAMKLDojNYSoF+Wp2nsSJ
Ahdwyrsk4eJSiFqr2g4wI1Ehhk/mOtYrDlmZZWQ3i0FC2xmAXDUKrBNgcNqoWvJg
tIXz8cRN0dmAMNeAjJ4dCBFnGUAV9D6KdUHPqhLhlMHpX3uc7h1/ya6/9gfzZNC5
EQfxhCAaAvIvuZUSu4hJvM5U
-----END PRIVATE KEY-----`;

const SELF_SIGNED_CERT = `-----BEGIN CERTIFICATE-----
MIIDJTCCAg2gAwIBAgIUHdVZVRUzHman7tQL4dHoBEiRYkcwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI2MDQyNDAyMzEwNFoXDTM2MDQy
MTAyMzEwNFowFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAxh+QJH7WveFOTl+y2SHqETfaTiol7qok5yKzof3Vv0WS
adRYNDPrfhr/1hbvyjjK1MKbD2fHnLTgsnMHb/jBP/uEZQIhpgCy4p5Q6gj79GfI
EYmaXxHjop865wUdun6YbXm3ZUReF8tKyEHJzLAulq9VePOAj+YjOhgHVT/oF6GC
DVdlbaKF0v1YqbZsSzKjKoYw4c+mVHxD+F5kFO93jPPzmkEkSKicdVMgchEY4M9J
v8khwErUvyCCso2VQfYtImbcKjvCZet4m688SnoVTQwdIglvQWsKUMeraqDv4Vyi
FDT0GgUPBny8DO5QrxlUjbjy7AeZn9VeuelKrzVRHwIDAQABo28wbTAdBgNVHQ4E
FgQUBqHCiP54ZRWvDOanxmdG9ZORLCYwHwYDVR0jBBgwFoAUBqHCiP54ZRWvDOan
xmdG9ZORLCYwDwYDVR0TAQH/BAUwAwEB/zAaBgNVHREEEzARgglsb2NhbGhvc3SH
BH8AAAEwDQYJKoZIhvcNAQELBQADggEBAIdjGd8iL83z+6tv0cglBBXwJb8LZQT0
u++ArvAgjxEiCjojfKYyRkfKPPAxaidKZ2MLZMGnrxEg2vCBeTvmpR57HE8VL67N
Jijusc0dD3dRCqQHY7IgyxJELN4scSAzAes/LJiP3GgSvqt+RN/ltkJkXMCdeOoV
61S8jUD36NeqOPLkbCUwr2gqRfnzt27BH+9LCUufg2VlV1fBkIImqn37h80/HZtc
q7VFWuoYwwxog/mqnr9LtIzrfEzrB4V5lf4ZF9ZWtjSC0z++y2RFX2WFnFRLT1Xh
JpvCX2cYs9gOGe/Ite2Qt35tJNZYDm4UJlCb2EJHQJsDnB4rqvNFRb0=
-----END CERTIFICATE-----`;

function listen(server: http.Server | https.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve((server.address() as AddressInfo).port);
    });
  });
}

function close(server: http.Server | https.Server): Promise<void> {
  return new Promise((resolve) => {
    const fallback = setTimeout(resolve, 100);
    server.close(() => {
      clearTimeout(fallback);
      resolve();
    });
    server.closeAllConnections?.();
    server.closeIdleConnections?.();
  });
}

describe('remote proxy chain regression', () => {
  it('lets the local Codex reasoning proxy connect directly to self-signed HTTPS upstreams', async () => {
    let forwardedPath = '';
    let forwardedModel: unknown;
    const upstream = https.createServer(
      { key: SELF_SIGNED_KEY, cert: SELF_SIGNED_CERT },
      (req, res) => {
        forwardedPath = req.url || '';
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          forwardedModel = parsed.model;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }));
        });
      }
    );
    const upstreamPort = await listen(upstream);
    const proxy = new CodexReasoningProxy({
      upstreamBaseUrl: `https://localhost:${upstreamPort}`,
      allowSelfSigned: true,
      stripPathPrefix: '/api/provider/codex',
      defaultEffort: 'medium',
      modelMap: {
        defaultModel: 'gpt-5.4',
      },
    });

    try {
      const proxyPort = await proxy.start();
      const response = await fetch(`http://127.0.0.1:${proxyPort}/api/provider/codex/v1/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-5.4', messages: [] }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ content: [{ type: 'text', text: 'ok' }] });
      expect(forwardedPath).toBe('/v1/messages');
      expect(forwardedModel).toBe('gpt-5.4(xhigh)');
    } finally {
      proxy.stop();
      await close(upstream);
    }
  });

  it('routes Codex through tool sanitization to a self-signed remote HTTPS proxy', async () => {
    let forwardedPath = '';
    let forwardedModel: unknown;
    let forwardedTools: unknown;
    const upstream = https.createServer(
      { key: SELF_SIGNED_KEY, cert: SELF_SIGNED_CERT },
      (req, res) => {
        forwardedPath = req.url || '';
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          forwardedModel = parsed.model;
          forwardedTools = parsed.tools;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }));
        });
      }
    );
    const upstreamPort = await listen(upstream);
    const toolProxy = new ToolSanitizationProxy({
      upstreamBaseUrl: `https://localhost:${upstreamPort}`,
      allowSelfSigned: true,
      warnOnSanitize: false,
    });
    let codexProxy: CodexReasoningProxy | null = null;

    try {
      const toolPort = await toolProxy.start();
      codexProxy = new CodexReasoningProxy({
        upstreamBaseUrl: `http://127.0.0.1:${toolPort}`,
        stripPathPrefix: '/api/provider/codex',
        defaultEffort: 'medium',
        modelMap: {
          defaultModel: 'gpt-5.4',
        },
      });
      const codexPort = await codexProxy.start();
      const response = await fetch(`http://127.0.0.1:${codexPort}/api/provider/codex/v1/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-5.4',
          messages: [],
          tools: [{ name: 'read', input_schema: {}, cache_control: { type: 'ephemeral' } }],
        }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ content: [{ type: 'text', text: 'ok' }] });
      expect(forwardedPath).toBe('/v1/messages');
      expect(forwardedModel).toBe('gpt-5.4(xhigh)');
      // The root-routed hop still recognizes the suffixed model as Codex.
      expect(forwardedTools).toEqual([{ name: 'read', input_schema: {} }]);
    } finally {
      codexProxy?.stop();
      toolProxy.stop();
      await close(upstream);
    }
  });
});
