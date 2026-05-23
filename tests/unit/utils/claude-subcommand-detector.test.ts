import { describe, expect, it } from 'bun:test';
import {
  isClaudeSubcommandInvocation,
  stripClaudeCodeFeatureBlockingEnv,
  stripClaudeSubcommandSessionArgs,
} from '../../../src/utils/claude-subcommand-detector';
import { appendThirdPartyWebSearchToolArgs } from '../../../src/utils/websearch/claude-tool-args';
import { appendThirdPartyImageAnalysisToolArgs } from '../../../src/utils/image-analysis/claude-tool-args';
import { appendBrowserToolArgs } from '../../../src/utils/browser/claude-tool-args';

describe('isClaudeSubcommandInvocation', () => {
  it('returns false for an empty arg list', () => {
    expect(isClaudeSubcommandInvocation([])).toBe(false);
  });

  it('returns false for a prompt-only invocation', () => {
    expect(isClaudeSubcommandInvocation(['fix the failing test'])).toBe(false);
  });

  it('detects bare subcommand', () => {
    for (const cmd of [
      'agents',
      'auth',
      'doctor',
      'mcp',
      'plugin',
      'plugins',
      'project',
      'remote-control',
      'setup-token',
      'ultrareview',
      'update',
      'upgrade',
      'auto-mode',
      'install',
    ]) {
      expect(isClaudeSubcommandInvocation([cmd])).toBe(true);
    }
  });

  it('skips past value-taking flags before the positional', () => {
    expect(isClaudeSubcommandInvocation(['--model', 'sonnet', 'agents'])).toBe(true);
    expect(isClaudeSubcommandInvocation(['--settings', '/tmp/s.json', 'doctor'])).toBe(true);
    expect(
      isClaudeSubcommandInvocation([
        '--dangerously-skip-permissions',
        '--teammate-mode',
        'in-process',
        'agents',
      ])
    ).toBe(true);
  });

  it('does not treat a flag value matching a subcommand name as a subcommand', () => {
    // `--name auth` sets the session display name to "auth" — still an interactive launch.
    expect(isClaudeSubcommandInvocation(['--name', 'auth'])).toBe(false);
  });


  it('treats --print prompt mode as non-subcommand even with subcommand-like prompt text', () => {
    expect(isClaudeSubcommandInvocation(['--print', 'agents'])).toBe(false);
    expect(isClaudeSubcommandInvocation(['--print', 'doctor'])).toBe(false);
  });

  it('handles --flag=value forms', () => {
    expect(isClaudeSubcommandInvocation(['--model=sonnet', 'agents'])).toBe(true);
  });

  it('stops scanning at the -- terminator', () => {
    expect(isClaudeSubcommandInvocation(['--', 'agents'])).toBe(false);
  });

  it('ignores subcommand-named tokens that come AFTER the first positional prompt', () => {
    // First positional is the prompt; "agents" later is just a word in the prompt context.
    expect(isClaudeSubcommandInvocation(['talk to me about', 'agents'])).toBe(false);
  });
});

describe('stripClaudeCodeFeatureBlockingEnv', () => {
  it('removes telemetry disable env that blocks Claude Code background features', () => {
    const env = stripClaudeCodeFeatureBlockingEnv({
      DISABLE_TELEMETRY: '1',
      DISABLE_BUG_COMMAND: '1',
      DISABLE_ERROR_REPORTING: '1',
      ANTHROPIC_MODEL: 'gpt-5.5',
    });

    expect(env.DISABLE_TELEMETRY).toBeUndefined();
    expect(env.DISABLE_BUG_COMMAND).toBe('1');
    expect(env.DISABLE_ERROR_REPORTING).toBe('1');
    expect(env.ANTHROPIC_MODEL).toBe('gpt-5.5');
  });
});

describe('stripClaudeSubcommandSessionArgs', () => {
  it('removes session-only flags before a non-agents Claude subcommand', () => {
    expect(
      stripClaudeSubcommandSessionArgs([
        '--dangerously-skip-permissions',
        '--teammate-mode',
        'in-process',
        'doctor',
      ])
    ).toEqual(['doctor']);
  });

  it('removes session-only flags after a non-agents subcommand while preserving subcommand flags', () => {
    expect(
      stripClaudeSubcommandSessionArgs([
        'mcp',
        '--dangerously-skip-permissions',
        '--teammate-mode',
        'in-process',
        '--setting-sources',
        'user',
      ])
    ).toEqual(['mcp', '--setting-sources', 'user']);
  });

  it('removes --permission-mode for non-agents subcommands', () => {
    expect(
      stripClaudeSubcommandSessionArgs(['--permission-mode', 'bypassPermissions', 'doctor'])
    ).toEqual(['doctor']);
    expect(stripClaudeSubcommandSessionArgs(['doctor', '--permission-mode=acceptEdits'])).toEqual([
      'doctor',
    ]);
    expect(
      stripClaudeSubcommandSessionArgs(['remote-control', '--permission-mode', 'bypassPermissions'])
    ).toEqual(['remote-control']);
  });

  it('preserves --permission-mode for the agents subcommand (after)', () => {
    // `claude agents` accepts `--permission-mode <mode>` as the default
    // permission mode for dispatched sessions; CCS must not strip it.
    expect(
      stripClaudeSubcommandSessionArgs([
        'agents',
        '--permission-mode',
        'bypassPermissions',
        '--teammate-mode',
        'in-process',
      ])
    ).toEqual(['agents', '--permission-mode', 'bypassPermissions']);
  });

  it('preserves --permission-mode for the agents subcommand (before, separate value form)', () => {
    expect(
      stripClaudeSubcommandSessionArgs(['--permission-mode', 'bypassPermissions', 'agents'])
    ).toEqual(['--permission-mode', 'bypassPermissions', 'agents']);
  });

  it('preserves --permission-mode for the agents subcommand (before, --flag=value form)', () => {
    expect(
      stripClaudeSubcommandSessionArgs(['--permission-mode=bypassPermissions', 'agents'])
    ).toEqual(['--permission-mode=bypassPermissions', 'agents']);
  });

  it('preserves --dangerously-skip-permissions and --allow-dangerously-skip-permissions for agents', () => {
    expect(
      stripClaudeSubcommandSessionArgs([
        '--dangerously-skip-permissions',
        '--allow-dangerously-skip-permissions',
        'agents',
      ])
    ).toEqual(['--dangerously-skip-permissions', '--allow-dangerously-skip-permissions', 'agents']);
  });

  it('still strips --teammate-mode for the agents subcommand (not accepted by upstream)', () => {
    expect(
      stripClaudeSubcommandSessionArgs([
        'agents',
        '--teammate-mode',
        'in-process',
        '--permission-mode',
        'bypassPermissions',
      ])
    ).toEqual(['agents', '--permission-mode', 'bypassPermissions']);
  });

  it('leaves non-subcommand interactive launches unchanged', () => {
    expect(
      stripClaudeSubcommandSessionArgs([
        '--dangerously-skip-permissions',
        '--teammate-mode',
        'in-process',
        'fix the bug',
      ])
    ).toEqual(['--dangerously-skip-permissions', '--teammate-mode', 'in-process', 'fix the bug']);
  });
});

describe('subcommand passthrough — injectors short-circuit', () => {
  it('appendThirdPartyWebSearchToolArgs returns args unchanged for subcommand invocations', () => {
    expect(appendThirdPartyWebSearchToolArgs(['agents'])).toEqual(['agents']);
    expect(appendThirdPartyWebSearchToolArgs(['doctor'])).toEqual(['doctor']);
    expect(appendThirdPartyWebSearchToolArgs(['mcp', 'list'])).toEqual(['mcp', 'list']);
    expect(appendThirdPartyWebSearchToolArgs(['remote-control'])).toEqual(['remote-control']);
  });

  it('appendThirdPartyImageAnalysisToolArgs returns args unchanged for subcommand invocations', () => {
    expect(appendThirdPartyImageAnalysisToolArgs(['agents'])).toEqual(['agents']);
    expect(appendThirdPartyImageAnalysisToolArgs(['remote-control'])).toEqual(['remote-control']);
  });

  it('appendBrowserToolArgs returns args unchanged for subcommand invocations', () => {
    expect(appendBrowserToolArgs(['agents'])).toEqual(['agents']);
    expect(appendBrowserToolArgs(['remote-control'])).toEqual(['remote-control']);
  });


  it('injectors still inject in --print prompt mode with subcommand-like prompt text', () => {
    const out = appendThirdPartyWebSearchToolArgs(['--print', 'agents']);
    expect(out).toContain('--append-system-prompt');
    expect(out).toContain('--disallowedTools');
  });

  it('injectors still inject for non-subcommand interactive launches', () => {
    const out = appendThirdPartyWebSearchToolArgs(['fix the bug']);
    expect(out).toContain('--append-system-prompt');
    expect(out).toContain('--disallowedTools');
  });
});
