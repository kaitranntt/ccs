import { describe, expect, it } from 'bun:test';
import {
  parseDockerLogsOptions,
  parseDockerTarget,
  parseDockerUpOptions,
} from '../../../src/commands/docker/options';

describe('docker options', () => {
  it('accepts a single SSH target for --host', () => {
    const parsed = parseDockerTarget(['--host', 'my-box'], ['--host']);

    expect(parsed.errors).toEqual([]);
    expect(parsed.host).toBe('my-box');
  });

  it('rejects whitespace-separated SSH command strings', () => {
    const parsed = parseDockerTarget(['--host', 'user@host -p 2222'], ['--host']);

    expect(parsed.errors).toEqual([
      'Invalid value for --host. Use a single SSH target or SSH config alias such as my-box or user@host.',
    ]);
  });

  it('rejects dash-prefixed host tokens', () => {
    const parsed = parseDockerTarget(['--host', '-p'], ['--host']);

    expect(parsed.errors).toEqual(['Missing value for --host']);
  });

  it('parses local up port overrides', () => {
    const parsed = parseDockerUpOptions(['--port', '4000', '--proxy-port', '9317'], [
      '--port',
      '--proxy-port',
    ]);

    expect(parsed.errors).toEqual([]);
    expect(parsed.port).toBe(4000);
    expect(parsed.proxyPort).toBe(9317);
  });

  it('rejects invalid numeric up port overrides', () => {
    const parsed = parseDockerUpOptions(['--port', '99999'], ['--port']);

    expect(parsed.errors).toEqual(['Invalid value for --port']);
  });

  it('rejects invalid log service filters', () => {
    const parsed = parseDockerLogsOptions(['--service', 'api'], ['--service']);

    expect(parsed.errors).toEqual(['Invalid value for --service. Use: ccs or cliproxy']);
  });
});
