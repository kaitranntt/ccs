import { describe, expect, test } from 'bun:test';

import { showApiCommandHelp } from '../../../src/commands/api-command/help';
import { handleHelpCommand } from '../../../src/commands/help-command';

function stripAnsi(input: string): string {
  return input.replace(/\u001b\[[0-9;]*m/g, '');
}

describe('help command parity', () => {
  test('root help documents cliproxy provider filter under quota command', async () => {
    const lines: string[] = [];
    await handleHelpCommand((line) => lines.push(line));

    const rendered = stripAnsi(lines.join('\n'));
    expect(rendered.includes('ccs cliproxy status [provider]')).toBe(false);
    expect(rendered.includes('ccs cliproxy status')).toBe(true);
    expect(rendered.includes('ccs cliproxy quota --provider <name>')).toBe(true);
    expect(rendered.includes('ccs llamacpp')).toBe(true);
  });

  test('root help documents llama.cpp as a local API profile', async () => {
    const lines: string[] = [];
    await handleHelpCommand((line) => lines.push(line));

    const rendered = stripAnsi(lines.join('\n'));
    expect(rendered.includes('ccs llamacpp')).toBe(true);
    expect(rendered.includes('http://127.0.0.1:8080')).toBe(true);
  });

  test('root help no longer markets glmt as a supported profile', async () => {
    const lines: string[] = [];
    await handleHelpCommand((line) => lines.push(line));

    const rendered = stripAnsi(lines.join('\n'));
    expect(rendered.includes('ccs glmt')).toBe(false);
    expect(rendered.includes('ccs glm')).toBe(true);
  });

  test('root help documents Claude IDE extension setup surfaces', async () => {
    const lines: string[] = [];
    await handleHelpCommand((line) => lines.push(line));

    const rendered = stripAnsi(lines.join('\n'));
    expect(rendered.includes('Claude IDE Extension setup page')).toBe(true);
    expect(rendered.includes('ccs env <profile> --format claude-extension --ide vscode')).toBe(
      true
    );
    expect(rendered.includes('ccs env <profile> --format claude-extension --ide windsurf')).toBe(
      true
    );
  });

  test('root help documents dashboard host binding example', async () => {
    const lines: string[] = [];
    await handleHelpCommand((line) => lines.push(line));

    const rendered = stripAnsi(lines.join('\n'));
    expect(rendered.includes('ccs config --host 0.0.0.0')).toBe(true);
    expect(rendered.includes('Force all-interface binding for remote devices')).toBe(true);
  });

  test('root help documents docker deployment commands', async () => {
    const lines: string[] = [];
    await handleHelpCommand((line) => lines.push(line));

    const rendered = stripAnsi(lines.join('\n'));
    expect(rendered.includes('ccs docker --help')).toBe(true);
    expect(rendered.includes('ccs docker up --host <ssh>')).toBe(true);
    expect(rendered.includes('ccs docker update')).toBe(true);
  });

  test('root help documents official channels native-only scope and process-env tokens', async () => {
    const lines: string[] = [];
    await handleHelpCommand((line) => lines.push(line));

    const rendered = stripAnsi(lines.join('\n'));
    expect(rendered.includes('Dashboard -> Settings -> Channels (fastest path)')).toBe(true);
    expect(
      rendered.includes(
        'Fastest path: turn on the channel, save the token if needed, then run ccs.'
      )
    ).toBe(true);
    expect(rendered.includes('ccs codex')).toBe(true);
    expect(rendered.includes('ccs --target codex')).toBe(true);
    expect(
      rendered.includes('Current-process TELEGRAM_BOT_TOKEN / DISCORD_BOT_TOKEN also work')
    ).toBe(true);
  });

  test('root help documents bare cursor as the runtime entrypoint', async () => {
    const lines: string[] = [];
    await handleHelpCommand((line) => lines.push(line));

    const rendered = stripAnsi(lines.join('\n'));
    expect(rendered.includes('ccs cursor <cmd>')).toBe(false);
    expect(rendered.includes('Run Claude via Cursor local proxy')).toBe(true);
  });

  test('root help explains Claude [1m] as an explicit CCS suffix with upstream limits', async () => {
    const lines: string[] = [];
    await handleHelpCommand((line) => lines.push(line));

    const rendered = stripAnsi(lines.join('\n'));
    expect(
      rendered.includes('Claude models: plain by default, opt-in with --1m or saved [1m]')
    ).toBe(true);
    expect(rendered.includes('CCS only controls the saved [1m] suffix.')).toBe(true);
    expect(rendered.includes('return 429 extra-usage errors for long-context requests')).toBe(true);
  });

  test('root help documents native Codex runtime alias and runtime-only scope', async () => {
    const lines: string[] = [];
    await handleHelpCommand((line) => lines.push(line));

    const rendered = stripAnsi(lines.join('\n'));
    expect(rendered.includes('ccs-codex <profile> [args]')).toBe(true);
    expect(rendered.includes('ccsx <profile> [args]')).toBe(true);
    expect(rendered.includes('ccsxp [args]')).toBe(true);
    expect(rendered.includes('ccs --target codex')).toBe(true);
    expect(rendered.includes('ccsxp "your prompt"')).toBe(true);
    expect(rendered.includes('ccs codex-api --target codex')).toBe(true);
    expect(rendered.includes('Compatible -> Codex CLI')).toBe(true);
    expect(rendered.includes('CLIPROXY_API_KEY')).toBe(true);
    expect(rendered.includes('codex (runtime-only)')).toBe(true);
  });

  test('api help documents create-time Claude [1m] flags and entitlement warning', async () => {
    const lines: string[] = [];
    await showApiCommandHelp((line) => lines.push(line));

    const rendered = stripAnsi(lines.join('\n'));
    expect(rendered.includes('--1m / --no-1m')).toBe(true);
    expect(rendered.includes('ccs api create --preset anthropic --1m')).toBe(true);
    expect(rendered.includes('Plain Claude model IDs stay on standard context by default.')).toBe(
      true
    );
    expect(rendered.includes('some accounts can still return 429 for long-context requests')).toBe(
      true
    );
  });

  test('api help documents Codex bridge runtime launch separately from persisted targets', async () => {
    const lines: string[] = [];
    await showApiCommandHelp((line) => lines.push(line));

    const rendered = stripAnsi(lines.join('\n'));
    expect(rendered.includes('ccs api create codex-api --cliproxy-provider codex')).toBe(true);
    expect(rendered.includes('ccs codex-api --target codex')).toBe(true);
    expect(rendered.includes('Default target: claude or droid (create)')).toBe(true);
  });
});
