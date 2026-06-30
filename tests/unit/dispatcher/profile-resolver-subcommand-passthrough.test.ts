import { describe, expect, it } from 'bun:test';
import { isBareClaudeSubcommandPassthrough } from '../../../src/dispatcher/profile-resolver';

/**
 * Bare Claude subcommand passthrough decision (`ccs agents`, `ccs mcp`, ...).
 *
 * The predicate is consulted only on the profile-not-found path, so a real
 * configured profile of the same name is resolved earlier and never reaches
 * this gate. These tests pin the decision matrix: forward documented Claude
 * subcommands on the claude target, leave everything else alone.
 */
describe('isBareClaudeSubcommandPassthrough', () => {
  it('reroutes a bare Claude subcommand on the default (claude) target', () => {
    expect(isBareClaudeSubcommandPassthrough('agents', ['agents'])).toBe(true);
    expect(isBareClaudeSubcommandPassthrough('mcp', ['mcp'])).toBe(true);
    expect(isBareClaudeSubcommandPassthrough('plugin', ['plugin'])).toBe(true);
    expect(isBareClaudeSubcommandPassthrough('setup-token', ['setup-token'])).toBe(true);
  });

  it('reroutes when the subcommand carries its own flags', () => {
    expect(
      isBareClaudeSubcommandPassthrough('agents', [
        'agents',
        '--permission-mode',
        'bypassPermissions',
      ])
    ).toBe(true);
  });

  it('does not reroute the implicit default profile', () => {
    expect(isBareClaudeSubcommandPassthrough('default', [])).toBe(false);
  });

  it('does not reroute an unknown non-subcommand token', () => {
    expect(isBareClaudeSubcommandPassthrough('notaprofile', ['notaprofile'])).toBe(false);
    expect(isBareClaudeSubcommandPassthrough('glm', ['glm'])).toBe(false);
  });

  it('does not reroute when an explicit non-claude target is selected', () => {
    expect(isBareClaudeSubcommandPassthrough('agents', ['agents', '--target', 'droid'])).toBe(
      false
    );
    expect(isBareClaudeSubcommandPassthrough('mcp', ['mcp', '--target', 'codex'])).toBe(false);
  });

  it('does not reroute through a default profile configured for a non-claude target', () => {
    expect(
      isBareClaudeSubcommandPassthrough('setup-token', ['setup-token', 'sk-secret'], {
        target: 'droid',
      })
    ).toBe(false);
    expect(isBareClaudeSubcommandPassthrough('agents', ['agents'], { target: 'codex' })).toBe(
      false
    );
  });

  it('allows explicit claude target selection to override a non-claude default profile target', () => {
    expect(
      isBareClaudeSubcommandPassthrough(
        'setup-token',
        ['setup-token', 'sk-secret', '--target', 'claude'],
        { target: 'droid' }
      )
    ).toBe(true);
  });
});
