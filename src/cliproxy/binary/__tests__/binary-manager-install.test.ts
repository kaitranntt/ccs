import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let originalCcsHome: string | undefined;
let tempHome = '';

beforeEach(() => {
  originalCcsHome = process.env.CCS_HOME;
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-binary-manager-'));
  process.env.CCS_HOME = tempHome;
});

afterEach(() => {
  if (originalCcsHome !== undefined) {
    process.env.CCS_HOME = originalCcsHome;
  } else {
    delete process.env.CCS_HOME;
  }

  if (tempHome && fs.existsSync(tempHome)) {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

describe('installCliproxyVersion', () => {
  it('keeps explicit plus backend requests on plus before install flows run', async () => {
    let seenBackend: string | undefined;

    const binaryManager = await import(
      `../../binary-manager?binary-manager-explicit-plus=${Date.now()}`
    );

    await binaryManager.installCliproxyVersion('6.7.1', false, 'plus', {
      createManager: (_config: unknown, backend: string) => {
        seenBackend = backend;
        return {
          isBinaryInstalled: () => false,
          deleteBinary: () => undefined,
          ensureBinary: async () => '/tmp/ccs-bin/plus/cliproxy',
        };
      },
      stopProxyFn: async () => ({ stopped: false, error: 'No active CLIProxy session found' }),
      waitForPortFreeFn: async () => true,
      formatInfo: (message: string) => message,
      formatWarn: (message: string) => message,
      getInstalledVersion: () => '6.6.80',
    });

    expect(seenBackend).toBe('plus');
  });

  it('returns plus and emits an informational notice when plus backend is resolved locally', async () => {
    const binaryManager = await import(`../../binary-manager?binary-manager-warning=${Date.now()}`);

    const writes: string[] = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    }) as typeof process.stderr.write;

    try {
      expect(binaryManager.resolveLocalBackend('plus', { notifyOnPlus: true })).toBe('plus');
    } finally {
      process.stderr.write = originalWrite;
    }

    expect(writes.join('')).toContain('optional community-maintained CLIProxyAPIPlus backend');
    expect(writes.join('')).toContain('backend: original');
    expect(writes.join('')).toContain('kaitranntt/CLIProxyAPIPlus');
  });

  it('uses plus binary and pin state when local runtime is configured for plus', async () => {
    const { createEmptyUnifiedConfig } = await import('../../../config/unified-config-types');
    const { saveUnifiedConfig } = await import('../../../config/unified-config-loader');
    const { savePinnedVersion } = await import('../version-cache');
    const { getExecutableName } = await import('../platform-detector');
    const binaryService = await import(
      `../../services/binary-service?binary-service-plus-migration=${Date.now()}`
    );

    const config = createEmptyUnifiedConfig();
    config.cliproxy = { ...config.cliproxy, backend: 'plus' };
    saveUnifiedConfig(config);

    const plusBinDir = path.join(tempHome, '.ccs', 'cliproxy', 'bin', 'plus');
    fs.mkdirSync(plusBinDir, { recursive: true });
    fs.writeFileSync(path.join(plusBinDir, getExecutableName('plus')), 'fake-binary');
    fs.writeFileSync(path.join(plusBinDir, '.version'), '6.6.80-0');
    savePinnedVersion('6.6.80-0', 'plus');

    const status = binaryService.getBinaryStatus();

    expect(status.installed).toBe(true);
    expect(status.pinnedVersion).toBe('6.6.80-0');
    expect(status.binaryPath).toContain('/plus/');
  });

  it('copies plus binary and pin state when legacy deleted upstream fallback is active', async () => {
    const { createEmptyUnifiedConfig } = await import('../../../config/unified-config-types');
    const { saveUnifiedConfig } = await import('../../../config/unified-config-loader');
    const { savePinnedVersion } = await import('../version-cache');
    const platformDetector = await import('../platform-detector');
    const binaryService = await import(
      `../../services/binary-service?binary-service-legacy-plus-fallback=${Date.now()}`
    );

    const plusConfig = platformDetector.BACKEND_CONFIG.plus as unknown as { repo: string };
    const originalRepo = plusConfig.repo;

    try {
      plusConfig.repo = 'router-for-me/CLIProxyAPIPlus';

      const config = createEmptyUnifiedConfig();
      config.cliproxy = { ...config.cliproxy, backend: 'plus' };
      saveUnifiedConfig(config);

      const plusBinDir = path.join(tempHome, '.ccs', 'cliproxy', 'bin', 'plus');
      fs.mkdirSync(plusBinDir, { recursive: true });
      fs.writeFileSync(
        path.join(plusBinDir, platformDetector.getExecutableName('plus')),
        'fake-binary'
      );
      fs.writeFileSync(path.join(plusBinDir, '.version'), '6.6.80-0');
      savePinnedVersion('6.6.80-0', 'plus');

      const status = binaryService.getBinaryStatus();

      expect(status.installed).toBe(true);
      expect(status.pinnedVersion).toBe('6.6.80-0');
      expect(status.binaryPath).toContain('/original/');
    } finally {
      plusConfig.repo = originalRepo;
    }
  });

  it('attempts to stop the proxy even when there is no tracked running session', async () => {
    const calls = {
      stopProxy: 0,
      waitForPortFree: 0,
      deleteBinary: 0,
      ensureBinary: 0,
    };

    const binaryManager = await import(`../../binary-manager?binary-manager-install=${Date.now()}`);

    await binaryManager.installCliproxyVersion('6.7.1', false, 'plus', {
      createManager: () => ({
        isBinaryInstalled: () => false,
        deleteBinary: () => {
          calls.deleteBinary += 1;
        },
        ensureBinary: async () => {
          calls.ensureBinary += 1;
          return '/tmp/ccs-bin/plus/cliproxy';
        },
      }),
      stopProxyFn: async () => {
        calls.stopProxy += 1;
        return { stopped: false, error: 'No active CLIProxy session found' };
      },
      waitForPortFreeFn: async () => {
        calls.waitForPortFree += 1;
        return true;
      },
      formatInfo: (message: string) => message,
      formatWarn: (message: string) => message,
      getInstalledVersion: () => '6.6.80',
    });

    expect(calls.stopProxy).toBe(1);
    expect(calls.waitForPortFree).toBe(0);
    expect(calls.deleteBinary).toBe(0);
    expect(calls.ensureBinary).toBe(1);
  });

  it('keeps the installed binary in place while the replacement is prepared', async () => {
    const calls = {
      deleteBinary: 0,
      ensureBinary: 0,
    };

    const binaryManager = await import(
      `../../binary-manager?binary-manager-atomic-install=${Date.now()}`
    );

    await binaryManager.installCliproxyVersion('6.7.1', false, 'plus', {
      createManager: () => ({
        isBinaryInstalled: () => true,
        deleteBinary: () => {
          calls.deleteBinary += 1;
        },
        ensureBinary: async () => {
          calls.ensureBinary += 1;
          return '/tmp/ccs-bin/plus/cli-proxy-api-plus';
        },
      }),
      stopProxyFn: async () => ({ stopped: false, error: 'No active CLIProxy session found' }),
      waitForPortFreeFn: async () => true,
      formatInfo: (message: string) => message,
      formatWarn: (message: string) => message,
      getInstalledVersion: () => '6.6.80',
    });

    expect(calls.deleteBinary).toBe(0);
    expect(calls.ensureBinary).toBe(1);
  });

  it('waits for the port that was actually stopped before continuing install', async () => {
    let waitedPort: number | undefined;

    const binaryManager = await import(
      `../../binary-manager?binary-manager-stopped-port=${Date.now()}`
    );

    await binaryManager.installCliproxyVersion('6.7.1', false, 'plus', {
      createManager: () => ({
        isBinaryInstalled: () => false,
        deleteBinary: () => undefined,
        ensureBinary: async () => '/tmp/ccs-bin/plus/cliproxy',
      }),
      stopProxyFn: async () => ({ stopped: true, port: 8317 }),
      waitForPortFreeFn: async (port: number) => {
        waitedPort = port;
        return true;
      },
      formatInfo: (message: string) => message,
      formatWarn: (message: string) => message,
      getInstalledVersion: () => '6.6.80',
    });

    expect(waitedPort).toBe(8317);
  });

  it('fails fast when runtime startup forbids installing a missing binary', async () => {
    const binaryManager = await import(`../../binary-manager?binary-manager-runtime=${Date.now()}`);

    await expect(
      binaryManager.ensureCLIProxyBinary(false, {
        allowInstall: false,
        skipAutoUpdate: true,
      })
    ).rejects.toThrow(
      'CLIProxy binary is not installed locally. Run "ccs cliproxy install" when you have network access.'
    );
  });
});
