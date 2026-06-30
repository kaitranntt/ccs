import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { triggerOAuth } from '../oauth-handler';

describe('triggerOAuth unsupported providers', () => {
  const previousDisableBanWarnings = process.env.CCS_DISABLE_BAN_WARNINGS;

  afterEach(() => {
    if (previousDisableBanWarnings === undefined) {
      delete process.env.CCS_DISABLE_BAN_WARNINGS;
    } else {
      process.env.CCS_DISABLE_BAN_WARNINGS = previousDisableBanWarnings;
    }
  });

  it('fails Qwen account linking before preparing CLIProxy auth args', async () => {
    process.env.CCS_DISABLE_BAN_WARNINGS = '1';
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});

    try {
      const account = await triggerOAuth('qwen');

      expect(account).toBeNull();
      expect(logSpy.mock.calls.some(([message]) => String(message).includes('--qwen-login'))).toBe(
        false
      );
      expect(
        logSpy.mock.calls.some(([message]) =>
          String(message).includes('Qwen account linking is not supported')
        )
      ).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });
});
