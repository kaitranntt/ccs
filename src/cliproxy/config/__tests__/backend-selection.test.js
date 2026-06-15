/**
 * Tests for CLIProxy Backend Selection
 * Verifies backend selection feature for original vs plus CLIProxyAPI variants
 */

const assert = require('assert');

describe('Backend Selection', () => {
  const platformDetector = require('../../../../dist/cliproxy/binary/platform-detector');
  const types = require('../../../../dist/cliproxy/types');

  function withMockedProcessPlatform(platform, arch, callback) {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    const originalArch = Object.getOwnPropertyDescriptor(process, 'arch');

    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
    Object.defineProperty(process, 'arch', { value: arch, configurable: true });

    try {
      callback();
    } finally {
      Object.defineProperty(process, 'platform', originalPlatform);
      Object.defineProperty(process, 'arch', originalArch);
    }
  }

  describe('BACKEND_CONFIG', () => {
    it('has correct configuration for original backend', () => {
      const config = platformDetector.BACKEND_CONFIG.original;
      assert.strictEqual(config.repo, 'router-for-me/CLIProxyAPI');
      assert.strictEqual(config.binaryPrefix, 'CLIProxyAPI');
      assert.strictEqual(config.executable, 'cli-proxy-api');
      assert(config.fallbackVersion.match(/^\d+\.\d+\.\d+$/), 'original version has no suffix');
    });

    it('has correct configuration for plus backend', () => {
      const config = platformDetector.BACKEND_CONFIG.plus;
      assert.strictEqual(config.repo, 'kaitranntt/CLIProxyAPIPlus');
      assert.strictEqual(config.binaryPrefix, 'CLIProxyAPIPlus');
      assert.strictEqual(config.executable, 'cli-proxy-api-plus');
      assert(config.fallbackVersion.match(/^\d+\.\d+\.\d+-\d+$/), 'plus version has -0 suffix');
    });
  });

  describe('DEFAULT_BACKEND', () => {
    it('defaults to original backend', () => {
      assert.strictEqual(platformDetector.DEFAULT_BACKEND, 'original');
    });
  });

  describe('detectPlatform', () => {
    it('maps Node arm64 to CLIProxy aarch64 release assets', () => {
      assert.strictEqual(platformDetector.mapNodeArchToReleaseArch('arm64'), 'aarch64');
      assert.strictEqual(platformDetector.mapNodeArchToReleaseArch('x64'), 'amd64');
    });

    it('keeps public ARM64 arch compatibility while using aarch64 release assets', () => {
      withMockedProcessPlatform('darwin', 'arm64', () => {
        const info = platformDetector.detectPlatform('6.10.4', 'original');

        assert.strictEqual(info.arch, 'arm64');
        assert.strictEqual(info.binaryName, 'CLIProxyAPI_6.10.4_darwin_aarch64.tar.gz');
        assert.strictEqual(
          platformDetector.getDownloadUrl('6.10.4', 'original'),
          'https://github.com/router-for-me/CLIProxyAPI/releases/download/v6.10.4/CLIProxyAPI_6.10.4_darwin_aarch64.tar.gz'
        );
      });
    });

    it('generates correct binary name for original backend', () => {
      const info = platformDetector.detectPlatform('6.6.51', 'original');
      assert(info.binaryName.startsWith('CLIProxyAPI_6.6.51_'));
      assert(!info.binaryName.includes('CLIProxyAPIPlus'));
    });

    it('keeps old plus non-Windows archive names unsuffixed', () => {
      withMockedProcessPlatform('darwin', 'arm64', () => {
        assert.strictEqual(
          platformDetector.detectPlatform('6.9.45-0', 'plus').binaryName,
          'CLIProxyAPIPlus_6.9.45-0_darwin_arm64.tar.gz'
        );
        assert.strictEqual(
          platformDetector.detectPlatform('7.1.45-1', 'plus').binaryName,
          'CLIProxyAPIPlus_7.1.45-1_darwin_aarch64.tar.gz'
        );
      });
    });

    it('generates no-plugin archive names for current plus backend on macOS and Linux', () => {
      withMockedProcessPlatform('darwin', 'arm64', () => {
        assert.strictEqual(
          platformDetector.detectPlatform('7.1.68-0', 'plus').binaryName,
          'CLIProxyAPIPlus_7.1.68-0_darwin_aarch64_no-plugin.tar.gz'
        );
        const info = platformDetector.detectPlatform('7.1.68-2', 'plus');
        assert.strictEqual(
          info.binaryName,
          'CLIProxyAPIPlus_7.1.68-2_darwin_aarch64_no-plugin.tar.gz'
        );
        assert.strictEqual(
          platformDetector.getDownloadUrl('7.1.68-2', 'plus'),
          'https://github.com/kaitranntt/CLIProxyAPIPlus/releases/download/v7.1.68-2/CLIProxyAPIPlus_7.1.68-2_darwin_aarch64_no-plugin.tar.gz'
        );
      });

      withMockedProcessPlatform('linux', 'x64', () => {
        const info = platformDetector.detectPlatform('7.1.68-2', 'plus');
        assert.strictEqual(
          info.binaryName,
          'CLIProxyAPIPlus_7.1.68-2_linux_amd64_no-plugin.tar.gz'
        );
      });
    });

    it('does not add no-plugin suffix to plus Windows archives', () => {
      withMockedProcessPlatform('win32', 'x64', () => {
        const info = platformDetector.detectPlatform('7.1.68-2', 'plus');
        assert.strictEqual(info.binaryName, 'CLIProxyAPIPlus_7.1.68-2_windows_amd64.zip');
      });
    });

    it('uses original backend by default', () => {
      const info = platformDetector.detectPlatform();
      assert(info.binaryName.startsWith('CLIProxyAPI_'));
      assert(!info.binaryName.includes('CLIProxyAPIPlus'));
    });

    it('uses fallback version when version not specified', () => {
      const infoOriginal = platformDetector.detectPlatform(undefined, 'original');
      const fallbackOriginal = platformDetector.BACKEND_CONFIG.original.fallbackVersion;
      assert(infoOriginal.binaryName.includes(fallbackOriginal));

      const infoPlus = platformDetector.detectPlatform(undefined, 'plus');
      const fallbackPlus = platformDetector.BACKEND_CONFIG.plus.fallbackVersion;
      assert(infoPlus.binaryName.includes(fallbackPlus));
    });
  });

  describe('getExecutableName', () => {
    const isWindows = process.platform === 'win32';

    it('returns correct name for original backend', () => {
      const name = platformDetector.getExecutableName('original');
      const expected = isWindows ? 'cli-proxy-api.exe' : 'cli-proxy-api';
      assert.strictEqual(name, expected);
    });

    it('returns correct name for plus backend', () => {
      const name = platformDetector.getExecutableName('plus');
      const expected = isWindows ? 'cli-proxy-api-plus.exe' : 'cli-proxy-api-plus';
      assert.strictEqual(name, expected);
    });

    it('defaults to original backend', () => {
      const name = platformDetector.getExecutableName();
      const expected = isWindows ? 'cli-proxy-api.exe' : 'cli-proxy-api';
      assert.strictEqual(name, expected);
    });
  });

  describe('getDownloadUrl', () => {
    it('uses correct repo for original backend', () => {
      const url = platformDetector.getDownloadUrl('6.6.51', 'original');
      assert(url.includes('router-for-me/CLIProxyAPI/releases'));
      assert(!url.includes('CLIProxyAPIPlus'));
    });

    it('uses correct repo for plus backend', () => {
      const url = platformDetector.getDownloadUrl('6.6.51-0', 'plus');
      assert(url.includes('kaitranntt/CLIProxyAPIPlus/releases'));
    });

    it('defaults to original backend', () => {
      const url = platformDetector.getDownloadUrl();
      assert(url.includes('router-for-me/CLIProxyAPI/releases'));
      assert(!url.includes('CLIProxyAPIPlus'));
    });
  });

  describe('getFallbackVersion', () => {
    it('returns correct version for original backend', () => {
      const version = platformDetector.getFallbackVersion('original');
      assert.strictEqual(version, platformDetector.BACKEND_CONFIG.original.fallbackVersion);
    });

    it('returns correct version for plus backend', () => {
      const version = platformDetector.getFallbackVersion('plus');
      assert.strictEqual(version, platformDetector.BACKEND_CONFIG.plus.fallbackVersion);
    });
  });

  describe('PLUS_ONLY_PROVIDERS', () => {
    it('includes kiro as plus-only provider', () => {
      assert(types.PLUS_ONLY_PROVIDERS.includes('kiro'));
    });

    it('includes ghcp as plus-only provider', () => {
      assert(types.PLUS_ONLY_PROVIDERS.includes('ghcp'));
    });

    it('includes the newer CLIProxyAPIPlus providers as plus-only', () => {
      assert(types.PLUS_ONLY_PROVIDERS.includes('cursor'));
      assert(types.PLUS_ONLY_PROVIDERS.includes('gitlab'));
      assert(types.PLUS_ONLY_PROVIDERS.includes('codebuddy'));
      assert(types.PLUS_ONLY_PROVIDERS.includes('kilo'));
    });

    it('does not include gemini as plus-only provider', () => {
      assert(!types.PLUS_ONLY_PROVIDERS.includes('gemini'));
    });

    it('does not include agy as plus-only provider', () => {
      assert(!types.PLUS_ONLY_PROVIDERS.includes('agy'));
    });
  });
});
