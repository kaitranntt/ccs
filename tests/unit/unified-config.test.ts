/**
 * Unit tests for unified config module
 */
import { describe, it, expect } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Import only modules without transitive dependencies on config-manager
import {
  isReservedName,
  validateProfileName,
  RESERVED_PROFILE_NAMES,
} from '../../src/config/reserved-names';
import {
  createEmptyUnifiedConfig,
  isUnifiedConfig,
  UNIFIED_CONFIG_VERSION,
} from '../../src/config/unified-config-types';
import { isUnifiedConfigEnabled } from '../../src/config/feature-flags';
import { loadOrCreateUnifiedConfig } from '../../src/config/unified-config-loader';

// Inline helper to test secret key detection (utility kept for potential reuse)
function isSecretKey(key: string): boolean {
  const upper = key.toUpperCase();
  const secretPatterns = [
    'TOKEN',
    'SECRET',
    'API_KEY',
    'APIKEY',
    'PASSWORD',
    'CREDENTIAL',
    'AUTH',
    'PRIVATE',
  ];
  return secretPatterns.some((pattern) => upper.includes(pattern));
}

describe('reserved-names', () => {
  describe('RESERVED_PROFILE_NAMES', () => {
    it('should include CLIProxy providers', () => {
      expect(RESERVED_PROFILE_NAMES).toContain('gemini');
      expect(RESERVED_PROFILE_NAMES).toContain('codex');
      expect(RESERVED_PROFILE_NAMES).toContain('agy');
      expect(RESERVED_PROFILE_NAMES).toContain('qwen');
      expect(RESERVED_PROFILE_NAMES).toContain('iflow');
      expect(RESERVED_PROFILE_NAMES).toContain('xai');
      expect(RESERVED_PROFILE_NAMES).toContain('grok');
    });

    it('should include CLI commands', () => {
      expect(RESERVED_PROFILE_NAMES).toContain('default');
      expect(RESERVED_PROFILE_NAMES).toContain('config');
      expect(RESERVED_PROFILE_NAMES).toContain('cliproxy');
    });
  });

  describe('isReservedName', () => {
    it('should return true for reserved names', () => {
      expect(isReservedName('gemini')).toBe(true);
      expect(isReservedName('codex')).toBe(true);
      expect(isReservedName('xai')).toBe(true);
      expect(isReservedName('grok')).toBe(true);
      expect(isReservedName('default')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(isReservedName('GEMINI')).toBe(true);
      expect(isReservedName('Codex')).toBe(true);
      expect(isReservedName('XAI')).toBe(true);
      expect(isReservedName('GROK')).toBe(true);
      expect(isReservedName('DEFAULT')).toBe(true);
    });

    it('should return false for non-reserved names', () => {
      expect(isReservedName('myprofile')).toBe(false);
      expect(isReservedName('work')).toBe(false);
      expect(isReservedName('personal')).toBe(false);
    });
  });

  describe('validateProfileName', () => {
    it('should throw for reserved names', () => {
      expect(() => validateProfileName('gemini')).toThrow(/reserved/i);
      expect(() => validateProfileName('xai')).toThrow(/reserved/i);
      expect(() => validateProfileName('grok')).toThrow(/reserved/i);
      expect(() => validateProfileName('default')).toThrow(/reserved/i);
    });

    it('should not throw for valid names', () => {
      expect(() => validateProfileName('myprofile')).not.toThrow();
      expect(() => validateProfileName('work')).not.toThrow();
    });
  });
});

describe('unified-config-types', () => {
  describe('createEmptyUnifiedConfig', () => {
    it('should create config with correct version', () => {
      const config = createEmptyUnifiedConfig();
      expect(config.version).toBe(UNIFIED_CONFIG_VERSION);
    });

    it('should have empty accounts and profiles', () => {
      const config = createEmptyUnifiedConfig();
      expect(Object.keys(config.accounts)).toHaveLength(0);
      expect(Object.keys(config.profiles)).toHaveLength(0);
    });

    it('should have default preferences', () => {
      const config = createEmptyUnifiedConfig();
      expect(config.preferences.theme).toBe('system');
      expect(config.preferences.telemetry).toBe(false);
      expect(config.preferences.auto_update).toBe(true);
    });

    it('should default Official Channels to disabled and attended mode', () => {
      const config = createEmptyUnifiedConfig();
      expect(config.channels?.selected).toEqual([]);
      expect(config.channels?.unattended).toBe(false);
    });

    it('should have CLIProxy providers list', () => {
      const config = createEmptyUnifiedConfig();
      expect(config.cliproxy.providers).toContain('gemini');
      expect(config.cliproxy.providers).toContain('codex');
    });

    it('should default browser automation to disabled and manual for both lanes', () => {
      const config = createEmptyUnifiedConfig();
      expect(config.browser).toEqual({
        claude: {
          enabled: false,
          policy: 'manual',
          user_data_dir: '',
          devtools_port: 9222,
          eval_mode: 'readonly',
        },
        codex: {
          enabled: false,
          policy: 'manual',
          eval_mode: 'readonly',
        },
      });
    });
  });

  describe('isUnifiedConfig', () => {
    it('should return true for valid config', () => {
      const config = createEmptyUnifiedConfig();
      expect(isUnifiedConfig(config)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isUnifiedConfig(null)).toBe(false);
    });

    it('should return true for older version (relaxed validation)', () => {
      // Fix for issue #82: Relaxed validation accepts version >= 1
      // to prevent profile loss when loading partially valid configs
      const config = { ...createEmptyUnifiedConfig(), version: 1 };
      expect(isUnifiedConfig(config)).toBe(true);
    });

    it('should return true for partial configs (relaxed validation)', () => {
      // Fix for issue #82: Relaxed validation accepts partial configs
      // Missing sections are merged with defaults in loadOrCreateUnifiedConfig
      expect(isUnifiedConfig({ version: 2 })).toBe(true);
      expect(isUnifiedConfig({ version: 2, accounts: {} })).toBe(true);
    });

    it('should return false for version < 1', () => {
      expect(isUnifiedConfig({ version: 0 })).toBe(false);
      expect(isUnifiedConfig({ version: -1 })).toBe(false);
    });
  });
});

describe('sensitive-keys', () => {
  describe('isSecretKey', () => {
    it('should identify token keys as secrets', () => {
      expect(isSecretKey('ANTHROPIC_AUTH_TOKEN')).toBe(true);
      expect(isSecretKey('ACCESS_TOKEN')).toBe(true);
      expect(isSecretKey('REFRESH_TOKEN')).toBe(true);
    });

    it('should identify API keys as secrets', () => {
      expect(isSecretKey('API_KEY')).toBe(true);
      expect(isSecretKey('OPENAI_API_KEY')).toBe(true);
      expect(isSecretKey('APIKEY')).toBe(true);
    });

    it('should identify password keys as secrets', () => {
      expect(isSecretKey('PASSWORD')).toBe(true);
      expect(isSecretKey('DB_PASSWORD')).toBe(true);
    });

    it('should identify secret/credential keys', () => {
      expect(isSecretKey('CLIENT_SECRET')).toBe(true);
      expect(isSecretKey('AWS_CREDENTIAL')).toBe(true);
    });

    it('should not identify non-secret keys', () => {
      expect(isSecretKey('ANTHROPIC_MODEL')).toBe(false);
      expect(isSecretKey('ANTHROPIC_BASE_URL')).toBe(false);
      expect(isSecretKey('DEBUG')).toBe(false);
      expect(isSecretKey('NODE_ENV')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isSecretKey('api_key')).toBe(true);
      expect(isSecretKey('Api_Key')).toBe(true);
    });
  });
});

describe('feature-flags', () => {
  describe('isUnifiedConfigEnabled', () => {
    it('should read from CCS_UNIFIED_CONFIG env var', () => {
      // This test runs with the current environment
      // In CI, CCS_UNIFIED_CONFIG may or may not be set
      const result = isUnifiedConfigEnabled();
      expect(typeof result).toBe('boolean');
    });
  });
});

describe('continuity-inheritance-config', () => {
  it('normalizes legacy continuity_inherit_from_account into continuity.inherit_from_account', () => {
    const originalCcsHome = process.env.CCS_HOME;
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-continuity-home-'));
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      ['version: 8', 'continuity_inherit_from_account:', '  glm: pro', '  empty: ""', ''].join('\n')
    );

    process.env.CCS_HOME = tempHome;
    try {
      const config = loadOrCreateUnifiedConfig();
      expect(config.continuity?.inherit_from_account).toEqual({
        glm: 'pro',
      });
    } finally {
      if (originalCcsHome === undefined) {
        delete process.env.CCS_HOME;
      } else {
        process.env.CCS_HOME = originalCcsHome;
      }
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('merges continuity.inherit_from_account with legacy continuity_inherit_from_account', () => {
    const originalCcsHome = process.env.CCS_HOME;
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-continuity-merge-home-'));
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      [
        'version: 8',
        'continuity:',
        '  inherit_from_account:',
        '    glm: team-a',
        '    copilot: work',
        'continuity_inherit_from_account:',
        '  glm: legacy',
        '  km: account-kimi',
        '',
      ].join('\n')
    );

    process.env.CCS_HOME = tempHome;
    try {
      const config = loadOrCreateUnifiedConfig();
      expect(config.continuity?.inherit_from_account).toEqual({
        glm: 'team-a',
        copilot: 'work',
        km: 'account-kimi',
      });
    } finally {
      if (originalCcsHome === undefined) {
        delete process.env.CCS_HOME;
      } else {
        process.env.CCS_HOME = originalCcsHome;
      }
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });
});

describe('cliproxy session-affinity ttl normalization', () => {
  it('normalizes invalid stored ttl values back to the safe default', () => {
    const originalCcsHome = process.env.CCS_HOME;
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-affinity-ttl-home-'));
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      [
        'version: 8',
        'cliproxy:',
        '  routing:',
        '    strategy: round-robin',
        '    session_affinity: true',
        '    session_affinity_ttl: forever',
        '',
      ].join('\n')
    );

    process.env.CCS_HOME = tempHome;
    try {
      const config = loadOrCreateUnifiedConfig();
      expect(config.cliproxy.routing?.session_affinity_ttl).toBe('1h');
    } finally {
      if (originalCcsHome === undefined) {
        delete process.env.CCS_HOME;
      } else {
        process.env.CCS_HOME = originalCcsHome;
      }
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('normalizes non-positive stored ttl values back to the safe default', () => {
    const originalCcsHome = process.env.CCS_HOME;
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-affinity-zero-ttl-home-'));
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      [
        'version: 8',
        'cliproxy:',
        '  routing:',
        '    strategy: round-robin',
        '    session_affinity: true',
        '    session_affinity_ttl: 0s',
        '',
      ].join('\n')
    );

    process.env.CCS_HOME = tempHome;
    try {
      const config = loadOrCreateUnifiedConfig();
      expect(config.cliproxy.routing?.session_affinity_ttl).toBe('1h');
    } finally {
      if (originalCcsHome === undefined) {
        delete process.env.CCS_HOME;
      } else {
        process.env.CCS_HOME = originalCcsHome;
      }
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });
});

describe('official-channels-config', () => {
  it('keeps explicit channels.selected empty even when legacy discord_channels.enabled is true', () => {
    const originalCcsHome = process.env.CCS_HOME;
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-official-channels-home-'));
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      [
        'version: 12',
        'channels:',
        '  selected: []',
        '  unattended: false',
        'discord_channels:',
        '  enabled: true',
        '  unattended: true',
        '',
      ].join('\n')
    );

    process.env.CCS_HOME = tempHome;
    try {
      const config = loadOrCreateUnifiedConfig();
      expect(config.channels?.selected).toEqual([]);
      expect(config.channels?.unattended).toBe(false);
    } finally {
      if (originalCcsHome === undefined) {
        delete process.env.CCS_HOME;
      } else {
        process.env.CCS_HOME = originalCcsHome;
      }
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('treats the canonical channels section as authoritative even without selected', () => {
    const originalCcsHome = process.env.CCS_HOME;
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-official-channels-canonical-'));
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      [
        'version: 12',
        'channels:',
        '  unattended: false',
        'discord_channels:',
        '  enabled: true',
        '  unattended: true',
        '',
      ].join('\n')
    );

    process.env.CCS_HOME = tempHome;
    try {
      const config = loadOrCreateUnifiedConfig();
      expect(config.channels?.selected).toEqual([]);
      expect(config.channels?.unattended).toBe(false);
    } finally {
      if (originalCcsHome === undefined) {
        delete process.env.CCS_HOME;
      } else {
        process.env.CCS_HOME = originalCcsHome;
      }
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });
});

describe('browser-config', () => {
  it('fills in safe browser defaults when the browser section is missing on older configs', () => {
    const originalCcsHome = process.env.CCS_HOME;
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-browser-defaults-home-'));
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      ['version: 12', 'websearch:', '  enabled: false', ''].join('\n')
    );

    process.env.CCS_HOME = tempHome;
    try {
      const config = loadOrCreateUnifiedConfig();
      expect(config.browser).toMatchObject({
        claude: {
          enabled: false,
          policy: 'manual',
        },
        codex: {
          enabled: false,
          policy: 'manual',
        },
      });
    } finally {
      if (originalCcsHome === undefined) {
        delete process.env.CCS_HOME;
      } else {
        process.env.CCS_HOME = originalCcsHome;
      }
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('preserves explicit browser enablement while defaulting missing policies to manual', () => {
    const originalCcsHome = process.env.CCS_HOME;
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-browser-policy-home-'));
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });

    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      [
        'version: 12',
        'browser:',
        '  claude:',
        '    enabled: true',
        '    user_data_dir: "/tmp/claude-browser"',
        '    devtools_port: 9333',
        '  codex:',
        '    enabled: true',
        '',
      ].join('\n')
    );

    process.env.CCS_HOME = tempHome;
    try {
      const config = loadOrCreateUnifiedConfig();
      expect(config.browser).toMatchObject({
        claude: {
          enabled: true,
          policy: 'manual',
          user_data_dir: '/tmp/claude-browser',
          devtools_port: 9333,
        },
        codex: {
          enabled: true,
          policy: 'manual',
        },
      });
    } finally {
      if (originalCcsHome === undefined) {
        delete process.env.CCS_HOME;
      } else {
        process.env.CCS_HOME = originalCcsHome;
      }
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });
});
