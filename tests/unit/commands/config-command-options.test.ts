import { describe, expect, it } from 'bun:test';

import { parseConfigCommandArgs } from '../../../src/commands/config-command-options';

describe('config command options parser', () => {
  it('defaults to a localhost-only bind without explicit host', () => {
    const result = parseConfigCommandArgs([]);

    expect(result.help).toBe(false);
    expect(result.error).toBeUndefined();
    expect(result.options.host).toBe('localhost');
    expect(result.options.hostProvided).toBe(false);
  });

  it('parses explicit host and port overrides', () => {
    const result = parseConfigCommandArgs(['--host', '0.0.0.0', '--port', '4100']);

    expect(result.error).toBeUndefined();
    expect(result.options.host).toBe('0.0.0.0');
    expect(result.options.hostProvided).toBe(true);
    expect(result.options.port).toBe(4100);
  });

  it('rejects missing host values', () => {
    const result = parseConfigCommandArgs(['--host']);

    expect(result.error).toBe('Invalid host value');
  });

  it('accepts port 65535 and rejects port 65536', () => {
    const accepted = parseConfigCommandArgs(['--port', '65535']);
    const rejected = parseConfigCommandArgs(['--port', '65536']);

    expect(accepted.error).toBeUndefined();
    expect(accepted.options.port).toBe(65535);
    expect(rejected.error).toBe('Invalid port number');
  });

  it('rejects unknown options', () => {
    const result = parseConfigCommandArgs(['--hst', '0.0.0.0']);

    expect(result.error).toBe('Unexpected arguments: --hst 0.0.0.0');
  });

  it('rejects unexpected trailing positionals', () => {
    const result = parseConfigCommandArgs(['--port', '3000', 'extra']);

    expect(result.error).toBe('Unexpected arguments: extra');
  });
});
