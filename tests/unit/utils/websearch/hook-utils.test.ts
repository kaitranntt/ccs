import { expect, test, describe } from 'bun:test';
import { isCcsWebSearchHook, deduplicateCcsHooks } from '../../../../src/utils/websearch/hook-utils';

describe('isCcsWebSearchHook', () => {
  test('Returns true for CCS hook with forward slashes (Unix path)', () => {
    const hook = {
      matcher: 'WebSearch',
      hooks: [
        {
          command: 'node /home/user/.ccs/hooks/websearch-transformer/index.js',
        },
      ],
    };
    expect(isCcsWebSearchHook(hook)).toBe(true);
  });

  test('Returns true for CCS hook with backslashes (Windows path)', () => {
    const hook = {
      matcher: 'WebSearch',
      hooks: [
        {
          command: 'node C:\\Users\\user\\.ccs\\hooks\\websearch-transformer\\index.js',
        },
      ],
    };
    expect(isCcsWebSearchHook(hook)).toBe(true);
  });

  test('Returns true for mixed path separators', () => {
    const hook = {
      matcher: 'WebSearch',
      hooks: [
        {
          command: 'node /home/user\\.ccs/hooks\\websearch-transformer/index.js',
        },
      ],
    };
    expect(isCcsWebSearchHook(hook)).toBe(true);
  });

  test('Returns false for non-WebSearch matcher', () => {
    const hook = {
      matcher: 'SomethingElse',
      hooks: [
        {
          command: 'node /home/user/.ccs/hooks/websearch-transformer/index.js',
        },
      ],
    };
    expect(isCcsWebSearchHook(hook)).toBe(false);
  });

  test('Returns false for WebSearch with non-CCS hook command', () => {
    const hook = {
      matcher: 'WebSearch',
      hooks: [
        {
          command: 'node /some/other/path/custom-hook.js',
        },
      ],
    };
    expect(isCcsWebSearchHook(hook)).toBe(false);
  });

  test('Returns false when hooks array is missing', () => {
    const hook = {
      matcher: 'WebSearch',
    };
    expect(isCcsWebSearchHook(hook)).toBe(false);
  });

  test('Returns false when hooks array is empty', () => {
    const hook = {
      matcher: 'WebSearch',
      hooks: [],
    };
    expect(isCcsWebSearchHook(hook)).toBe(false);
  });

  test('Returns false when command is missing', () => {
    const hook = {
      matcher: 'WebSearch',
      hooks: [{}],
    };
    expect(isCcsWebSearchHook(hook)).toBe(false);
  });

  test('Returns false when command is not a string', () => {
    const hook = {
      matcher: 'WebSearch',
      hooks: [
        {
          command: 123,
        },
      ],
    };
    expect(isCcsWebSearchHook(hook)).toBe(false);
  });
});

describe('deduplicateCcsHooks', () => {
  test('No-op when 0 CCS hooks (returns false)', () => {
    const settings = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'SomeOtherMatcher',
            hooks: [{ command: 'other-command' }],
          },
        ],
      },
    };
    const result = deduplicateCcsHooks(settings);
    expect(result).toBe(false);
    expect(settings.hooks.PreToolUse).toHaveLength(1);
  });

  test('No-op when 1 CCS hook (returns false)', () => {
    const settings = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'WebSearch',
            hooks: [
              {
                command: 'node /home/user/.ccs/hooks/websearch-transformer/index.js',
              },
            ],
          },
        ],
      },
    };
    const result = deduplicateCcsHooks(settings);
    expect(result).toBe(false);
    expect(settings.hooks.PreToolUse).toHaveLength(1);
  });

  test('Removes duplicates when 2+ CCS hooks (returns true, keeps first)', () => {
    const settings = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'WebSearch',
            hooks: [
              {
                command: 'node /home/user/.ccs/hooks/websearch-transformer/index.js',
              },
            ],
          },
          {
            matcher: 'WebSearch',
            hooks: [
              {
                command: 'node C:\\Users\\user\\.ccs\\hooks\\websearch-transformer\\index.js',
              },
            ],
          },
          {
            matcher: 'WebSearch',
            hooks: [
              {
                command: 'node /another/path/.ccs/hooks/websearch-transformer/index.js',
              },
            ],
          },
        ],
      },
    };
    const result = deduplicateCcsHooks(settings);
    expect(result).toBe(true);
    expect(settings.hooks.PreToolUse).toHaveLength(1);
    expect(settings.hooks.PreToolUse[0]).toEqual({
      matcher: 'WebSearch',
      hooks: [
        {
          command: 'node /home/user/.ccs/hooks/websearch-transformer/index.js',
        },
      ],
    });
  });

  test('Preserves non-CCS hooks in array', () => {
    const nonCcsHook = {
      matcher: 'SomeOtherMatcher',
      hooks: [{ command: 'other-command' }],
    };
    const settings = {
      hooks: {
        PreToolUse: [
          nonCcsHook,
          {
            matcher: 'WebSearch',
            hooks: [
              {
                command: 'node /home/user/.ccs/hooks/websearch-transformer/index.js',
              },
            ],
          },
          {
            matcher: 'WebSearch',
            hooks: [
              {
                command: 'node C:\\Users\\user\\.ccs\\hooks\\websearch-transformer\\index.js',
              },
            ],
          },
        ],
      },
    };
    const result = deduplicateCcsHooks(settings);
    expect(result).toBe(true);
    expect(settings.hooks.PreToolUse).toHaveLength(2);
    expect(settings.hooks.PreToolUse[0]).toEqual(nonCcsHook);
  });

  test('Returns false when hooks is undefined', () => {
    const settings = {};
    const result = deduplicateCcsHooks(settings);
    expect(result).toBe(false);
  });

  test('Returns false when PreToolUse is undefined', () => {
    const settings = {
      hooks: {},
    };
    const result = deduplicateCcsHooks(settings);
    expect(result).toBe(false);
  });

  test('Handles multiple non-CCS hooks with duplicates', () => {
    const settings = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'OtherMatcher1',
            hooks: [{ command: 'command1' }],
          },
          {
            matcher: 'WebSearch',
            hooks: [
              {
                command: 'node /path1/.ccs/hooks/websearch-transformer/index.js',
              },
            ],
          },
          {
            matcher: 'OtherMatcher2',
            hooks: [{ command: 'command2' }],
          },
          {
            matcher: 'WebSearch',
            hooks: [
              {
                command: 'node /path2/.ccs/hooks/websearch-transformer/index.js',
              },
            ],
          },
        ],
      },
    };
    const result = deduplicateCcsHooks(settings);
    expect(result).toBe(true);
    expect(settings.hooks.PreToolUse).toHaveLength(3);
    // First and third should be non-CCS hooks, second should be the first CCS hook
    expect(settings.hooks.PreToolUse[0].matcher).toBe('OtherMatcher1');
    expect(settings.hooks.PreToolUse[1].matcher).toBe('WebSearch');
    expect(settings.hooks.PreToolUse[2].matcher).toBe('OtherMatcher2');
  });

  test('Edge case: Empty PreToolUse array', () => {
    const settings = {
      hooks: {
        PreToolUse: [],
      },
    };
    const result = deduplicateCcsHooks(settings);
    expect(result).toBe(false);
    expect(settings.hooks.PreToolUse).toHaveLength(0);
  });
});
