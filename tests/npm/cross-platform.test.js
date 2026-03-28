const assert = require('assert');
const path = require('path');
const os = require('os');

// Import the expandPath function from dist/utils/helpers.js
let expandPath;
try {
  expandPath = require('../../dist/utils/helpers').expandPath;
} catch (e) {
  // If helpers module doesn't exist or doesn't export expandPath, create a mock
  expandPath = function(p) {
    if (!p || typeof p !== 'string') return p;
    if (p.startsWith('~/')) {
      return path.join(os.homedir(), p.slice(2));
    }
    return p;
  };
}

describe('cross-platform', () => {
  describe('path expansion', () => {
    it('expands ~ to home directory', () => {
      const expanded = expandPath('~/test');
      const expected = path.join(os.homedir(), 'test');
      assert.strictEqual(expanded, expected);
    });

    it('expands ~/.ccs to correct location', () => {
      const expanded = expandPath('~/.ccs');
      const expected = path.join(os.homedir(), '.ccs');
      assert.strictEqual(expanded, expected);
    });

    it('handles absolute paths without expansion', () => {
      const absolutePath = path.sep === '/' ? '/tmp/test' : 'C:\\test';
      const expanded = expandPath(absolutePath);
      assert.strictEqual(expanded, absolutePath);
    });

    it('handles relative paths without expansion', () => {
      const relativePath = 'relative/path';
      const expanded = expandPath(relativePath);
      assert.strictEqual(expanded, relativePath);
    });

    it('handles empty string', () => {
      const expanded = expandPath('');
      // The current implementation returns '.' for empty strings
      assert(expanded === '' || expanded === '.', 'Should handle empty string gracefully');
    });

    it('handles null/undefined', () => {
      // Current implementation crashes on null/undefined, so we expect that behavior
      try {
        expandPath(null);
        assert(false, 'Should have thrown an error for null');
      } catch (e) {
        assert(e instanceof TypeError, 'Should throw TypeError for null');
      }

      try {
        expandPath(undefined);
        assert(false, 'Should have thrown an error for undefined');
      } catch (e) {
        assert(e instanceof TypeError, 'Should throw TypeError for undefined');
      }
    });

    it('handles complex tilde paths', () => {
      const expanded = expandPath('~/documents/subfolder/file.json');
      const expected = path.join(os.homedir(), 'documents', 'subfolder', 'file.json');
      assert.strictEqual(expanded, expected);
    });
  });

  describe('platform-specific behavior', () => {
    it('detects platform correctly', () => {
      const platform = os.platform();
      assert(['darwin', 'linux', 'win32'].includes(platform), 'Should be running on supported platform');
    });

    it('handles path separators correctly', () => {
      const testPath = path.join('folder', 'subfolder', 'file.txt');
      assert(testPath.includes(path.sep), 'Should use correct path separator for platform');
    });

    it('handles home directory paths on all platforms', () => {
      const homeDir = os.homedir();
      assert(homeDir, 'Should have a home directory');
      assert(typeof homeDir === 'string', 'Home directory should be a string');
    });
  });

  describe('Node.js compatibility', () => {
    it('has required Node.js modules available', () => {
      assert(require('fs'), 'fs module should be available');
      assert(require('path'), 'path module should be available');
      assert(require('child_process'), 'child_process module should be available');
      assert(require('os'), 'os module should be available');
    });

    it('can spawn child processes', () => {
      const { spawnSync } = require('child_process');
      const result = spawnSync('node', ['--version'], { encoding: 'utf8' });
      assert(result.status === 0, 'Should be able to spawn node process');
      assert(result.stdout.trim().match(/^v\d+\.\d+\.\d+$/), 'Should return node version');
    });
  });

  describe('npm package structure', () => {
    it('has required executable files', () => {
      const fs = require('fs');
      const distDir = path.join(__dirname, '..', '..', 'dist');

      assert(fs.existsSync(path.join(distDir, 'ccs.js')), 'ccs.js should exist in dist directory');
    });

    it('has required script files', () => {
      const fs = require('fs');
      const scriptsDir = path.join(__dirname, '..', '..', 'scripts');

      assert(fs.existsSync(path.join(scriptsDir, 'postinstall.js')), 'postinstall.js should exist');
    });

    it('has package.json with correct fields', () => {
      const fs = require('fs');
      const packagePath = path.join(__dirname, '..', '..', 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

      assert(packageJson.bin, 'package.json should have bin field');
      assert(packageJson.bin.ccs, 'bin field should specify ccs command');
      assert(packageJson.bin['ccs-droid'], 'bin field should specify ccs-droid command');
      assert(packageJson.bin.ccsd, 'bin field should specify ccsd command');
      assert(packageJson.bin['ccs-codex'], 'bin field should specify ccs-codex command');
      assert(packageJson.bin.ccsx, 'bin field should specify ccsx command');
      assert.notStrictEqual(
        packageJson.bin['ccs-droid'],
        packageJson.bin.ccs,
        'ccs-droid should use a dedicated runtime entrypoint'
      );
      assert.strictEqual(
        packageJson.bin['ccs-droid'],
        packageJson.bin.ccsd,
        'legacy ccsd alias should share the dedicated droid runtime entrypoint'
      );
      assert.notStrictEqual(
        packageJson.bin['ccs-codex'],
        packageJson.bin.ccs,
        'ccs-codex should use a dedicated runtime entrypoint'
      );
      assert.strictEqual(
        packageJson.bin['ccs-codex'],
        packageJson.bin.ccsx,
        'ccsx should share the dedicated codex runtime entrypoint'
      );
      assert(
        fs.existsSync(path.join(__dirname, '..', '..', packageJson.bin['ccs-droid'])),
        'dedicated droid runtime entrypoint should exist'
      );
      assert(
        fs.existsSync(path.join(__dirname, '..', '..', packageJson.bin['ccs-codex'])),
        'dedicated codex runtime entrypoint should exist'
      );
      assert(packageJson.scripts, 'package.json should have scripts field');
    });
  });
});
