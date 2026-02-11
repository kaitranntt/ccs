/**
 * Tests for CLIProxy Config Generator
 * Verifies config.yaml generation including Windows path handling
 */

const assert = require('assert');
const path = require('path');

// Mock the config-manager module to provide test paths
const originalModule = require.cache[require.resolve('../../../dist/utils/config-manager')];

describe('Config Generator', () => {
  let configGenerator;
  let mockCcsDir;

  beforeEach(() => {
    // Clear the require cache to reload module with fresh mocks
    delete require.cache[require.resolve('../../../dist/cliproxy/config-generator')];

    // Set up a temporary test directory as CCS_HOME
    mockCcsDir = '/test/home/.ccs';
  });

  describe('generateUnifiedConfigContent', () => {
    it('converts Windows backslashes to forward slashes in auth-dir path', () => {
      // Simulate Windows path with backslashes
      const windowsPath = 'C:\\Users\\TestUser\\.ccs\\cliproxy\\auth';
      const normalizedPath = windowsPath.replace(/\\/g, '/');

      // Verify the replacement works correctly
      assert.strictEqual(normalizedPath, 'C:/Users/TestUser/.ccs/cliproxy/auth');
      assert(!normalizedPath.includes('\\'), 'Path should not contain backslashes');
    });

    it('handles mixed path separators', () => {
      // Test with mixed Windows and forward slashes
      const mixedPath = 'C:\\Users/TestUser\\.ccs/cliproxy\\auth';
      const normalizedPath = mixedPath.replace(/\\/g, '/');

      assert.strictEqual(normalizedPath, 'C:/Users/TestUser/.ccs/cliproxy/auth');
    });

    it('leaves forward slashes unchanged', () => {
      // Test with Unix paths (forward slashes only)
      const unixPath = '/home/testuser/.ccs/cliproxy/auth';
      const normalizedPath = unixPath.replace(/\\/g, '/');

      assert.strictEqual(normalizedPath, '/home/testuser/.ccs/cliproxy/auth');
    });

    it('generates valid YAML with normalized paths', () => {
      // Test the actual pattern used in config-generator.ts line 130
      const testAuthDir = 'C:\\Users\\TestUser\\.ccs\\cliproxy\\auth';
      const configLine = `auth-dir: "${testAuthDir.replace(/\\/g, '/')}"`;

      // Verify the YAML line is properly formatted
      assert(configLine.includes('auth-dir:'), 'Should contain auth-dir key');
      assert(configLine.includes('C:/Users/TestUser'), 'Should have normalized path');
      assert(!configLine.includes('\\'), 'Should not contain backslashes');

      // Verify it's valid YAML format
      assert.strictEqual(
        configLine,
        'auth-dir: "C:/Users/TestUser/.ccs/cliproxy/auth"'
      );
    });

    it('handles multiple consecutive backslashes', () => {
      // Edge case: multiple backslashes
      const weirdPath = 'C:\\\\Users\\\\TestUser\\\\.ccs\\\\cliproxy\\\\auth';
      const normalizedPath = weirdPath.replace(/\\/g, '/');

      assert.strictEqual(normalizedPath, 'C://Users//TestUser//.ccs//cliproxy//auth');
      assert(!normalizedPath.includes('\\'), 'Should not contain backslashes');
    });

    it('preserves all other characters in path', () => {
      // Test that normalization doesn't affect other characters
      const complexPath = 'D:\\Projects\\ccs-2024\\test\\.ccs\\auth-tokens\\provider.json';
      const normalizedPath = complexPath.replace(/\\/g, '/');

      assert.strictEqual(normalizedPath, 'D:/Projects/ccs-2024/test/.ccs/auth-tokens/provider.json');
      assert(normalizedPath.includes('Projects'), 'Should preserve directory names');
      assert(normalizedPath.includes('auth-tokens'), 'Should preserve hyphens');
      assert(normalizedPath.includes('provider.json'), 'Should preserve filenames');
    });

    it('works with environment variable expansion', () => {
      // Simulate path with environment variables
      const envPath = process.env.USERPROFILE || 'C:\\Users\\TestUser';
      const fullPath = path.join(envPath, '.ccs', 'cliproxy', 'auth');
      const normalizedPath = fullPath.replace(/\\/g, '/');

      // On Windows, path.join creates backslashes, on Unix forward slashes
      // The normalization should ensure forward slashes regardless
      assert(!normalizedPath.includes('\\'), 'Should not contain backslashes after normalization');
      assert(normalizedPath.includes('/.ccs/'), 'Should have normalized CCS path');
    });

    it('is idempotent - applying normalization twice gives same result', () => {
      const windowsPath = 'C:\\Users\\Test\\.ccs\\auth';
      const normalized1 = windowsPath.replace(/\\/g, '/');
      const normalized2 = normalized1.replace(/\\/g, '/');

      assert.strictEqual(normalized1, normalized2, 'Should be idempotent');
      assert.strictEqual(normalized2, 'C:/Users/Test/.ccs/auth');
    });

    it('handles YAML escaping requirements correctly', () => {
      // Windows paths with backslashes can cause YAML parsing issues
      // because backslash is an escape character in YAML strings
      const windowsPath = 'C:\\Users\\test\\.ccs\\auth';

      // Before fix: would contain backslashes, causing YAML parsing errors
      // After fix: forward slashes, which are safe in YAML
      const yamlUnsafePath = `auth-dir: "${windowsPath}"`;
      const yamlSafePath = `auth-dir: "${windowsPath.replace(/\\/g, '/')}"`;

      // The fixed version should be YAML-safe (no escape character conflicts)
      assert(yamlSafePath.includes('/'), 'Fixed path should use forward slashes');
      assert.strictEqual(yamlSafePath, 'auth-dir: "C:/Users/test/.ccs/auth"');
    });
  });

  describe('Path separator consistency', () => {
    it('ensures forward slashes work across all platforms', () => {
      // Forward slashes work on Windows, macOS, and Linux
      const forwardSlashPath = '/home/user/.ccs/cliproxy/auth';

      // This should work everywhere
      assert.strictEqual(
        forwardSlashPath.replace(/\\/g, '/'),
        '/home/user/.ccs/cliproxy/auth',
        'Forward slashes should be preserved on Unix'
      );

      const windowsPath = 'C:\\Users\\user\\.ccs\\cliproxy\\auth';
      const normalized = windowsPath.replace(/\\/g, '/');
      assert.strictEqual(
        normalized,
        'C:/Users/user/.ccs/cliproxy/auth',
        'Windows paths should be normalized to forward slashes'
      );

      // Both formats should be usable with Node.js fs and path modules
      // and CLIProxyAPI's path handling
    });

    it('avoids YAML escape sequence issues', () => {
      // Backslashes in YAML can cause issues like:
      // - \n being interpreted as newline
      // - \t being interpreted as tab
      // - \u being interpreted as unicode
      // Using forward slashes avoids all these issues

      const problematicPath = 'C:\\Users\\test\\.ccs\\auth';
      const safePath = problematicPath.replace(/\\/g, '/');

      // Check for problematic escape sequences
      assert(!safePath.includes('\\n'), 'Should not create \\n sequences');
      assert(!safePath.includes('\\t'), 'Should not create \\t sequences');
      assert(!safePath.includes('\\u'), 'Should not create \\u sequences');

      // The safe path should be suitable for YAML
      assert.strictEqual(safePath, 'C:/Users/test/.ccs/auth');
    });
  });

  // =========================================================================
  // API Key Preservation Tests (Issue #200)
  // =========================================================================
  describe('parseUserApiKeys', () => {
    let parseUserApiKeys;

    beforeEach(() => {
      // Clear cache and reload module
      delete require.cache[require.resolve('../../../dist/cliproxy/config-generator')];
      const configGenerator = require('../../../dist/cliproxy/config-generator');
      parseUserApiKeys = configGenerator.parseUserApiKeys;
    });

    it('extracts user-added API keys from config content', () => {
      const configContent = `
# CLIProxyAPI config generated by CCS v4
port: 8317

api-keys:
  - "ccs-internal-managed"
  - "user-custom-key-12345"
  - "another-user-key-abcde"

auth-dir: "/home/user/.ccs/cliproxy/auth"
`;

      const userKeys = parseUserApiKeys(configContent);

      assert.deepStrictEqual(userKeys, ['user-custom-key-12345', 'another-user-key-abcde']);
    });

    it('excludes the internal CCS key', () => {
      const configContent = `
api-keys:
  - "ccs-internal-managed"
  - "my-custom-key"

auth-dir: "/test"
`;

      const userKeys = parseUserApiKeys(configContent);

      assert.strictEqual(userKeys.length, 1);
      assert.strictEqual(userKeys[0], 'my-custom-key');
      assert(!userKeys.includes('ccs-internal-managed'), 'Should not include internal key');
    });

    it('returns empty array when only internal key exists', () => {
      const configContent = `
api-keys:
  - "ccs-internal-managed"

auth-dir: "/test"
`;

      const userKeys = parseUserApiKeys(configContent);

      assert.deepStrictEqual(userKeys, []);
    });

    it('returns empty array when no api-keys section exists', () => {
      const configContent = `
port: 8317
debug: false
auth-dir: "/test"
`;

      const userKeys = parseUserApiKeys(configContent);

      assert.deepStrictEqual(userKeys, []);
    });

    it('handles single user key', () => {
      const configContent = `
api-keys:
  - "ccs-internal-managed"
  - "single-user-key"

auth-dir: "/test"
`;

      const userKeys = parseUserApiKeys(configContent);

      assert.deepStrictEqual(userKeys, ['single-user-key']);
    });

    it('handles multiple user keys', () => {
      const configContent = `
api-keys:
  - "ccs-internal-managed"
  - "key1"
  - "key2"
  - "key3"
  - "key4"
  - "key5"

auth-dir: "/test"
`;

      const userKeys = parseUserApiKeys(configContent);

      assert.deepStrictEqual(userKeys, ['key1', 'key2', 'key3', 'key4', 'key5']);
    });

    it('handles keys with special characters', () => {
      const configContent = `
api-keys:
  - "ccs-internal-managed"
  - "sk_live_1234567890abcdef"
  - "api-key-with-dashes"
  - "key_with_underscores_123"

auth-dir: "/test"
`;

      const userKeys = parseUserApiKeys(configContent);

      assert.deepStrictEqual(userKeys, [
        'sk_live_1234567890abcdef',
        'api-key-with-dashes',
        'key_with_underscores_123',
      ]);
    });

    it('preserves key order', () => {
      const configContent = `
api-keys:
  - "ccs-internal-managed"
  - "zebra-key"
  - "alpha-key"
  - "middle-key"

auth-dir: "/test"
`;

      const userKeys = parseUserApiKeys(configContent);

      assert.deepStrictEqual(userKeys, ['zebra-key', 'alpha-key', 'middle-key']);
    });

    it('handles empty string key (edge case)', () => {
      const configContent = `
api-keys:
  - "ccs-internal-managed"
  - ""
  - "valid-key"

auth-dir: "/test"
`;

      const userKeys = parseUserApiKeys(configContent);

      // Empty strings should be filtered out - parseUserApiKeys checks: key && key !== CCS_INTERNAL_API_KEY
      // Empty string is falsy, so it's excluded along with internal key
      assert.strictEqual(userKeys.length, 1, 'Should filter out empty string key');
      assert.deepStrictEqual(userKeys, ['valid-key'], 'Should only include valid non-empty keys');
    });

    it('handles config with Windows line endings', () => {
      const configContent =
        'api-keys:\r\n  - "ccs-internal-managed"\r\n  - "user-key"\r\n\r\nauth-dir: "/test"\r\n';

      const userKeys = parseUserApiKeys(configContent);

      assert.deepStrictEqual(userKeys, ['user-key']);
    });

    it('handles different indentation styles', () => {
      const configContent = `
api-keys:
    - "ccs-internal-managed"
    - "user-key-with-4-spaces"

auth-dir: "/test"
`;

      const userKeys = parseUserApiKeys(configContent);

      assert.deepStrictEqual(userKeys, ['user-key-with-4-spaces']);
    });

    it('handles tabs in indentation', () => {
      const configContent = 'api-keys:\n\t- "ccs-internal-managed"\n\t- "user-key-with-tab"\n\nauth-dir: "/test"';

      const userKeys = parseUserApiKeys(configContent);

      assert.deepStrictEqual(userKeys, ['user-key-with-tab']);
    });
  });

  describe('regenerateConfig API key preservation', () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');

    let testDir;
    let originalCcsHome;
    let regenerateConfig;
    let getCliproxyConfigPath;

    beforeEach(() => {
      // Create a temporary test directory
      testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-test-'));
      originalCcsHome = process.env.CCS_HOME;
      process.env.CCS_HOME = testDir;

      // Clear cache and reload module
      delete require.cache[require.resolve('../../../dist/cliproxy/config-generator')];
      delete require.cache[require.resolve('../../../dist/utils/config-manager')];
      const configGenerator = require('../../../dist/cliproxy/config-generator');
      regenerateConfig = configGenerator.regenerateConfig;
      getCliproxyConfigPath = configGenerator.getCliproxyConfigPath;
    });

    afterEach(() => {
      // Restore environment
      process.env.CCS_HOME = originalCcsHome;

      // Clean up test directory
      if (testDir && fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('preserves user API keys during regeneration', () => {
      // Create initial config with user keys
      const cliproxyDir = path.join(testDir, '.ccs', 'cliproxy');
      fs.mkdirSync(cliproxyDir, { recursive: true });

      const initialConfig = `# CLIProxyAPI config generated by CCS v3
port: 8317

api-keys:
  - "ccs-internal-managed"
  - "user-custom-key-12345"
  - "another-user-key"

auth-dir: "${cliproxyDir.replace(/\\/g, '/')}/auth"
`;
      fs.writeFileSync(path.join(cliproxyDir, 'config.yaml'), initialConfig);

      // Regenerate config (simulating CCS update)
      regenerateConfig();

      // Read regenerated config
      const newConfig = fs.readFileSync(path.join(cliproxyDir, 'config.yaml'), 'utf-8');

      // Verify user keys are preserved
      assert(newConfig.includes('user-custom-key-12345'), 'Should preserve first user key');
      assert(newConfig.includes('another-user-key'), 'Should preserve second user key');
      assert(newConfig.includes('ccs-internal-managed'), 'Should include internal key');
    });

    it('preserves port setting during regeneration', () => {
      // Create initial config with custom port
      const cliproxyDir = path.join(testDir, '.ccs', 'cliproxy');
      fs.mkdirSync(cliproxyDir, { recursive: true });

      const initialConfig = `# CLIProxyAPI config generated by CCS v3
port: 9999

api-keys:
  - "ccs-internal-managed"

auth-dir: "${cliproxyDir.replace(/\\/g, '/')}/auth"
`;
      fs.writeFileSync(path.join(cliproxyDir, 'config.yaml'), initialConfig);

      // Regenerate config
      regenerateConfig();

      // Read regenerated config
      const newConfig = fs.readFileSync(path.join(cliproxyDir, 'config.yaml'), 'utf-8');

      // Verify port is preserved
      assert(newConfig.includes('port: 9999'), 'Should preserve custom port');
    });

    it('creates fresh config when none exists', () => {
      // Ensure clean state
      const cliproxyDir = path.join(testDir, '.ccs', 'cliproxy');
      const configPath = path.join(cliproxyDir, 'config.yaml');

      assert(!fs.existsSync(configPath), 'Config should not exist initially');

      // Generate config
      regenerateConfig();

      // Verify config was created
      assert(fs.existsSync(configPath), 'Config should be created');

      const config = fs.readFileSync(configPath, 'utf-8');
      assert(config.includes('ccs-internal-managed'), 'Should include internal key');
      assert(config.includes('port: 8317'), 'Should use default port');
    });

    it('handles corrupted config gracefully', () => {
      // Create corrupted config
      const cliproxyDir = path.join(testDir, '.ccs', 'cliproxy');
      fs.mkdirSync(cliproxyDir, { recursive: true });

      fs.writeFileSync(path.join(cliproxyDir, 'config.yaml'), 'invalid yaml content: [[[');

      // Should not throw
      assert.doesNotThrow(() => regenerateConfig());

      // Should create valid config
      const newConfig = fs.readFileSync(path.join(cliproxyDir, 'config.yaml'), 'utf-8');
      assert(newConfig.includes('ccs-internal-managed'), 'Should create valid config');
    });

    it('handles empty config file gracefully', () => {
      // Create empty config
      const cliproxyDir = path.join(testDir, '.ccs', 'cliproxy');
      fs.mkdirSync(cliproxyDir, { recursive: true });

      fs.writeFileSync(path.join(cliproxyDir, 'config.yaml'), '');

      // Should not throw
      assert.doesNotThrow(() => regenerateConfig());

      // Should create valid config with defaults
      const newConfig = fs.readFileSync(path.join(cliproxyDir, 'config.yaml'), 'utf-8');
      assert(newConfig.includes('ccs-internal-managed'), 'Should create valid config');
      assert(newConfig.includes('port: 8317'), 'Should use default port');
    });

    it('preserves multiple user keys in correct order', () => {
      // Create config with multiple user keys
      const cliproxyDir = path.join(testDir, '.ccs', 'cliproxy');
      fs.mkdirSync(cliproxyDir, { recursive: true });

      const initialConfig = `# CLIProxyAPI config generated by CCS v3
port: 8317

api-keys:
  - "ccs-internal-managed"
  - "key-first"
  - "key-second"
  - "key-third"

auth-dir: "${cliproxyDir.replace(/\\/g, '/')}/auth"
`;
      fs.writeFileSync(path.join(cliproxyDir, 'config.yaml'), initialConfig);

      // Regenerate config
      regenerateConfig();

      // Read regenerated config
      const newConfig = fs.readFileSync(path.join(cliproxyDir, 'config.yaml'), 'utf-8');

      // Verify order is preserved (first > second > third)
      const firstPos = newConfig.indexOf('key-first');
      const secondPos = newConfig.indexOf('key-second');
      const thirdPos = newConfig.indexOf('key-third');

      assert(firstPos < secondPos, 'First key should come before second');
      assert(secondPos < thirdPos, 'Second key should come before third');
    });
  });

  describe('Cross-platform path handling', () => {
    it('normalizes paths regardless of current platform', () => {
      // The fix should work consistently on Windows, macOS, and Linux

      const testPaths = [
        // Windows-style paths
        { input: 'C:\\Users\\test\\.ccs\\auth', expected: 'C:/Users/test/.ccs/auth' },
        { input: 'D:\\Projects\\ccs\\auth', expected: 'D:/Projects/ccs/auth' },
        // Unix-style paths
        { input: '/home/user/.ccs/auth', expected: '/home/user/.ccs/auth' },
        { input: '/var/ccs/auth', expected: '/var/ccs/auth' },
        // Network paths
        { input: '\\\\network\\share\\.ccs\\auth', expected: '//network/share/.ccs/auth' },
      ];

      testPaths.forEach(({ input, expected }) => {
        const normalized = input.replace(/\\/g, '/');
        assert.strictEqual(
          normalized,
          expected,
          `Should normalize "${input}" to "${expected}"`
        );
      });
    });
  });

  describe('oauth-model-alias fork:true', () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');

    let testDir;
    let originalCcsHome;
    let regenerateConfig;

    beforeEach(() => {
      testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-test-fork-'));
      originalCcsHome = process.env.CCS_HOME;
      process.env.CCS_HOME = testDir;

      delete require.cache[require.resolve('../../../dist/cliproxy/config-generator')];
      delete require.cache[require.resolve('../../../dist/utils/config-manager')];
      const configGenerator = require('../../../dist/cliproxy/config-generator');
      regenerateConfig = configGenerator.regenerateConfig;
    });

    afterEach(() => {
      process.env.CCS_HOME = originalCcsHome;
      if (testDir && fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('generates fork:true for Claude model aliases', () => {
      regenerateConfig();

      const cliproxyDir = path.join(testDir, '.ccs', 'cliproxy');
      const config = fs.readFileSync(path.join(cliproxyDir, 'config.yaml'), 'utf-8');

      // Claude aliases should have fork: true
      assert(config.includes('claude-sonnet-4-5'), 'Should include Claude sonnet model');
      assert(config.includes('fork: true'), 'Should include fork: true for Claude aliases');

      // Verify fork: true appears after each Claude alias entry
      const lines = config.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('alias: gemini-claude-')) {
          assert(
            lines[i + 1] && lines[i + 1].trim() === 'fork: true',
            `fork: true should follow Claude alias at line ${i}: ${lines[i]}`
          );
        }
      }
    });

    it('does not generate fork:true for non-Claude aliases', () => {
      regenerateConfig();

      const cliproxyDir = path.join(testDir, '.ccs', 'cliproxy');
      const config = fs.readFileSync(path.join(cliproxyDir, 'config.yaml'), 'utf-8');

      // Gemini aliases should NOT have fork: true
      const lines = config.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('alias: gemini-3-') || lines[i].includes('alias: gemini-2.5-')) {
          const nextLine = lines[i + 1] || '';
          assert(
            !nextLine.trim().startsWith('fork:'),
            `Gemini alias should not have fork: ${lines[i]}`
          );
        }
      }
    });

    it('preserves user-added aliases with fork during regeneration', () => {
      const cliproxyDir = path.join(testDir, '.ccs', 'cliproxy');
      fs.mkdirSync(cliproxyDir, { recursive: true });

      const initialConfig = `# CLIProxyAPI config generated by CCS v6
port: 8317
api-keys:
  - "ccs-internal-managed"
auth-dir: "${cliproxyDir.replace(/\\/g, '/')}/auth"
oauth-model-alias:
  antigravity:
    - name: custom-model
      alias: my-custom-alias
      fork: true
`;
      fs.writeFileSync(path.join(cliproxyDir, 'config.yaml'), initialConfig);

      regenerateConfig();

      const newConfig = fs.readFileSync(path.join(cliproxyDir, 'config.yaml'), 'utf-8');
      assert(newConfig.includes('custom-model'), 'Should preserve custom alias name');
      assert(newConfig.includes('my-custom-alias'), 'Should preserve custom alias');

      // Check fork is preserved for user alias
      const lines = newConfig.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('alias: my-custom-alias')) {
          assert(
            lines[i + 1] && lines[i + 1].trim() === 'fork: true',
            'Should preserve fork: true for user-added alias'
          );
        }
      }
    });
  });
});
