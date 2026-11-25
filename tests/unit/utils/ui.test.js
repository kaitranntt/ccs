/**
 * UI Module Unit Tests
 *
 * Tests the central UI abstraction layer for CLI styling
 */

const assert = require('assert');

function stripAnsi(input) {
  return input.replace(/\u001b\[[0-9;]*m/g, '');
}

function withoutForceColor(callback) {
  const originalForceColor = process.env.FORCE_COLOR;
  delete process.env.FORCE_COLOR;

  try {
    callback();
  } finally {
    if (originalForceColor === undefined) {
      delete process.env.FORCE_COLOR;
    } else {
      process.env.FORCE_COLOR = originalForceColor;
    }
  }
}

describe('UI Module', function () {
  let ui;

  beforeAll(async function () {
    // Dynamic import for ESM module - import the built dist file
    const uiModule = await import('../../../dist/utils/ui.js');
    ui = uiModule;

    // Initialize UI dependencies
    await ui.initUI();
  });

  describe('Color System', function () {
    it('should apply semantic colors to text', function () {
      const result = ui.color('test message', 'success');
      assert.ok(result.includes('test message'), 'should contain original text');
    });

    it('should return plain text when NO_COLOR is set', function () {
      withoutForceColor(() => {
        const originalNoColor = process.env.NO_COLOR;
        process.env.NO_COLOR = '1';

        try {
          const result = ui.color('test', 'success');
          assert.strictEqual(result, 'test', 'should return unmodified text');
        } finally {
          if (originalNoColor === undefined) {
            delete process.env.NO_COLOR;
          } else {
            process.env.NO_COLOR = originalNoColor;
          }
        }
      });
    });

    it('should apply bold formatting', function () {
      const result = ui.bold('bold text');
      assert.ok(result.includes('bold text'), 'should contain original text');
    });

    it('should apply dim formatting', function () {
      const result = ui.dim('dim text');
      assert.ok(result.includes('dim text'), 'should contain original text');
    });

    it('should apply gradient to text', function () {
      const result = ui.gradientText('gradient header');
      assert.ok(stripAnsi(result).includes('gradient header'), 'should contain original text');
    });
  });

  describe('Status Indicators', function () {
    it('should format success message with [OK]', function () {
      const result = ui.ok('Operation successful');
      assert.ok(result.includes('[OK]'), 'should include [OK] indicator');
      assert.ok(result.includes('Operation successful'), 'should include message');
    });

    it('should format error message with [X]', function () {
      const result = ui.fail('Operation failed');
      assert.ok(result.includes('[X]'), 'should include [X] indicator');
      assert.ok(result.includes('Operation failed'), 'should include message');
    });

    it('should format warning message with [!]', function () {
      const result = ui.warn('Warning detected');
      assert.ok(result.includes('[!]'), 'should include [!] indicator');
      assert.ok(result.includes('Warning detected'), 'should include message');
    });

    it('should format info message with [i]', function () {
      const result = ui.info('Information');
      assert.ok(result.includes('[i]'), 'should include [i] indicator');
      assert.ok(result.includes('Information'), 'should include message');
    });
  });

  describe('Box Rendering', function () {
    it('should render box with content', function () {
      const result = ui.box('Box content');
      assert.ok(result.includes('Box content'), 'should include content');
    });

    it('should render error box', function () {
      const result = ui.errorBox('Error message');
      assert.ok(result.includes('Error message'), 'should include error message');
      assert.ok(result.includes('ERROR'), 'should include ERROR title');
    });

    it('should render info box', function () {
      const result = ui.infoBox('Info message', 'Title');
      assert.ok(result.includes('Info message'), 'should include info message');
    });
  });

  describe('Table Rendering', function () {
    it('should render table with rows and headers', function () {
      const rows = [
        ['Row1', 'Data1'],
        ['Row2', 'Data2'],
      ];
      const result = ui.table(rows, { head: ['Column1', 'Column2'] });

      assert.ok(result.includes('Row1'), 'should include first row');
      assert.ok(result.includes('Data1'), 'should include first data');
      assert.ok(result.includes('Row2'), 'should include second row');
      assert.ok(result.includes('Column1'), 'should include header');
    });

    it('should render table without headers', function () {
      const rows = [
        ['Test', 'Value'],
        ['Test2', 'Value2'],
      ];
      const result = ui.table(rows);

      // Should default to ASCII table borders
      assert.ok(result.includes('Test'), 'should include data');
      assert.ok(result.includes('|'), 'should include ASCII vertical separators');
      assert.ok(result.includes('+'), 'should include ASCII corner separators');
    });
  });

  describe('Headers', function () {
    it('should format section header', function () {
      const result = ui.header('Section Title');
      assert.ok(stripAnsi(result).includes('Section Title'), 'should include title text');
    });

    it('should format subsection header', function () {
      const result = ui.subheader('Subsection');
      assert.ok(result.includes('Subsection'), 'should include subsection text');
    });

    it('should render horizontal rule', function () {
      const result = ui.hr('─', 40);
      assert.ok(result.length >= 40, 'should be at least specified width');
    });
  });

  describe('Interactive Detection', function () {
    it('should detect interactive mode', function () {
      // This depends on test environment
      const result = ui.isInteractive();
      assert.strictEqual(typeof result, 'boolean', 'should return boolean');
    });
  });

  describe('NO_COLOR Compliance', function () {
    it('should disable colors when NO_COLOR is set', function () {
      withoutForceColor(() => {
        const originalNoColor = process.env.NO_COLOR;
        process.env.NO_COLOR = '1';

        try {
          // All color functions should return plain text
          assert.strictEqual(ui.color('text', 'success'), 'text');
          assert.strictEqual(ui.bold('text'), 'text');
          assert.strictEqual(ui.dim('text'), 'text');
          assert.strictEqual(ui.gradientText('text'), 'text');
        } finally {
          if (originalNoColor === undefined) {
            delete process.env.NO_COLOR;
          } else {
            process.env.NO_COLOR = originalNoColor;
          }
        }
      });
    });

    it('should give NO_COLOR precedence over FORCE_COLOR', function () {
      const originalNoColor = process.env.NO_COLOR;
      const originalForceColor = process.env.FORCE_COLOR;
      process.env.NO_COLOR = '1';
      process.env.FORCE_COLOR = '1';

      try {
        assert.strictEqual(ui.useColors(), false);
        assert.strictEqual(ui.color('text', 'success'), 'text');
        assert.strictEqual(ui.bold('text'), 'text');
        assert.strictEqual(ui.dim('text'), 'text');
        assert.strictEqual(ui.gradientText('text'), 'text');
      } finally {
        if (originalNoColor === undefined) {
          delete process.env.NO_COLOR;
        } else {
          process.env.NO_COLOR = originalNoColor;
        }
        if (originalForceColor === undefined) {
          delete process.env.FORCE_COLOR;
        } else {
          process.env.FORCE_COLOR = originalForceColor;
        }
      }
    });
  });
});
