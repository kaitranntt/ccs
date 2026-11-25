import { describe, expect, it, spyOn } from 'bun:test';
import * as os from 'os';

import {
  isLoopbackHost,
  isWildcardHost,
  normalizeDashboardHost,
  resolveDashboardUrls,
} from '../../../src/commands/config-dashboard-host';

describe('config dashboard host helpers', () => {
  it('detects loopback and wildcard hosts', () => {
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
    expect(isLoopbackHost('[::1]')).toBe(true);
    expect(isWildcardHost('0.0.0.0')).toBe(true);
    expect(isWildcardHost('::')).toBe(true);
    expect(isWildcardHost('[::]')).toBe(true);
  });

  it('returns localhost browser URL without network details when host is omitted', () => {
    const urls = resolveDashboardUrls(undefined, 3000, {});

    expect(urls.bindHost).toBeUndefined();
    expect(urls.browserUrl).toBe('http://localhost:3000');
    expect(urls.networkUrls).toBeUndefined();
  });

  it('returns localhost browser URL and all detected external URLs for wildcard host', () => {
    const urls = resolveDashboardUrls('0.0.0.0', 3000, {
      en0: [
        {
          address: '192.168.1.25',
          family: 'IPv4',
          internal: false,
        },
      ],
      utun5: [
        {
          address: '100.64.0.12',
          family: 'IPv4',
          internal: false,
        },
      ],
    });

    expect(urls.browserUrl).toBe('http://localhost:3000');
    expect(urls.networkUrls).toEqual(['http://192.168.1.25:3000', 'http://100.64.0.12:3000']);
  });

  it('returns explicit host URL for loopback bindings', () => {
    const urls = resolveDashboardUrls('127.0.0.1', 3000, {});

    expect(urls.bindHost).toBe('127.0.0.1');
    expect(urls.browserUrl).toBe('http://127.0.0.1:3000');
    expect(urls.networkUrls).toBeUndefined();
  });

  it('normalizes bracketed IPv6 host literals for binding and URL output', () => {
    const urls = resolveDashboardUrls('[::1]', 3000, {});

    expect(normalizeDashboardHost('[::1]')).toBe('::1');
    expect(urls.bindHost).toBe('::1');
    expect(urls.browserUrl).toBe('http://[::1]:3000');
  });

  it('falls back to localhost-only URLs when interface enumeration fails', () => {
    const networkInterfacesSpy = spyOn(os, 'networkInterfaces').mockImplementation(() => {
      throw new Error('uv_interface_addresses returned Unknown system error 13');
    });

    try {
      const urls = resolveDashboardUrls('::', 3000);

      expect(urls.bindHost).toBe('::');
      expect(urls.browserUrl).toBe('http://localhost:3000');
      expect(urls.networkUrls).toBeUndefined();
    } finally {
      networkInterfacesSpy.mockRestore();
    }
  });
});
