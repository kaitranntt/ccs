/**
 * Tests for Interactive Prompt Utilities
 * Verifies prompt functions including selectFromList
 */

const assert = require('assert');

describe('InteractivePrompt', () => {
  const { InteractivePrompt } = require('../../../dist/utils/prompt');
  let originalArgv;
  let originalEnv;

  beforeEach(() => {
    originalArgv = [...process.argv];
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
  });

  describe('selectFromList', () => {
    describe('automation flags', () => {
      it('uses default when CCS_YES=1', async () => {
        process.env.CCS_YES = '1';

        const options = [
          { id: 'opt1', label: 'Option 1' },
          { id: 'opt2', label: 'Option 2' },
        ];

        try {
          const result = await InteractivePrompt.selectFromList('Select:', options, {
            defaultIndex: 0,
          });
          assert.strictEqual(result, 'opt1');
        } finally {
          delete process.env.CCS_YES;
        }
      });

      it('uses default when --yes flag present', async () => {
        process.argv = [...process.argv, '--yes'];

        const options = [
          { id: 'first', label: 'First' },
          { id: 'second', label: 'Second' },
        ];

        const result = await InteractivePrompt.selectFromList('Pick:', options, {
          defaultIndex: 1,
        });
        assert.strictEqual(result, 'second');
      });

      it('uses default when -y flag present', async () => {
        process.argv = [...process.argv, '-y'];

        const options = [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ];

        const result = await InteractivePrompt.selectFromList('Choose:', options);
        assert.strictEqual(result, 'a'); // default is 0
      });

      it('uses default when CCS_NO_INPUT=1', async () => {
        process.env.CCS_NO_INPUT = '1';

        const options = [
          { id: 'model1', label: 'Model 1' },
          { id: 'model2', label: 'Model 2' },
          { id: 'model3', label: 'Model 3' },
        ];

        try {
          const result = await InteractivePrompt.selectFromList('Select model:', options, {
            defaultIndex: 2,
          });
          assert.strictEqual(result, 'model3');
        } finally {
          delete process.env.CCS_NO_INPUT;
        }
      });

      it('uses default when --no-input flag present', async () => {
        process.argv = [...process.argv, '--no-input'];

        const options = [
          { id: 'x', label: 'X' },
          { id: 'y', label: 'Y' },
        ];

        const result = await InteractivePrompt.selectFromList('Pick:', options);
        assert.strictEqual(result, 'x');
      });
    });

    describe('options structure', () => {
      it('accepts options with id and label', async () => {
        process.env.CCS_YES = '1';

        const options = [
          { id: 'claude-opus-4-5-thinking', label: 'Claude Opus 4.5 Thinking' },
          { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
        ];

        try {
          const result = await InteractivePrompt.selectFromList('Select:', options);
          assert.strictEqual(result, 'claude-opus-4-5-thinking');
        } finally {
          delete process.env.CCS_YES;
        }
      });

      it('respects custom defaultIndex', async () => {
        process.env.CCS_YES = '1';

        const options = [
          { id: 'first', label: 'First' },
          { id: 'second', label: 'Second' },
          { id: 'third', label: 'Third' },
        ];

        try {
          const result = await InteractivePrompt.selectFromList('Select:', options, {
            defaultIndex: 2,
          });
          assert.strictEqual(result, 'third');
        } finally {
          delete process.env.CCS_YES;
        }
      });

      it('defaults to index 0 when no defaultIndex provided', async () => {
        process.env.CCS_YES = '1';

        const options = [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ];

        try {
          const result = await InteractivePrompt.selectFromList('Select:', options);
          assert.strictEqual(result, 'a');
        } finally {
          delete process.env.CCS_YES;
        }
      });
    });
  });

  describe('password - bracketed paste handling', () => {
    /**
     * Test helper: Simulates the escape sequence filtering logic from password()
     * This mirrors the implementation to verify bracketed paste sequences are stripped
     */
    function stripBracketedPaste(input) {
      let result = '';
      let escapeBuffer = '';

      for (const char of input) {
        const charCode = char.charCodeAt(0);

        // ESC character (start of escape sequence)
        if (charCode === 27) {
          escapeBuffer = '\x1b';
          continue;
        }

        // If we're in an escape sequence, buffer chars until we detect the pattern
        if (escapeBuffer) {
          escapeBuffer += char;

          // Check for bracketed paste sequences: ESC[200~ (start) or ESC[201~ (end)
          if (escapeBuffer === '\x1b[200~' || escapeBuffer === '\x1b[201~') {
            escapeBuffer = '';
            continue;
          }

          // If buffer is getting too long without match, it's not a paste sequence
          if (escapeBuffer.length > 6) {
            escapeBuffer = '';
          }
          continue;
        }

        // Regular printable character
        if (charCode >= 32) {
          result += char;
        }
      }

      return result;
    }

    it('strips ESC[200~ (start paste) sequence', () => {
      const input = '\x1b[200~sk-ant-api-key\x1b[201~';
      const result = stripBracketedPaste(input);
      assert.strictEqual(result, 'sk-ant-api-key');
    });

    it('handles API key pasted with bracketed paste mode', () => {
      const pastedKey = '\x1b[200~sk-ant-api03-abcdefghijklmnop\x1b[201~';
      const result = stripBracketedPaste(pastedKey);
      assert.strictEqual(result, 'sk-ant-api03-abcdefghijklmnop');
    });

    it('passes through normal typed input without escape sequences', () => {
      const typedKey = 'sk-ant-api03-normal-typing';
      const result = stripBracketedPaste(typedKey);
      assert.strictEqual(result, 'sk-ant-api03-normal-typing');
    });

    it('handles only start paste sequence', () => {
      const input = '\x1b[200~my-api-key';
      const result = stripBracketedPaste(input);
      assert.strictEqual(result, 'my-api-key');
    });

    it('handles only end paste sequence', () => {
      const input = 'my-api-key\x1b[201~';
      const result = stripBracketedPaste(input);
      assert.strictEqual(result, 'my-api-key');
    });

    it('handles multiple paste sequences', () => {
      const input = '\x1b[200~first\x1b[201~\x1b[200~second\x1b[201~';
      const result = stripBracketedPaste(input);
      assert.strictEqual(result, 'firstsecond');
    });

    it('handles empty paste', () => {
      const input = '\x1b[200~\x1b[201~';
      const result = stripBracketedPaste(input);
      assert.strictEqual(result, '');
    });
  });

  describe('confirm', () => {
    it('returns true when CCS_YES=1', async () => {
      process.env.CCS_YES = '1';

      try {
        const result = await InteractivePrompt.confirm('Proceed?');
        assert.strictEqual(result, true);
      } finally {
        delete process.env.CCS_YES;
      }
    });

    it('returns true when --yes flag present', async () => {
      process.argv = [...process.argv, '--yes'];

      const result = await InteractivePrompt.confirm('Continue?');
      assert.strictEqual(result, true);
    });

    it('returns true when -y flag present', async () => {
      process.argv = [...process.argv, '-y'];

      const result = await InteractivePrompt.confirm('Continue?');
      assert.strictEqual(result, true);
    });
  });
});
