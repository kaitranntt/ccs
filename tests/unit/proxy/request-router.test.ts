import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  invalidateProxyRequestRouterCache,
  resolveProxyRequestRoute,
} from '../../../src/proxy/request-router';
import { resolveOpenAICompatProfileConfig } from '../../../src/proxy/profile-router';
import { loadSettings } from '../../../src/utils/config-manager';

let originalCcsHome: string | undefined;
let tempDir: string;

function writeSettings(profileName: string, env: Record<string, string>): string {
  const settingsPath = path.join(tempDir, '.ccs', `${profileName}.settings.json`);
  fs.writeFileSync(settingsPath, JSON.stringify({ env }, null, 2), 'utf8');
  return settingsPath;
}

function buildProfile(profileName: string) {
  const settingsPath = path.join(tempDir, '.ccs', `${profileName}.settings.json`);
  const profile = resolveOpenAICompatProfileConfig(
    profileName,
    settingsPath,
    loadSettings(settingsPath).env || {}
  );
  expect(profile).toBeTruthy();
  return profile!;
}

beforeEach(() => {
  originalCcsHome = process.env.CCS_HOME;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-proxy-router-'));
  fs.mkdirSync(path.join(tempDir, '.ccs'), { recursive: true });
});

afterEach(() => {
  invalidateProxyRequestRouterCache();
  if (originalCcsHome !== undefined) {
    process.env.CCS_HOME = originalCcsHome;
  } else {
    delete process.env.CCS_HOME;
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('resolveProxyRequestRoute', () => {
  beforeEach(() => {
    process.env.CCS_HOME = tempDir;

    const profiles = {
      hf: writeSettings('hf', {
        ANTHROPIC_BASE_URL: 'https://router.huggingface.co/v1',
        ANTHROPIC_AUTH_TOKEN: 'hf_token',
        ANTHROPIC_MODEL: 'hf-default',
        CCS_DROID_PROVIDER: 'generic-chat-completion-api',
      }),
      deepseek: writeSettings('deepseek', {
        ANTHROPIC_BASE_URL: 'https://api.deepseek.com/v1',
        ANTHROPIC_AUTH_TOKEN: 'deepseek_token',
        ANTHROPIC_MODEL: 'deepseek-chat',
        CCS_DROID_PROVIDER: 'generic-chat-completion-api',
      }),
      thinker: writeSettings('thinker', {
        ANTHROPIC_BASE_URL: 'https://thinking.example.com/v1',
        ANTHROPIC_AUTH_TOKEN: 'think_token',
        ANTHROPIC_MODEL: 'deepseek-reasoner',
        CCS_DROID_PROVIDER: 'generic-chat-completion-api',
      }),
      search: writeSettings('search', {
        ANTHROPIC_BASE_URL: 'https://search.example.com/v1',
        ANTHROPIC_AUTH_TOKEN: 'search_token',
        ANTHROPIC_MODEL: 'sonar-pro',
        CCS_DROID_PROVIDER: 'generic-chat-completion-api',
      }),
      background: writeSettings('background', {
        ANTHROPIC_BASE_URL: 'https://background.example.com/v1',
        ANTHROPIC_AUTH_TOKEN: 'background_token',
        ANTHROPIC_MODEL: 'qwen-small',
        CCS_DROID_PROVIDER: 'generic-chat-completion-api',
      }),
      long: writeSettings('long', {
        ANTHROPIC_BASE_URL: 'https://long.example.com/v1',
        ANTHROPIC_AUTH_TOKEN: 'long_token',
        ANTHROPIC_MODEL: 'gemini-2.5-pro',
        CCS_DROID_PROVIDER: 'generic-chat-completion-api',
      }),
    };

    fs.writeFileSync(
      path.join(tempDir, '.ccs', 'config.json'),
      JSON.stringify(
        {
          profiles,
          proxy: {
            routing: {
              default: 'hf:hf-default',
              background: 'background:qwen-small',
              think: 'thinker:deepseek-reasoner',
              longContext: 'long:gemini-2.5-pro',
              longContextThreshold: 10,
              webSearch: 'search:sonar-pro',
            },
          },
        },
        null,
        2
      ),
      'utf8'
    );
  });

  it('uses explicit profile:model selectors', () => {
    const route = resolveProxyRequestRoute(buildProfile('hf'), {
      model: 'deepseek:deepseek-reasoner',
      stream: true,
      messages: [{ role: 'user', content: 'plan this' }],
    });

    expect(route.profile.profileName).toBe('deepseek');
    expect(route.model).toBe('deepseek-reasoner');
    expect(route.source).toBe('explicit-profile');
  });

  it('matches plain model ids to the profile that owns them', () => {
    const route = resolveProxyRequestRoute(buildProfile('hf'), {
      model: 'deepseek-chat',
      stream: true,
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(route.profile.profileName).toBe('deepseek');
    expect(route.model).toBe('deepseek-chat');
    expect(route.source).toBe('profile-model-match');
  });

  it('does not fuzzy-match plain model ids', () => {
    const route = resolveProxyRequestRoute(buildProfile('hf'), {
      model: 'deepseek-chat-v2',
      stream: true,
      messages: [{ role: 'user', content: 'hello' }],
    });
    expect(route.profile.profileName).toBe('hf');
    expect(route.source).toBe('request-model');
  });

  it('routes thinking requests through the configured think scenario', () => {
    const route = resolveProxyRequestRoute(buildProfile('hf'), {
      model: 'hf-default',
      stream: true,
      reasoning_effort: 'high',
      reasoning: { enabled: true, effort: 'high' },
      messages: [{ role: 'user', content: 'work this out carefully' }],
    });

    expect(route.profile.profileName).toBe('thinker');
    expect(route.model).toBe('deepseek-reasoner');
    expect(route.scenario).toBe('think');
    expect(route.source).toBe('scenario');
  });

  it('routes long-context requests through the configured longContext scenario', () => {
    const route = resolveProxyRequestRoute(buildProfile('hf'), {
      model: 'hf-default',
      stream: true,
      messages: [{ role: 'user', content: 'x'.repeat(120) }],
    });

    expect(route.profile.profileName).toBe('long');
    expect(route.model).toBe('gemini-2.5-pro');
    expect(route.scenario).toBe('longContext');
    expect(route.estimatedTokens).toBeGreaterThan(10);
  });

  it('routes web_search tool requests through the configured webSearch scenario', () => {
    const route = resolveProxyRequestRoute(buildProfile('hf'), {
      model: 'hf-default',
      stream: true,
      messages: [{ role: 'user', content: 'search the docs' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'web_search',
            parameters: { type: 'object' },
          },
        },
      ],
    });

    expect(route.profile.profileName).toBe('search');
    expect(route.model).toBe('sonar-pro');
    expect(route.scenario).toBe('webSearch');
  });

  it('routes haiku requests through the configured background scenario', () => {
    const route = resolveProxyRequestRoute(buildProfile('hf'), {
      model: 'claude-3-haiku',
      stream: true,
      messages: [{ role: 'user', content: 'run this in the background' }],
    });

    expect(route.profile.profileName).toBe('background');
    expect(route.model).toBe('qwen-small');
    expect(route.scenario).toBe('background');
  });

  it('caches parsed config and profile settings across repeated requests until files change', () => {
    const activeProfile = buildProfile('hf');
    const readSpy = spyOn(fs, 'readFileSync');

    try {
      const firstRoute = resolveProxyRequestRoute(activeProfile, {
        model: 'deepseek-chat',
        stream: true,
        messages: [{ role: 'user', content: 'first' }],
      });
      const readsAfterWarmup = readSpy.mock.calls.length;
      expect(readsAfterWarmup).toBeGreaterThan(0);
      expect(firstRoute.profile.profileName).toBe('deepseek');

      const secondRoute = resolveProxyRequestRoute(activeProfile, {
        model: 'deepseek-chat',
        stream: true,
        messages: [{ role: 'user', content: 'second' }],
      });
      expect(secondRoute.profile.profileName).toBe('deepseek');
      expect(readSpy.mock.calls.length).toBe(readsAfterWarmup);

      // Modify a profile settings file and ensure mtime/size change invalidates cache
      const deepseekPath = writeSettings('deepseek', {
        ANTHROPIC_BASE_URL: 'https://api.deepseek.com/v1',
        ANTHROPIC_AUTH_TOKEN: 'deepseek_token',
        ANTHROPIC_MODEL: 'deepseek-v3-updated',
        CCS_DROID_PROVIDER: 'generic-chat-completion-api',
      });
      const futureTime = new Date(Date.now() + 5000);
      fs.utimesSync(deepseekPath, futureTime, futureTime);

      const thirdRoute = resolveProxyRequestRoute(activeProfile, {
        model: 'deepseek-v3-updated',
        stream: true,
        messages: [{ role: 'user', content: 'third' }],
      });
      expect(thirdRoute.profile.profileName).toBe('deepseek');
      expect(thirdRoute.source).toBe('profile-model-match');
      expect(readSpy.mock.calls.length).toBeGreaterThan(readsAfterWarmup);

      const readsAfterSettingsUpdate = readSpy.mock.calls.length;
      const configPath = path.join(tempDir, '.ccs', 'config.json');
      const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
        profiles: Record<string, string>;
        proxy: { routing: Record<string, unknown> };
      };
      rawConfig.proxy.routing.think = 'deepseek:deepseek-v3-updated';
      fs.writeFileSync(configPath, JSON.stringify(rawConfig, null, 2), 'utf8');
      const configFuture = new Date(Date.now() + 10000);
      fs.utimesSync(configPath, configFuture, configFuture);

      const fourthRoute = resolveProxyRequestRoute(activeProfile, {
        model: 'hf-default',
        stream: true,
        reasoning_effort: 'high',
        messages: [{ role: 'user', content: 'think' }],
      });
      expect(fourthRoute.profile.profileName).toBe('deepseek');
      expect(fourthRoute.scenario).toBe('think');
      expect(readSpy.mock.calls.length).toBeGreaterThan(readsAfterSettingsUpdate);
    } finally {
      readSpy.mockRestore();
    }
  });

  it('invalidates profile cache when CCS_CONFIG points to a different config file', () => {
    const activeProfile = buildProfile('hf');
    const originalCcsConfig = process.env.CCS_CONFIG;
    const overridePath = path.join(tempDir, 'override-config.json');
    const altSettingsPath = writeSettings('alt', {
      ANTHROPIC_BASE_URL: 'https://alt.example.com/v1',
      ANTHROPIC_AUTH_TOKEN: 'alt_token',
      ANTHROPIC_MODEL: 'alt-model-only',
      CCS_DROID_PROVIDER: 'generic-chat-completion-api',
    });

    try {
      const beforeOverride = resolveProxyRequestRoute(activeProfile, {
        model: 'alt-model-only',
        stream: true,
        messages: [{ role: 'user', content: 'before' }],
      });
      expect(beforeOverride.source).toBe('request-model');

      fs.writeFileSync(
        overridePath,
        JSON.stringify({
          profiles: {
            hf: path.join(tempDir, '.ccs', 'hf.settings.json'),
            alt: altSettingsPath,
          },
        }),
        'utf8'
      );
      process.env.CCS_CONFIG = overridePath;

      const afterOverride = resolveProxyRequestRoute(activeProfile, {
        model: 'alt-model-only',
        stream: true,
        messages: [{ role: 'user', content: 'after' }],
      });
      expect(afterOverride.profile.profileName).toBe('alt');
      expect(afterOverride.source).toBe('profile-model-match');
    } finally {
      if (originalCcsConfig === undefined) {
        delete process.env.CCS_CONFIG;
      } else {
        process.env.CCS_CONFIG = originalCcsConfig;
      }
    }
  });
});
