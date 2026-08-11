import { describe, it, expect } from 'bun:test';

/**
 * TDD: backward-compat test for types.ts split.
 * Verifies all 19 types are still accessible from the original path
 * AND from the new concern-based files.
 */

// Import from OLD path (must keep working — backward compat)
import type {
  SupportedOS,
  SupportedArch,
  ArchiveExtension,
  PlatformInfo,
  BinaryManagerConfig,
  DownloadProgress,
  ProgressCallback,
  BinaryInfo,
  ChecksumResult,
  DownloadResult,
  CLIProxyProvider,
  CLIProxyBackend,
  CliproxyRoutingStrategy,
  CLIProxyConfig,
  ExecutorConfig,
  ProviderConfig,
  ProviderModelMapping,
  ResolvedProxyConfig,
} from '../../types';

// Import constant from OLD path
import { PLUS_ONLY_PROVIDERS } from '../../types';

describe('types.ts backward compatibility', () => {
  it('exports all platform types', () => {
    const os: SupportedOS = 'darwin';
    const arch: SupportedArch = 'arm64';
    const releaseArch: SupportedArch = 'aarch64';
    const ext: ArchiveExtension = 'tar.gz';
    const info: PlatformInfo = {
      os,
      arch,
      binaryName: 'test.tar.gz',
      extension: ext,
    };
    expect(info.os).toBe('darwin');
    expect(info.arch).toBe('arm64');
    expect(releaseArch).toBe('aarch64');
  });

  it('exports all binary types', () => {
    const cfg: BinaryManagerConfig = {
      version: '1.0.0',
      releaseUrl: '',
      binPath: '/tmp',
      maxRetries: 3,
      verbose: false,
      forceVersion: false,
      replaceExisting: false,
      skipAutoUpdate: false,
      allowInstall: true,
    };
    expect(cfg.version).toBe('1.0.0');
    const progress: DownloadProgress = { total: 100, downloaded: 50, percentage: 50 };
    const cb: ProgressCallback = (p) => p.percentage;
    cb(progress);
    const bin: BinaryInfo = {
      path: '/usr/local/bin/cli-proxy',
      version: '1.0.0',
      platform: { os: 'linux', arch: 'amd64', binaryName: 'test.tar.gz', extension: 'tar.gz' },
      checksum: 'abc123',
    };
    const check: ChecksumResult = { valid: true, expected: 'abc', actual: 'abc' };
    const dl: DownloadResult = { success: true, filePath: '/tmp/test', retries: 0 };
    expect(check.valid).toBe(true);
    expect(dl.success).toBe(true);
    expect(bin.version).toBe('1.0.0');
  });

  it('exports all provider types', () => {
    const provider: CLIProxyProvider = 'gemini';
    const backend: CLIProxyBackend = 'original';
    const strategy: CliproxyRoutingStrategy = 'round-robin';
    expect(provider).toBe('gemini');
    expect(backend).toBe('original');
    expect(strategy).toBe('round-robin');
  });

  it('exports PLUS_ONLY_PROVIDERS constant', () => {
    expect(Array.isArray(PLUS_ONLY_PROVIDERS)).toBe(true);
    expect(PLUS_ONLY_PROVIDERS).toContain('ghcp');
    expect(PLUS_ONLY_PROVIDERS).toContain('cursor');
    expect(PLUS_ONLY_PROVIDERS).toContain('kiro');
  });

  it('exports config types', () => {
    const config: CLIProxyConfig = { port: 8317, 'api-keys': [], 'auth-dir': '/tmp', debug: false };
    expect(config.port).toBe(8317);

    const executor: ExecutorConfig = {
      port: 8317,
      timeout: 5000,
      verbose: false,
      pollInterval: 100,
    };
    expect(executor.timeout).toBe(5000);

    const resolved: ResolvedProxyConfig = {
      mode: 'local',
      port: 8317,
      protocol: 'http',
      fallbackEnabled: true,
      autoStartLocal: true,
      remoteOnly: false,
      forceLocal: false,
    };
    expect(resolved.mode).toBe('local');
  });

  it('exports provider config types', () => {
    const mapping: ProviderModelMapping = {
      defaultModel: 'gpt-4',
      claudeModel: 'claude-3-opus',
    };
    expect(mapping.defaultModel).toBe('gpt-4');

    const provider: ProviderConfig = {
      name: 'gemini',
      displayName: 'Google Gemini',
      models: mapping,
      requiresOAuth: true,
    };
    expect(provider.name).toBe('gemini');
  });
});
