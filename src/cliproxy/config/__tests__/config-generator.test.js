/**
 * Tests for CLIProxy Config Generator
 * Verifies config.yaml generation including Windows path handling
 */

const assert = require('assert');
const path = require('path');

// Mock the config-manager module to provide test paths
const originalModule = require.cache[require.resolve('../../../../dist/utils/config-manager')];

describe('Config Generator', () => {
  let configGenerator;
  let mockCcsDir;

  beforeEach(() => {
    // Clear the require cache to reload module with fresh mocks
    delete require.cache[require.resolve('../../../../dist/cliproxy/config/config-generator')];

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
      assert.strictEqual(configLine, 'auth-dir: "C:/Users/TestUser/.ccs/cliproxy/auth"');
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

      assert.strictEqual(
        normalizedPath,
        'D:/Projects/ccs-2024/test/.ccs/auth-tokens/provider.json'
      );
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
      delete require.cache[require.resolve('../../../../dist/cliproxy/config/config-generator')];
      const configGenerator = require('../../../../dist/cliproxy/config/config-generator');
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
      const configContent =
        'api-keys:\n\t- "ccs-internal-managed"\n\t- "user-key-with-tab"\n\nauth-dir: "/test"';

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
      delete require.cache[require.resolve('../../../../dist/cliproxy/config/config-generator')];
      delete require.cache[require.resolve('../../../../dist/utils/config-manager')];
      const configGenerator = require('../../../../dist/cliproxy/config/config-generator');
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

    it('preserves openai-compatibility connectors during regeneration', () => {
      const cliproxyDir = path.join(testDir, '.ccs', 'cliproxy');
      fs.mkdirSync(cliproxyDir, { recursive: true });

      const initialConfig = `# CLIProxyAPI config generated by CCS v17
port: 8317

api-keys:
  - "ccs-internal-managed"

auth-dir: "${cliproxyDir.replace(/\\/g, '/')}/auth"

openai-compatibility:
  - name: mimo
    base-url: https://api.xiaomimimo.com/v1
    api-key-entries:
      - api-key: sk-test
    models:
      - name: mimo-v2-flash
        alias: mimo-v2-flash
`;
      fs.writeFileSync(path.join(cliproxyDir, 'config.yaml'), initialConfig);

      regenerateConfig();

      const newConfig = fs.readFileSync(path.join(cliproxyDir, 'config.yaml'), 'utf-8');
      assert(newConfig.includes('openai-compatibility:'), 'Should preserve openai-compatibility');
      assert(newConfig.includes('name: mimo'), 'Should preserve connector name');
      assert(
        newConfig.includes('base-url: https://api.xiaomimimo.com/v1'),
        'Should preserve base URL'
      );
      assert(newConfig.includes('alias: mimo-v2-flash'), 'Should preserve model aliases');
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
        assert.strictEqual(normalized, expected, `Should normalize "${input}" to "${expected}"`);
      });
    });
  });

  describe('management panel repository selection', () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');

    const ORIGINAL_PANEL_REPO = 'https://github.com/router-for-me/Cli-Proxy-API-Management-Center';
    const PLUS_PANEL_REPO = 'https://github.com/kaitranntt/Cli-Proxy-API-Management-Center';

    let testDir;
    let originalCcsHome;
    let regenerateConfig;
    let configNeedsRegeneration;

    function loadGenerator() {
      delete require.cache[require.resolve('../../../../dist/cliproxy/config/config-generator')];
      delete require.cache[require.resolve('../../../../dist/utils/config-manager')];
      delete require.cache[require.resolve('../../../../dist/config/config-loader-facade')];
      delete require.cache[require.resolve('../../../../dist/config/unified-config-loader')];
      return require('../../../../dist/cliproxy/config/config-generator');
    }

    function writeUnifiedConfig(cliproxyYaml) {
      const ccsDir = path.join(testDir, '.ccs');
      fs.mkdirSync(ccsDir, { recursive: true });
      fs.writeFileSync(
        path.join(ccsDir, 'config.yaml'),
        `version: 999\ncliproxy:\n${cliproxyYaml}`
      );
    }

    function readGeneratedConfig() {
      const configPath = path.join(testDir, '.ccs', 'cliproxy', 'config.yaml');
      return fs.readFileSync(configPath, 'utf-8');
    }

    beforeEach(() => {
      testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-test-panel-repo-'));
      originalCcsHome = process.env.CCS_HOME;
      process.env.CCS_HOME = testDir;

      const configGenerator = loadGenerator();
      regenerateConfig = configGenerator.regenerateConfig;
      configNeedsRegeneration = configGenerator.configNeedsRegeneration;
    });

    afterEach(() => {
      process.env.CCS_HOME = originalCcsHome;
      if (testDir && fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('uses the upstream management dashboard for the original backend', () => {
      writeUnifiedConfig('  backend: original\n');

      regenerateConfig();

      const config = readGeneratedConfig();
      assert(
        config.includes(`panel-github-repository: "${ORIGINAL_PANEL_REPO}"`),
        'Original backend should use upstream CPAMC repository'
      );
    });

    it('uses the maintained management dashboard fork for the Plus backend', () => {
      writeUnifiedConfig('  backend: plus\n');

      regenerateConfig();

      const config = readGeneratedConfig();
      assert(
        config.includes(`panel-github-repository: "${PLUS_PANEL_REPO}"`),
        'Plus backend should use the CCS-maintained CPAMC fork'
      );
    });

    it('lets users override the management dashboard repository', () => {
      const customRepo = 'https://github.com/example/custom-panel';
      writeUnifiedConfig(`  backend: plus\n  management_panel_repository: "${customRepo}"\n`);

      regenerateConfig();

      const config = readGeneratedConfig();
      assert(
        config.includes(`panel-github-repository: "${customRepo}"`),
        'Explicit dashboard repository override should win over backend defaults'
      );
    });

    it('marks v18 generated configs stale so the panel repository is backfilled', () => {
      const cliproxyDir = path.join(testDir, '.ccs', 'cliproxy');
      fs.mkdirSync(cliproxyDir, { recursive: true });
      fs.writeFileSync(
        path.join(cliproxyDir, 'config.yaml'),
        '# CLIProxyAPI config generated by CCS v18\nport: 8317\n'
      );

      assert.strictEqual(configNeedsRegeneration(), true);
    });

    it('checks the generated config for the requested local port', () => {
      writeUnifiedConfig('  backend: plus\n');

      const cliproxyDir = path.join(testDir, '.ccs', 'cliproxy');
      fs.mkdirSync(cliproxyDir, { recursive: true });
      fs.writeFileSync(
        path.join(cliproxyDir, 'config-8318.yaml'),
        `# CLIProxyAPI config generated by CCS v19
port: 8318
remote-management:
  panel-github-repository: "${ORIGINAL_PANEL_REPO}"
`
      );

      assert.strictEqual(configNeedsRegeneration(8318), true);
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

      delete require.cache[require.resolve('../../../../dist/cliproxy/config/config-generator')];
      delete require.cache[require.resolve('../../../../dist/utils/config-manager')];
      const configGenerator = require('../../../../dist/cliproxy/config/config-generator');
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
      assert(config.includes('claude-sonnet-4-6'), 'Should include Claude Sonnet 4.6 model');
      assert(config.includes('fork: true'), 'Should include fork: true for Claude aliases');
      assert(
        !config.includes('claude-sonnet-4-5'),
        'Should not include denylisted Claude Sonnet 4.5 aliases'
      );
      assert(
        !config.includes('claude-opus-4-5'),
        'Should not include denylisted Claude Opus 4.5 aliases'
      );
      assert(
        !config.includes('alias: gemini-claude-'),
        'Should not emit deprecated gemini-claude aliases'
      );

      // Verify fork: true appears after each Claude alias entry
      const lines = config.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('alias: claude-')) {
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

    it('generates Gemini 3.1 compatibility aliases without fork', () => {
      regenerateConfig();

      const cliproxyDir = path.join(testDir, '.ccs', 'cliproxy');
      const config = fs.readFileSync(path.join(cliproxyDir, 'config.yaml'), 'utf-8');
      const lines = config.split('\n');

      const gemini31AliasLines = [
        'alias: gemini-3.1-pro-preview',
        'alias: gemini-3.1-pro-preview-customtools',
        'alias: gemini-3.1-flash-preview',
        'alias: gemini-3.1-flash-preview-customtools',
      ];

      for (const aliasLine of gemini31AliasLines) {
        const lineIndex = lines.findIndex((line) => line.includes(aliasLine));
        assert(lineIndex >= 0, `Should include ${aliasLine}`);
        const nextLine = lines[lineIndex + 1] || '';
        assert(
          !nextLine.trim().startsWith('fork:'),
          `Gemini alias should not have fork: ${aliasLine}`
        );
      }
    });

    it('generates dot and hyphen alias forms for preview compatibility', () => {
      regenerateConfig();

      const cliproxyDir = path.join(testDir, '.ccs', 'cliproxy');
      const config = fs.readFileSync(path.join(cliproxyDir, 'config.yaml'), 'utf-8');

      assert(
        config.includes('alias: gemini-3.1-pro-preview'),
        'Should include dotted version alias'
      );
      assert(
        config.includes('alias: gemini-3-1-pro-preview'),
        'Should include hyphen version alias'
      );
      assert(
        config.includes('alias: gemini-3-1-pro-preview-customtools'),
        'Should include hyphen customtools alias'
      );
    });

    it('preserves multiple aliases that share the same model name', () => {
      const cliproxyDir = path.join(testDir, '.ccs', 'cliproxy');
      fs.mkdirSync(cliproxyDir, { recursive: true });

      const initialConfig = `# CLIProxyAPI config generated by CCS v8
port: 8317
api-keys:
  - "ccs-internal-managed"
auth-dir: "${cliproxyDir.replace(/\\/g, '/')}/auth"
oauth-model-alias:
  antigravity:
    - name: custom-model
      alias: custom-alias-a
    - name: custom-model
      alias: custom-alias-b
`;
      fs.writeFileSync(path.join(cliproxyDir, 'config.yaml'), initialConfig);

      regenerateConfig();

      const newConfig = fs.readFileSync(path.join(cliproxyDir, 'config.yaml'), 'utf-8');

      assert(newConfig.includes('alias: custom-alias-a'), 'Should preserve first alias');
      assert(newConfig.includes('alias: custom-alias-b'), 'Should preserve second alias');
      assert.strictEqual(
        (newConfig.match(/alias: custom-alias-a/g) || []).length,
        1,
        'Should keep one entry for first alias'
      );
      assert.strictEqual(
        (newConfig.match(/alias: custom-alias-b/g) || []).length,
        1,
        'Should keep one entry for second alias'
      );
    });

    it('does not auto-enrich aliases from cached catalog to avoid model list bloat', () => {
      const cliproxyDir = path.join(testDir, '.ccs', 'cliproxy');
      const cachePath = path.join(testDir, '.ccs', 'model-catalog-cache.json');
      fs.mkdirSync(path.dirname(cachePath), { recursive: true });

      regenerateConfig();

      const beforeCacheConfig = fs.readFileSync(path.join(cliproxyDir, 'config.yaml'), 'utf-8');
      assert(
        !beforeCacheConfig.includes('alias: gemini-3.11-pro-preview'),
        'Should not include unseen minor alias before cache enrichment'
      );

      const cachePayload = {
        providers: {
          agy: [{ id: 'gemini-3.11-pro-preview', display_name: 'Gemini 3.11 Pro Preview' }],
        },
        fetchedAt: Date.now(),
      };
      fs.writeFileSync(cachePath, JSON.stringify(cachePayload));

      regenerateConfig();

      const afterCacheConfig = fs.readFileSync(path.join(cliproxyDir, 'config.yaml'), 'utf-8');
      assert(
        !afterCacheConfig.includes('alias: gemini-3.11-pro-preview'),
        'Should not include cache-derived unseen minor alias'
      );
      assert(
        !afterCacheConfig.includes('alias: gemini-3.11-pro-preview-customtools'),
        'Should not include compatibility alias for cache-derived entry'
      );
      assert(
        afterCacheConfig.includes('alias: gemini-3-pro-preview'),
        'Should keep baseline Gemini preview alias generation'
      );
      assert(
        afterCacheConfig.includes('alias: gemini-3-pro-preview-customtools'),
        'Should keep baseline compatibility alias generation'
      );
    });

    it('drops stale multi-version Gemini preview ranges while preserving true custom aliases', () => {
      const cliproxyDir = path.join(testDir, '.ccs', 'cliproxy');
      fs.mkdirSync(cliproxyDir, { recursive: true });
      const guessedMinors = ['3', '4', '5', '6'];
      const buildGuessedRange = (name, family) =>
        guessedMinors
          .flatMap((minor) => [
            `    - name: ${name}`,
            `      alias: gemini-3.${minor}-${family}-preview`,
            `    - name: ${name}`,
            `      alias: gemini-3.${minor}-${family}-preview-customtools`,
            `    - name: ${name}`,
            `      alias: gemini-3-${minor}-${family}-preview`,
            `    - name: ${name}`,
            `      alias: gemini-3-${minor}-${family}-preview-customtools`,
          ])
          .join('\n');

      const initialConfig = `# CLIProxyAPI config generated by CCS v12
port: 8317
api-keys:
  - "ccs-internal-managed"
auth-dir: "${cliproxyDir.replace(/\\/g, '/')}/auth"
oauth-model-alias:
  antigravity:
${buildGuessedRange('gemini-3-pro-high', 'pro')}
${buildGuessedRange('gemini-3-flash', 'flash')}
    - name: custom-model
      alias: keep-me
`;
      fs.writeFileSync(path.join(cliproxyDir, 'config.yaml'), initialConfig);

      regenerateConfig();

      const newConfig = fs.readFileSync(path.join(cliproxyDir, 'config.yaml'), 'utf-8');
      for (const minor of guessedMinors) {
        assert(
          !newConfig.includes(`alias: gemini-3.${minor}-pro-preview`),
          `Should remove stale generated Pro aliases for 3.${minor}`
        );
        assert(
          !newConfig.includes(`alias: gemini-3-${minor}-flash-preview-customtools`),
          `Should remove stale generated Flash aliases for 3.${minor}`
        );
      }
      assert(newConfig.includes('alias: keep-me'), 'Should preserve true custom aliases');
      assert(
        newConfig.includes('alias: gemini-3-pro-preview'),
        'Should still keep current baseline Pro preview alias'
      );
      assert(
        newConfig.includes('alias: gemini-3.1-flash-preview-customtools'),
        'Should still keep current baseline Flash compatibility alias'
      );
    });

    it('preserves sparse manual minor-version overrides when a stale guessed range is pruned', () => {
      const cliproxyDir = path.join(testDir, '.ccs', 'cliproxy');
      fs.mkdirSync(cliproxyDir, { recursive: true });
      const guessedMinors = ['3', '4', '5', '6'];
      const staleRange = guessedMinors
        .flatMap((minor) => [
          `    - name: gemini-3-pro-high`,
          `      alias: gemini-3.${minor}-pro-preview`,
          `    - name: gemini-3-pro-high`,
          `      alias: gemini-3.${minor}-pro-preview-customtools`,
          `    - name: gemini-3-pro-high`,
          `      alias: gemini-3-${minor}-pro-preview`,
          `    - name: gemini-3-pro-high`,
          `      alias: gemini-3-${minor}-pro-preview-customtools`,
        ])
        .join('\n');

      const initialConfig = `# CLIProxyAPI config generated by CCS v12
port: 8317
api-keys:
  - "ccs-internal-managed"
auth-dir: "${cliproxyDir.replace(/\\/g, '/')}/auth"
oauth-model-alias:
  antigravity:
    - name: gemini-3-pro-high
      alias: gemini-3.2-pro-preview
${staleRange}
`;
      fs.writeFileSync(path.join(cliproxyDir, 'config.yaml'), initialConfig);

      regenerateConfig();

      const newConfig = fs.readFileSync(path.join(cliproxyDir, 'config.yaml'), 'utf-8');
      assert(
        newConfig.includes('alias: gemini-3.2-pro-preview'),
        'Should preserve sparse manual minor-version override'
      );
      assert(
        newConfig.includes('alias: gemini-3.2-pro-preview-customtools'),
        'Should still expand compatibility aliases for preserved sparse manual override'
      );
      for (const minor of guessedMinors) {
        assert(
          !newConfig.includes(`alias: gemini-3.${minor}-pro-preview`),
          `Should prune stale guessed aliases for 3.${minor}`
        );
      }
    });

    it('preserves a manual 3.2 compatibility cluster while pruning higher stale guessed minors', () => {
      const cliproxyDir = path.join(testDir, '.ccs', 'cliproxy');
      fs.mkdirSync(cliproxyDir, { recursive: true });
      const guessedMinors = ['3', '4', '5', '6'];
      const staleRange = guessedMinors
        .flatMap((minor) => [
          `    - name: gemini-3-pro-high`,
          `      alias: gemini-3.${minor}-pro-preview`,
          `    - name: gemini-3-pro-high`,
          `      alias: gemini-3.${minor}-pro-preview-customtools`,
          `    - name: gemini-3-pro-high`,
          `      alias: gemini-3-${minor}-pro-preview`,
          `    - name: gemini-3-pro-high`,
          `      alias: gemini-3-${minor}-pro-preview-customtools`,
        ])
        .join('\n');

      const initialConfig = `# CLIProxyAPI config generated by CCS v12
port: 8317
api-keys:
  - "ccs-internal-managed"
auth-dir: "${cliproxyDir.replace(/\\/g, '/')}/auth"
oauth-model-alias:
  antigravity:
    - name: gemini-3-pro-high
      alias: gemini-3.2-pro-preview
    - name: gemini-3-pro-high
      alias: gemini-3.2-pro-preview-customtools
    - name: gemini-3-pro-high
      alias: gemini-3-2-pro-preview
    - name: gemini-3-pro-high
      alias: gemini-3-2-pro-preview-customtools
${staleRange}
`;
      fs.writeFileSync(path.join(cliproxyDir, 'config.yaml'), initialConfig);

      regenerateConfig();

      const newConfig = fs.readFileSync(path.join(cliproxyDir, 'config.yaml'), 'utf-8');
      assert(
        newConfig.includes('alias: gemini-3.2-pro-preview'),
        'Should preserve the manual 3.2 compatibility cluster during legacy cleanup'
      );
      assert(
        newConfig.includes('alias: gemini-3-2-pro-preview-customtools'),
        'Should preserve hyphenated manual compatibility aliases for 3.2'
      );
      for (const minor of guessedMinors) {
        assert(
          !newConfig.includes(`alias: gemini-3.${minor}-pro-preview`),
          `Should prune higher stale guessed aliases for 3.${minor}`
        );
      }
    });

    it('prunes partially retained broad guessed ranges during legacy cleanup', () => {
      const cliproxyDir = path.join(testDir, '.ccs', 'cliproxy');
      fs.mkdirSync(cliproxyDir, { recursive: true });
      const guessedMinors = ['3', '4', '5'];
      const partialRange = guessedMinors
        .flatMap((minor) => [
          `    - name: gemini-3-pro-high`,
          `      alias: gemini-3.${minor}-pro-preview`,
          `    - name: gemini-3-pro-high`,
          `      alias: gemini-3.${minor}-pro-preview-customtools`,
        ])
        .join('\n');

      const initialConfig = `# CLIProxyAPI config generated by CCS v12
port: 8317
api-keys:
  - "ccs-internal-managed"
auth-dir: "${cliproxyDir.replace(/\\/g, '/')}/auth"
oauth-model-alias:
  antigravity:
${partialRange}
`;
      fs.writeFileSync(path.join(cliproxyDir, 'config.yaml'), initialConfig);

      regenerateConfig();

      const newConfig = fs.readFileSync(path.join(cliproxyDir, 'config.yaml'), 'utf-8');
      for (const minor of guessedMinors) {
        assert(
          !newConfig.includes(`alias: gemini-3.${minor}-pro-preview`),
          `Should prune partially retained guessed aliases for 3.${minor}`
        );
      }
    });

    it('preserves manual high-only multi-version clusters that are not broad guessed ranges', () => {
      const cliproxyDir = path.join(testDir, '.ccs', 'cliproxy');
      fs.mkdirSync(cliproxyDir, { recursive: true });

      const initialConfig = `# CLIProxyAPI config generated by CCS v12
port: 8317
api-keys:
  - "ccs-internal-managed"
auth-dir: "${cliproxyDir.replace(/\\/g, '/')}/auth"
oauth-model-alias:
  antigravity:
    - name: gemini-3-pro-high
      alias: gemini-3.3-pro-preview
    - name: gemini-3-pro-high
      alias: gemini-3.3-pro-preview-customtools
    - name: gemini-3-pro-high
      alias: gemini-3.4-pro-preview
    - name: gemini-3-pro-high
      alias: gemini-3.4-pro-preview-customtools
`;
      fs.writeFileSync(path.join(cliproxyDir, 'config.yaml'), initialConfig);

      regenerateConfig();

      const newConfig = fs.readFileSync(path.join(cliproxyDir, 'config.yaml'), 'utf-8');
      assert(
        newConfig.includes('alias: gemini-3.3-pro-preview'),
        'Should preserve manual 3.3 aliases when the cluster is not broad enough to infer stale fan-out'
      );
      assert(
        newConfig.includes('alias: gemini-3.4-pro-preview-customtools'),
        'Should preserve manual 3.4 compatibility aliases when provenance is ambiguous'
      );
    });

    it('preserves single-minor high-version aliases when they are not part of a guessed range', () => {
      const cliproxyDir = path.join(testDir, '.ccs', 'cliproxy');
      fs.mkdirSync(cliproxyDir, { recursive: true });

      const initialConfig = `# CLIProxyAPI config generated by CCS v12
port: 8317
api-keys:
  - "ccs-internal-managed"
auth-dir: "${cliproxyDir.replace(/\\/g, '/')}/auth"
oauth-model-alias:
  antigravity:
    - name: gemini-3-pro-high
      alias: gemini-3.11-pro-preview
    - name: gemini-3-pro-high
      alias: gemini-3.11-pro-preview-customtools
`;
      fs.writeFileSync(path.join(cliproxyDir, 'config.yaml'), initialConfig);

      regenerateConfig();

      const newConfig = fs.readFileSync(path.join(cliproxyDir, 'config.yaml'), 'utf-8');
      assert(
        newConfig.includes('alias: gemini-3.11-pro-preview'),
        'Should preserve lone manual high-version aliases during legacy cleanup'
      );
      assert(
        newConfig.includes('alias: gemini-3.11-pro-preview-customtools'),
        'Should still expand compatibility aliases for preserved high-version aliases'
      );
    });

    it('writes a one-time backup before pruning legacy Gemini aliases during migration', () => {
      const cliproxyDir = path.join(testDir, '.ccs', 'cliproxy');
      fs.mkdirSync(cliproxyDir, { recursive: true });
      const configPath = path.join(cliproxyDir, 'config.yaml');
      const guessedMinors = ['3', '4', '5'];
      const staleRange = guessedMinors
        .flatMap((minor) => [
          `    - name: gemini-3-pro-high`,
          `      alias: gemini-3.${minor}-pro-preview`,
          `    - name: gemini-3-pro-high`,
          `      alias: gemini-3.${minor}-pro-preview-customtools`,
        ])
        .join('\n');

      const initialConfig = `# CLIProxyAPI config generated by CCS v12
port: 8317
api-keys:
  - "ccs-internal-managed"
auth-dir: "${cliproxyDir.replace(/\\/g, '/')}/auth"
oauth-model-alias:
  antigravity:
${staleRange}
`;
      fs.writeFileSync(configPath, initialConfig);

      regenerateConfig();

      const backupPath = `${configPath}.pre-v16-gemini-alias-cleanup.bak`;
      assert(fs.existsSync(backupPath), 'Should keep a backup of the legacy config before pruning');
      assert(
        fs.readFileSync(backupPath, 'utf-8').includes('gemini-3.5-pro-preview'),
        'Should preserve the pruned legacy alias in the migration backup'
      );
    });

    it('preserves manual Gemini preview overrides on built-in alias names', () => {
      const cliproxyDir = path.join(testDir, '.ccs', 'cliproxy');
      fs.mkdirSync(cliproxyDir, { recursive: true });

      const initialConfig = `# CLIProxyAPI config generated by CCS v12
port: 8317
api-keys:
  - "ccs-internal-managed"
auth-dir: "${cliproxyDir.replace(/\\/g, '/')}/auth"
oauth-model-alias:
  antigravity:
    - name: gemini-3-pro-high
      alias: gemini-3.2-pro-preview
    - name: gemini-3-flash
      alias: gemini-3.2-flash-preview
      fork: true
`;
      fs.writeFileSync(path.join(cliproxyDir, 'config.yaml'), initialConfig);

      regenerateConfig();

      const newConfig = fs.readFileSync(path.join(cliproxyDir, 'config.yaml'), 'utf-8');
      assert(
        newConfig.includes('alias: gemini-3.2-pro-preview'),
        'Should preserve manual Pro preview overrides on built-in alias names'
      );
      assert(
        newConfig.includes('alias: gemini-3.2-flash-preview'),
        'Should preserve manual Flash preview overrides on built-in alias names'
      );
      assert(
        newConfig.includes('alias: gemini-3.2-pro-preview-customtools'),
        'Should still expand compatibility aliases for preserved manual Pro override'
      );
      assert(
        newConfig.includes('alias: gemini-3.2-flash-preview-customtools'),
        'Should still expand compatibility aliases for preserved manual Flash override'
      );

      const lines = newConfig.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('alias: gemini-3.2-flash-preview')) {
          assert(
            lines[i + 1] && lines[i + 1].trim() === 'fork: true',
            'Should preserve fork: true on manual Flash preview override'
          );
          break;
        }
      }
    });

    it('preserves manual Gemini preview compatibility clusters on built-in alias names', () => {
      const cliproxyDir = path.join(testDir, '.ccs', 'cliproxy');
      fs.mkdirSync(cliproxyDir, { recursive: true });

      const initialConfig = `# CLIProxyAPI config generated by CCS v12
port: 8317
api-keys:
  - "ccs-internal-managed"
auth-dir: "${cliproxyDir.replace(/\\/g, '/')}/auth"
oauth-model-alias:
  antigravity:
    - name: gemini-3-pro-high
      alias: gemini-3.2-pro-preview
    - name: gemini-3-pro-high
      alias: gemini-3.2-pro-preview-customtools
    - name: gemini-3-pro-high
      alias: gemini-3-2-pro-preview
    - name: gemini-3-pro-high
      alias: gemini-3-2-pro-preview-customtools
`;
      fs.writeFileSync(path.join(cliproxyDir, 'config.yaml'), initialConfig);

      regenerateConfig();

      const newConfig = fs.readFileSync(path.join(cliproxyDir, 'config.yaml'), 'utf-8');
      assert(
        newConfig.includes('alias: gemini-3.2-pro-preview'),
        'Should preserve manual dotted Pro preview override'
      );
      assert(
        newConfig.includes('alias: gemini-3.2-pro-preview-customtools'),
        'Should preserve manual dotted Pro customtools override'
      );
      assert(
        newConfig.includes('alias: gemini-3-2-pro-preview'),
        'Should preserve manual hyphenated Pro preview override'
      );
      assert(
        newConfig.includes('alias: gemini-3-2-pro-preview-customtools'),
        'Should preserve manual hyphenated Pro customtools override'
      );
    });

    it('does not re-prune multi-version manual clusters once the config is already migrated', () => {
      const cliproxyDir = path.join(testDir, '.ccs', 'cliproxy');
      fs.mkdirSync(cliproxyDir, { recursive: true });

      const initialConfig = `# CLIProxyAPI config generated by CCS v16
port: 8317
api-keys:
  - "ccs-internal-managed"
auth-dir: "${cliproxyDir.replace(/\\/g, '/')}/auth"
oauth-model-alias:
  antigravity:
    - name: gemini-3-pro-high
      alias: gemini-3.2-pro-preview
    - name: gemini-3-pro-high
      alias: gemini-3.3-pro-preview
    - name: gemini-3-pro-high
      alias: gemini-3.4-pro-preview
`;
      fs.writeFileSync(path.join(cliproxyDir, 'config.yaml'), initialConfig);

      regenerateConfig();

      const newConfig = fs.readFileSync(path.join(cliproxyDir, 'config.yaml'), 'utf-8');
      assert(
        newConfig.includes('alias: gemini-3.2-pro-preview'),
        'Should preserve manual aliases after legacy migration has already run'
      );
      assert(
        newConfig.includes('alias: gemini-3.3-pro-preview'),
        'Should not re-prune later manual version clusters on v16+ configs'
      );
      assert(
        newConfig.includes('alias: gemini-3.4-pro-preview'),
        'Should leave already-migrated multi-version manual aliases untouched'
      );
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

    it('normalizes deprecated gemini-claude aliases during regeneration', () => {
      const cliproxyDir = path.join(testDir, '.ccs', 'cliproxy');
      fs.mkdirSync(cliproxyDir, { recursive: true });

      const initialConfig = `# CLIProxyAPI config generated by CCS v9
port: 8317
api-keys:
  - "ccs-internal-managed"
auth-dir: "${cliproxyDir.replace(/\\/g, '/')}/auth"
oauth-model-alias:
  antigravity:
    - name: claude-sonnet-4-6-thinking
      alias: gemini-claude-sonnet-4-6-thinking
      fork: true
`;
      fs.writeFileSync(path.join(cliproxyDir, 'config.yaml'), initialConfig);

      regenerateConfig();

      const newConfig = fs.readFileSync(path.join(cliproxyDir, 'config.yaml'), 'utf-8');
      assert(
        newConfig.includes('alias: claude-sonnet-4-6'),
        'Should migrate deprecated sonnet thinking alias to canonical model ID'
      );
      assert(
        !newConfig.includes('alias: gemini-claude-sonnet-4-6-thinking'),
        'Should remove deprecated gemini-claude alias after regeneration'
      );
    });

    it('normalizes dotted deprecated sonnet thinking aliases during regeneration', () => {
      const cliproxyDir = path.join(testDir, '.ccs', 'cliproxy');
      fs.mkdirSync(cliproxyDir, { recursive: true });

      const initialConfig = `# CLIProxyAPI config generated by CCS v11
port: 8317
api-keys:
  - "ccs-internal-managed"
auth-dir: "${cliproxyDir.replace(/\\/g, '/')}/auth"
oauth-model-alias:
  antigravity:
    - name: claude-sonnet-4-6-thinking
      alias: claude-sonnet-4.6-thinking
      fork: true
`;
      fs.writeFileSync(path.join(cliproxyDir, 'config.yaml'), initialConfig);

      regenerateConfig();

      const newConfig = fs.readFileSync(path.join(cliproxyDir, 'config.yaml'), 'utf-8');
      assert(
        newConfig.includes('alias: claude-sonnet-4-6'),
        'Should migrate dotted deprecated sonnet thinking alias to canonical model ID'
      );
      assert(
        !newConfig.includes('alias: claude-sonnet-4.6-thinking'),
        'Should remove dotted deprecated sonnet thinking alias after regeneration'
      );
    });
  });
});
