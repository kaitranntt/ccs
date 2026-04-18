/**
 * Config Generator Port Tests
 *
 * Tests for per-port configuration in config-generator.ts.
 * Verifies port-specific config files (config-{port}.yaml) and path generation.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Set test isolation environment before importing
const testHome = path.join(
  os.tmpdir(),
  `ccs-test-config-port-${Date.now()}-${Math.random().toString(36).slice(2)}`
);
process.env.CCS_HOME = testHome;

const {
  getConfigPathForPort,
  getCliproxyConfigPath,
  generateConfig,
  regenerateConfig,
  configExists,
  deleteConfigForPort,
  deleteConfig,
  CLIPROXY_DEFAULT_PORT,
} = require('../../../dist/cliproxy/config-generator');

describe('Config Generator Port', function () {
  let cliproxyDir;

  beforeEach(function () {
    // Create test directories
    cliproxyDir = path.join(testHome, '.ccs', 'cliproxy');
    fs.mkdirSync(cliproxyDir, { recursive: true });

    // Clean up any existing config files
    try {
      const files = fs.readdirSync(cliproxyDir);
      for (const file of files) {
        if (file.startsWith('config')) {
          fs.unlinkSync(path.join(cliproxyDir, file));
        }
      }
    } catch {
      // Directory might not exist yet
    }
  });

  afterEach(function () {
    // Clean up config files
    try {
      const files = fs.readdirSync(cliproxyDir);
      for (const file of files) {
        if (file.startsWith('config')) {
          fs.unlinkSync(path.join(cliproxyDir, file));
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  afterAll(function () {
    // Clean up test directory
    try {
      fs.rmSync(testHome, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    delete process.env.CCS_HOME;
  });

  describe('getConfigPathForPort', function () {
    it('returns config.yaml for default port (8317)', function () {
      const configPath = getConfigPathForPort(CLIPROXY_DEFAULT_PORT);
      const filename = path.basename(configPath);
      assert.ok(configPath.endsWith('config.yaml'), `Expected path to end with config.yaml but got: ${configPath}`);
      assert.strictEqual(filename, 'config.yaml', `Expected filename to be config.yaml but got: ${filename}`);
    });

    it('returns config-{port}.yaml for variant ports', function () {
      const variantPort = 8318;
      const configPath = getConfigPathForPort(variantPort);
      assert.ok(configPath.endsWith(`config-${variantPort}.yaml`));
    });

    it('example: port 8318 -> config-8318.yaml', function () {
      const configPath = getConfigPathForPort(8318);
      assert.ok(configPath.endsWith('config-8318.yaml'));
    });

    it('example: port 8417 -> config-8417.yaml', function () {
      const configPath = getConfigPathForPort(8417);
      assert.ok(configPath.endsWith('config-8417.yaml'));
    });
  });

  describe('getCliproxyConfigPath', function () {
    it('returns path for default port', function () {
      const configPath = getCliproxyConfigPath();
      const defaultPath = getConfigPathForPort(CLIPROXY_DEFAULT_PORT);
      assert.strictEqual(configPath, defaultPath);
    });
  });

  describe('generateConfig', function () {
    it('creates config-{port}.yaml for non-default port', function () {
      const variantPort = 8318;
      generateConfig('gemini', variantPort);

      const configPath = path.join(cliproxyDir, `config-${variantPort}.yaml`);
      assert.ok(fs.existsSync(configPath), 'Should create config-8318.yaml');
    });

    it('creates config.yaml for default port', function () {
      generateConfig('gemini', CLIPROXY_DEFAULT_PORT);

      const configPath = path.join(cliproxyDir, 'config.yaml');
      assert.ok(fs.existsSync(configPath), 'Should create config.yaml');
    });

    it('only creates if file does not exist (idempotent)', function () {
      const variantPort = 8318;
      const configPath = path.join(cliproxyDir, `config-${variantPort}.yaml`);

      // Create config first time
      generateConfig('gemini', variantPort);
      const stat1 = fs.statSync(configPath);

      // Wait a tiny bit and try again
      const originalContent = fs.readFileSync(configPath, 'utf-8');
      generateConfig('gemini', variantPort);
      const newContent = fs.readFileSync(configPath, 'utf-8');

      // Content should be the same (not regenerated)
      assert.strictEqual(originalContent, newContent);
    });

    it('sets correct port in config content', function () {
      const variantPort = 8320;
      generateConfig('gemini', variantPort);

      const configPath = path.join(cliproxyDir, `config-${variantPort}.yaml`);
      const content = fs.readFileSync(configPath, 'utf-8');

      // Check that port is set correctly
      assert.ok(content.includes(`port: ${variantPort}`));
    });
  });

  describe('regenerateConfig', function () {
    it('regenerates config-{port}.yaml with updated version', function () {
      const variantPort = 8318;
      const configPath = path.join(cliproxyDir, `config-${variantPort}.yaml`);

      // Create initial config
      generateConfig('gemini', variantPort);
      const originalContent = fs.readFileSync(configPath, 'utf-8');

      // Modify the file
      fs.writeFileSync(configPath, '# modified content\n' + originalContent);

      // Regenerate
      regenerateConfig(variantPort);
      const newContent = fs.readFileSync(configPath, 'utf-8');

      // Should not contain our modification
      assert.ok(!newContent.includes('# modified content'));
    });

    it('preserves port value from existing config', function () {
      const variantPort = 8325;
      const configPath = path.join(cliproxyDir, `config-${variantPort}.yaml`);

      // Create config with specific port
      generateConfig('gemini', variantPort);

      // Regenerate
      regenerateConfig(variantPort);
      const content = fs.readFileSync(configPath, 'utf-8');

      // Port should still be 8325
      assert.ok(content.includes(`port: ${variantPort}`));
    });

    it('honors an explicit config path override', function () {
      const variantPort = 8318;
      const overrideDir = path.join(testHome, '.ccs-scope-override', 'cliproxy');
      const overrideConfigPath = path.join(overrideDir, `config-${variantPort}.yaml`);
      const overrideAuthDir = path.join(overrideDir, 'auth');

      regenerateConfig(variantPort, {
        configPath: overrideConfigPath,
        authDir: overrideAuthDir,
      });

      assert.ok(fs.existsSync(overrideConfigPath), 'Should create config at the override path');
      assert.ok(fs.existsSync(overrideAuthDir), 'Should create auth dir at the override path');

      const defaultConfigPath = path.join(cliproxyDir, `config-${variantPort}.yaml`);
      assert.strictEqual(fs.existsSync(defaultConfigPath), false);
    });
  });

  describe('deleteConfigForPort', function () {
    it('deletes config-{port}.yaml for specified port', function () {
      const variantPort = 8318;
      generateConfig('gemini', variantPort);

      const configPath = path.join(cliproxyDir, `config-${variantPort}.yaml`);
      assert.ok(fs.existsSync(configPath));

      deleteConfigForPort(variantPort);
      assert.strictEqual(fs.existsSync(configPath), false);
    });

    it('does nothing if file does not exist', function () {
      // Should not throw
      deleteConfigForPort(8399);
    });

    it('does not affect other port configs', function () {
      const port1 = 8318;
      const port2 = 8319;

      generateConfig('gemini', port1);
      generateConfig('gemini', port2);

      deleteConfigForPort(port1);

      const config1Path = path.join(cliproxyDir, `config-${port1}.yaml`);
      const config2Path = path.join(cliproxyDir, `config-${port2}.yaml`);

      assert.strictEqual(fs.existsSync(config1Path), false);
      assert.ok(fs.existsSync(config2Path));
    });
  });

  describe('deleteConfig', function () {
    it('deletes config.yaml for default port', function () {
      generateConfig('gemini', CLIPROXY_DEFAULT_PORT);

      const configPath = path.join(cliproxyDir, 'config.yaml');
      assert.ok(fs.existsSync(configPath));

      deleteConfig();
      assert.strictEqual(fs.existsSync(configPath), false);
    });
  });

  describe('configExists', function () {
    it('returns true if config-{port}.yaml exists', function () {
      const variantPort = 8318;
      generateConfig('gemini', variantPort);

      assert.strictEqual(configExists(variantPort), true);
    });

    it('returns false if config-{port}.yaml missing', function () {
      const variantPort = 8399;
      assert.strictEqual(configExists(variantPort), false);
    });

    it('returns true for default port config', function () {
      generateConfig('gemini', CLIPROXY_DEFAULT_PORT);
      assert.strictEqual(configExists(CLIPROXY_DEFAULT_PORT), true);
    });
  });

  describe('Multiple Port Configs', function () {
    it('can create configs for multiple ports simultaneously', function () {
      const ports = [8318, 8319, 8320, CLIPROXY_DEFAULT_PORT];

      for (const port of ports) {
        generateConfig('gemini', port);
      }

      // All should exist
      for (const port of ports) {
        assert.ok(configExists(port), `Config for port ${port} should exist`);
      }
    });

    it('each port config has correct port value', function () {
      const ports = [8318, 8319, 8320];

      for (const port of ports) {
        generateConfig('gemini', port);
        const configPath = getConfigPathForPort(port);
        const content = fs.readFileSync(configPath, 'utf-8');
        assert.ok(content.includes(`port: ${port}`), `Config should have port: ${port}`);
      }
    });
  });
});
