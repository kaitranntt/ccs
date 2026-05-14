import { describe, it, expect } from 'bun:test';
import {
  hasClaudeBackgroundWorkerUsingBaseUrlInProcessList,
  shouldKeepSessionProxiesAlive,
} from '../../../src/cliproxy/executor/session-bridge';

describe('session bridge background proxy keepalive', () => {
  it('keeps per-session proxies alive after a clean Claude exit when a bg worker inherited the base URL', () => {
    expect(
      shouldKeepSessionProxiesAlive({
        code: 0,
        signal: null,
        backgroundKeepAliveBaseUrl: 'http://127.0.0.1:64314/api/provider/codex',
        hasBackgroundWorkerUsingBaseUrl: () => true,
      })
    ).toBe(true);
  });

  it('cleans up per-session proxies when no bg worker inherited the base URL', () => {
    expect(
      shouldKeepSessionProxiesAlive({
        code: 0,
        signal: null,
        backgroundKeepAliveBaseUrl: 'http://127.0.0.1:64314/api/provider/codex',
        hasBackgroundWorkerUsingBaseUrl: () => false,
      })
    ).toBe(false);
  });

  it('cleans up per-session proxies for signaled Claude exits', () => {
    expect(
      shouldKeepSessionProxiesAlive({
        code: null,
        signal: 'SIGTERM',
        backgroundKeepAliveBaseUrl: 'http://127.0.0.1:64314/api/provider/codex',
        hasBackgroundWorkerUsingBaseUrl: () => true,
      })
    ).toBe(false);
  });

  it('detects Claude bg workers that inherited the exact base URL', () => {
    const baseUrl = 'http://127.0.0.1:64314/api/provider/codex';
    const processList = `
123 /opt/claude/claude.exe --bg-spare /tmp/claim.sock ANTHROPIC_BASE_URL=${baseUrl} ANTHROPIC_AUTH_TOKEN=ccs-internal-managed
456 /opt/claude/claude.exe --bg-spare /tmp/claim.sock ANTHROPIC_BASE_URL=http://127.0.0.1:62075/api/provider/codex
789 /opt/claude/claude.exe --print ANTHROPIC_BASE_URL=${baseUrl}
`;

    expect(hasClaudeBackgroundWorkerUsingBaseUrlInProcessList(processList, baseUrl)).toBe(true);
    expect(
      hasClaudeBackgroundWorkerUsingBaseUrlInProcessList(
        processList,
        'http://127.0.0.1:65535/api/provider/codex'
      )
    ).toBe(false);
  });
});
