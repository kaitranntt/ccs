import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { clearQuotaCache } from '../../../src/cliproxy/quota-response-cache';

afterEach(() => {
  clearQuotaCache();
  mock.restore();
});

function createCodexSettingsFixture(haikuModel: string = 'gpt-5.4-mini'): {
  tmpDir: string;
  settingsPath: string;
} {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-codex-plan-compat-'));
  const settingsPath = path.join(tmpDir, 'codex.settings.json');

  fs.writeFileSync(
    settingsPath,
    JSON.stringify(
      {
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/codex',
          ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
          ANTHROPIC_MODEL: 'gpt-5.3-codex',
          ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-5.3-codex',
          ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-5.3-codex',
          ANTHROPIC_DEFAULT_HAIKU_MODEL: haikuModel,
        },
      },
      null,
      2
    ),
    'utf-8'
  );

  return { tmpDir, settingsPath };
}

async function importCompatibilityModule(cacheTag: string) {
  return import(`../../../src/cliproxy/codex-plan-compatibility?${cacheTag}=${Date.now()}`);
}

const identity = (message: string) => message;

describe('codex plan compatibility reconcile', () => {
  it('keeps saved Codex settings intact and warns about runtime fallback for free-plan accounts', async () => {
    const { tmpDir, settingsPath } = createCodexSettingsFixture('gpt-5.3-codex-spark');
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});

    try {
      const { reconcileCodexModelForActivePlan } = await importCompatibilityModule('free-plan');

      await reconcileCodexModelForActivePlan(
        {
          currentModel: 'gpt-5.3-codex',
          verbose: false,
        },
        {
          getDefaultAccount: () => ({ id: 'free@example.com' }) as never,
          fetchCodexQuota: async () => ({
            success: true,
            windows: [],
            coreUsage: { fiveHour: null, weekly: null },
            planType: 'free',
            lastUpdated: Date.now(),
            accountId: 'free@example.com',
          }),
          formatInfo: identity,
          formatWarn: identity,
        }
      );

      const repaired = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
        env: Record<string, string>;
      };
      expect(repaired.env.ANTHROPIC_MODEL).toBe('gpt-5.3-codex');
      expect(repaired.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('gpt-5.3-codex');
      expect(repaired.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('gpt-5.3-codex');
      expect(repaired.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('gpt-5.3-codex-spark');
      expect(errorSpy).toHaveBeenCalledWith(
        'Codex free plan detected. Keeping saved model "gpt-5.3-codex" in settings; runtime requests will fall back to "gpt-5.5" when needed.'
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('warns and leaves settings untouched when no default Codex account is available', async () => {
    const { tmpDir, settingsPath } = createCodexSettingsFixture();
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});

    try {
      const { reconcileCodexModelForActivePlan } =
        await importCompatibilityModule('missing-default-account');

      await reconcileCodexModelForActivePlan(
        {
          currentModel: 'gpt-5.3-codex',
          verbose: false,
        },
        {
          getDefaultAccount: () => null,
          fetchCodexQuota: async () => {
            throw new Error('should not fetch quota without a default account');
          },
          formatInfo: identity,
          formatWarn: identity,
        }
      );

      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
        env: Record<string, string>;
      };
      expect(settings.env.ANTHROPIC_MODEL).toBe('gpt-5.3-codex');
      expect(errorSpy).toHaveBeenCalledWith(
        'Configured Codex model "gpt-5.3-codex" may require a paid Codex plan. If startup fails, switch to "gpt-5.5" with "ccs codex --config".'
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('keeps paid-plan Codex settings unchanged for plus and team accounts', async () => {
    for (const planType of ['plus', 'team'] as const) {
      const { tmpDir, settingsPath } = createCodexSettingsFixture();
      const errorSpy = spyOn(console, 'error').mockImplementation(() => {});

      try {
        const { reconcileCodexModelForActivePlan } = await importCompatibilityModule(planType);

        await reconcileCodexModelForActivePlan(
          {
            currentModel: 'gpt-5.3-codex',
            verbose: false,
          },
          {
            getDefaultAccount: () => ({ id: `${planType}@example.com` }) as never,
            fetchCodexQuota: async () => ({
              success: true,
              windows: [],
              coreUsage: { fiveHour: null, weekly: null },
              planType,
              lastUpdated: Date.now(),
              accountId: `${planType}@example.com`,
            }),
            formatInfo: identity,
            formatWarn: identity,
          }
        );

        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
          env: Record<string, string>;
        };
        expect(settings.env.ANTHROPIC_MODEL).toBe('gpt-5.3-codex');
        expect(errorSpy).not.toHaveBeenCalled();
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        mock.restore();
      }
    }
  });

  it('warns and keeps settings unchanged when Codex plan verification fails', async () => {
    const { tmpDir, settingsPath } = createCodexSettingsFixture();
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});

    try {
      const { reconcileCodexModelForActivePlan } = await importCompatibilityModule('unknown-plan');

      await reconcileCodexModelForActivePlan(
        {
          currentModel: 'gpt-5.3-codex',
          verbose: false,
        },
        {
          getDefaultAccount: () => ({ id: 'unknown@example.com' }) as never,
          fetchCodexQuota: async () => ({
            success: false,
            windows: [],
            coreUsage: { fiveHour: null, weekly: null },
            planType: null,
            lastUpdated: Date.now(),
            accountId: 'unknown@example.com',
            error: 'network timeout',
          }),
          formatInfo: identity,
          formatWarn: identity,
        }
      );

      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
        env: Record<string, string>;
      };
      expect(settings.env.ANTHROPIC_MODEL).toBe('gpt-5.3-codex');
      expect(errorSpy).toHaveBeenCalledWith(
        'Could not verify Codex plan for model "gpt-5.3-codex". If startup fails with model_not_supported, switch to "gpt-5.5" via "ccs codex --config".'
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('warns and keeps settings unchanged when quota succeeds without a plan type', async () => {
    const { tmpDir, settingsPath } = createCodexSettingsFixture();
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});

    try {
      const { reconcileCodexModelForActivePlan } =
        await importCompatibilityModule('missing-plan-type');

      await reconcileCodexModelForActivePlan(
        {
          currentModel: 'gpt-5.3-codex',
          verbose: false,
        },
        {
          getDefaultAccount: () => ({ id: 'missing-plan@example.com' }) as never,
          fetchCodexQuota: async () => ({
            success: true,
            windows: [],
            coreUsage: { fiveHour: null, weekly: null },
            planType: null,
            lastUpdated: Date.now(),
            accountId: 'missing-plan@example.com',
          }),
          formatInfo: identity,
          formatWarn: identity,
        }
      );

      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
        env: Record<string, string>;
      };
      expect(settings.env.ANTHROPIC_MODEL).toBe('gpt-5.3-codex');
      expect(settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('gpt-5.4-mini');
      expect(errorSpy).toHaveBeenCalledWith(
        'Could not verify Codex plan for model "gpt-5.3-codex". If startup fails with model_not_supported, switch to "gpt-5.5" via "ccs codex --config".'
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
