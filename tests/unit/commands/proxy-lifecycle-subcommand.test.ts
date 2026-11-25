import { describe, expect, it } from 'bun:test';
import { CLIPROXY_DEFAULT_PORT, resolveLifecyclePort } from '../../../src/cliproxy/config/port-manager';

describe('resolveLifecyclePort', () => {
  it('uses configured cliproxy_server.local.port', () => {
    expect(
      resolveLifecyclePort({
        cliproxy_server: {
          local: {
            port: 9456,
          },
        },
      } as never)
    ).toBe(9456);
  });

  it('falls back to default port when configured local port is invalid', () => {
    expect(
      resolveLifecyclePort({
        cliproxy_server: {
          local: {
            port: 70000,
          },
        },
      } as never)
    ).toBe(CLIPROXY_DEFAULT_PORT);
  });

  it('falls back to default port when config file is missing', () => {
    expect(resolveLifecyclePort({})).toBe(CLIPROXY_DEFAULT_PORT);
  });

  it('falls back to default port when loading unified config throws', () => {
    expect(
      resolveLifecyclePort(undefined, () => {
        throw new Error('malformed config');
      })
    ).toBe(CLIPROXY_DEFAULT_PORT);
  });
});
