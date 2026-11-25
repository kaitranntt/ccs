import { describe, expect, it } from 'bun:test';
import { appendThirdPartyWebSearchToolArgs } from '../../../../src/utils/websearch/claude-tool-args';

const STEERING_PROMPT =
  'For web lookup or current-information requests, prefer the CCS MCP tool WebSearch instead of Bash/curl/http fetches. If the user explicitly wants shell commands, or WebSearch is unavailable or fails, you may fall back to Bash/network tools.';

function appendEnabledWebSearchArgs(args: string[]): string[] {
  return appendThirdPartyWebSearchToolArgs(args, true);
}

describe('appendThirdPartyWebSearchToolArgs', () => {
  it('appends native WebSearch suppression and inline steering prompt when no prompt flags are present', () => {
    expect(appendEnabledWebSearchArgs(['smoke'])).toEqual([
      'smoke',
      '--disallowedTools',
      'WebSearch',
      '--append-system-prompt',
      STEERING_PROMPT,
    ]);
  });

  it('leaves args untouched for profiles that keep native WebSearch', () => {
    expect(appendThirdPartyWebSearchToolArgs(['smoke'], true, true)).toEqual(['smoke']);
    expect(appendThirdPartyWebSearchToolArgs(['smoke'], false, true)).toEqual(['smoke']);
  });

  it('does not append duplicate suppression or steering prompt when both are already present', () => {
    expect(
      appendEnabledWebSearchArgs([
        'smoke',
        '--disallowedTools',
        'WebSearch',
        '--append-system-prompt',
        STEERING_PROMPT,
      ])
    ).toEqual([
      'smoke',
      '--disallowedTools',
      'WebSearch',
      '--append-system-prompt',
      STEERING_PROMPT,
    ]);
  });

  it('detects comma-separated disallowed tool values', () => {
    expect(appendEnabledWebSearchArgs(['smoke', '--disallowedTools=Read,WebSearch'])).toEqual([
      'smoke',
      '--disallowedTools=Read,WebSearch',
      '--append-system-prompt',
      STEERING_PROMPT,
    ]);
  });

  it('merges WebSearch into an existing space-separated disallowed tool flag', () => {
    expect(appendEnabledWebSearchArgs(['smoke', '--disallowedTools', 'Read'])).toEqual([
      'smoke',
      '--disallowedTools',
      'Read,WebSearch',
      '--append-system-prompt',
      STEERING_PROMPT,
    ]);
  });

  it('merges WebSearch into an existing equals-form disallowed tool flag', () => {
    expect(appendEnabledWebSearchArgs(['smoke', '--disallowedTools=Read'])).toEqual([
      'smoke',
      '--disallowedTools=Read,WebSearch',
      '--append-system-prompt',
      STEERING_PROMPT,
    ]);
  });

  it('preserves user-supplied append-system-prompt values and adds the CCS steering hint once', () => {
    expect(
      appendEnabledWebSearchArgs(['smoke', '--append-system-prompt', 'User-provided instruction'])
    ).toEqual([
      'smoke',
      '--append-system-prompt',
      'User-provided instruction',
      '--disallowedTools',
      'WebSearch',
      '--append-system-prompt',
      STEERING_PROMPT,
    ]);
  });

  it('does not duplicate the steering prompt when it already exists in equals form', () => {
    expect(
      appendEnabledWebSearchArgs([
        'smoke',
        '--disallowedTools',
        'WebSearch',
        `--append-system-prompt=${STEERING_PROMPT}`,
      ])
    ).toEqual([
      'smoke',
      '--disallowedTools',
      'WebSearch',
      `--append-system-prompt=${STEERING_PROMPT}`,
    ]);
  });

  it('does not consume positional args after a disallowed-tools flag value', () => {
    expect(appendEnabledWebSearchArgs(['--disallowedTools', 'Read', 'latest AI news'])).toEqual([
      '--disallowedTools',
      'Read,WebSearch',
      'latest AI news',
      '--append-system-prompt',
      STEERING_PROMPT,
    ]);
  });

  it('injects synthetic flags before an end-of-options marker', () => {
    expect(appendEnabledWebSearchArgs(['--', 'latest AI news'])).toEqual([
      '--disallowedTools',
      'WebSearch',
      '--append-system-prompt',
      STEERING_PROMPT,
      '--',
      'latest AI news',
    ]);
  });

  it('inserts the WebSearch disallow value when the flag is present without one', () => {
    expect(appendEnabledWebSearchArgs(['--disallowedTools', '--verbose'])).toEqual([
      '--disallowedTools',
      'WebSearch',
      '--verbose',
      '--append-system-prompt',
      STEERING_PROMPT,
    ]);
  });

  // File mode: --append-system-prompt-file when user passes --append-system-prompt-file

  it('uses --append-system-prompt-file when user passes --append-system-prompt-file', () => {
    const result = appendEnabledWebSearchArgs([
      'smoke',
      '--append-system-prompt-file',
      '/tmp/user-prompt.txt',
    ]);
    expect(result).toContain('--disallowedTools');
    expect(result).toContain('WebSearch');
    const fileFlags = result.filter((arg) => arg === '--append-system-prompt-file');
    expect(fileFlags.length).toBeGreaterThanOrEqual(2);
    // No inline flag should be present
    expect(result).not.toContain('--append-system-prompt');
  });

  it('uses --append-system-prompt-file when user passes --append-system-prompt-file= form', () => {
    const result = appendEnabledWebSearchArgs([
      'smoke',
      '--append-system-prompt-file=/tmp/user-prompt.txt',
    ]);
    const fileFlags = result.filter(
      (arg) =>
        arg === '--append-system-prompt-file' || arg.startsWith('--append-system-prompt-file=')
    );
    expect(fileFlags.length).toBeGreaterThanOrEqual(2);
    expect(result).not.toContain('--append-system-prompt');
  });

  it('does not treat unrelated user prompt files as the managed CCS steering prompt', () => {
    const result = appendEnabledWebSearchArgs([
      'smoke',
      '--append-system-prompt-file',
      '/tmp/user-ccs-prompt-websearch-tool-notes.txt',
    ]);

    const filePaths = result.filter(
      (arg, index) => result[index - 1] === '--append-system-prompt-file'
    );
    expect(filePaths).toContain('/tmp/user-ccs-prompt-websearch-tool-notes.txt');
    expect(filePaths.some((filePath) => filePath.endsWith('/ccs-prompt-websearch-tool.txt'))).toBe(
      true
    );
  });

  it('keeps native WebSearch disallowed but skips CCS steering when WebSearch is disabled', () => {
    expect(appendThirdPartyWebSearchToolArgs(['smoke'], false)).toEqual([
      'smoke',
      '--disallowedTools',
      'WebSearch',
    ]);
  });

  it('preserves user prompt args when WebSearch is disabled', () => {
    expect(
      appendThirdPartyWebSearchToolArgs(
        ['smoke', '--append-system-prompt', 'User-provided instruction'],
        false
      )
    ).toEqual([
      'smoke',
      '--append-system-prompt',
      'User-provided instruction',
      '--disallowedTools',
      'WebSearch',
    ]);
  });
});
