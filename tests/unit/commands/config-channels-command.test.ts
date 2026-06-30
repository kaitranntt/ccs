import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import {
  handleConfigChannelsCommand,
  parseChannelsCommandArgs,
} from '../../../src/commands/config-channels-command';

const originalExitCode = process.exitCode;

afterEach(() => {
  process.exitCode = originalExitCode ?? 0;
});

describe('config channels command parser', () => {
  it('parses selection, unattended mode, and token channel input', () => {
    const result = parseChannelsCommandArgs([
      '--set',
      'telegram,discord',
      '--unattended',
      '--set-token',
      'telegram',
    ]);

    expect(result.setSelection).toBe('telegram,discord');
    expect(result.unattended).toBe(true);
    expect(result.setTokenChannel).toBe('telegram');
  });

  it('supports legacy flags and clear-token variants', () => {
    const result = parseChannelsCommandArgs([
      '--disable',
      '--no-unattended',
      '--set-token=discord',
    ]);
    const clearAll = parseChannelsCommandArgs(['--clear-token']);
    const clearOne = parseChannelsCommandArgs(['--clear-token', 'discord']);

    expect(result.disable).toBe(true);
    expect(result.noUnattended).toBe(true);
    expect(result.setTokenChannel).toBe('discord');
    expect(clearAll.clearTokenAll).toBe(true);
    expect(clearOne.clearTokenChannel).toBe('discord');
  });

  it('marks invalid set-token values without retaining secret-like input', () => {
    const secretValue = 'telegram=SECRET_BOT_TOKEN_12345';
    const result = parseChannelsCommandArgs(['--set-token', secretValue]);

    expect(result.setTokenInvalid).toBe(true);
    expect(JSON.stringify(result)).not.toContain(secretValue);
    expect(JSON.stringify(result)).not.toContain('SECRET_BOT_TOKEN_12345');
  });
});

describe('config channels command handler', () => {
  it('does not echo invalid set-token values to stderr', async () => {
    const secretValue = 'telegram=SECRET_BOT_TOKEN_12345';
    const errors: string[] = [];
    const errorSpy = spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });

    try {
      await handleConfigChannelsCommand(['--set-token', secretValue]);
    } finally {
      errorSpy.mockRestore();
    }

    expect(process.exitCode).toBe(1);
    expect(errors.join('\n')).toContain('Invalid --set-token value');
    expect(errors.join('\n')).not.toContain(secretValue);
    expect(errors.join('\n')).not.toContain('SECRET_BOT_TOKEN_12345');
  });
});
