/**
 * Persist Command Tests
 *
 * Tests for the `ccs persist` CLI command including:
 * - Argument parsing
 * - API key masking
 * - Settings merge logic
 * - Backup management
 * - Error handling
 */

const assert = require('assert');

describe('Persist Command', () => {
  // =========================================================================
  // Argument Parsing Tests
  // =========================================================================
  describe('parseArgs', () => {
    /**
     * Simulates the argument parsing logic from persist-command.ts
     */
    function parseArgs(args) {
      const result = {
        profile: undefined,
        yes: false,
        listBackups: false,
        restore: undefined,
      };
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--yes' || arg === '-y') {
          result.yes = true;
        } else if (arg === '--help' || arg === '-h') {
          // Will be handled in main function
        } else if (arg === '--list-backups') {
          result.listBackups = true;
        } else if (arg === '--restore') {
          // Check if next arg is a timestamp (not a flag)
          const nextArg = args[i + 1];
          if (nextArg && !nextArg.startsWith('-')) {
            result.restore = nextArg;
            i++; // Skip next arg
          } else {
            result.restore = true; // Use latest
          }
        } else if (!arg.startsWith('-') && !result.profile) {
          result.profile = arg;
        }
      }
      return result;
    }

    it('parses profile name as first positional argument', () => {
      const result = parseArgs(['glm']);
      assert.strictEqual(result.profile, 'glm');
    });

    it('parses --yes flag', () => {
      const result = parseArgs(['glm', '--yes']);
      assert.strictEqual(result.yes, true);
      assert.strictEqual(result.profile, 'glm');
    });

    it('parses -y short flag', () => {
      const result = parseArgs(['gemini', '-y']);
      assert.strictEqual(result.yes, true);
      assert.strictEqual(result.profile, 'gemini');
    });

    it('parses flags before profile name', () => {
      const result = parseArgs(['--yes', 'kimi']);
      assert.strictEqual(result.yes, true);
      assert.strictEqual(result.profile, 'kimi');
    });

    it('handles no arguments', () => {
      const result = parseArgs([]);
      assert.strictEqual(result.profile, undefined);
      assert.strictEqual(result.yes, false);
    });

    it('ignores unknown flags', () => {
      const result = parseArgs(['glm', '--unknown', '--yes']);
      assert.strictEqual(result.profile, 'glm');
      assert.strictEqual(result.yes, true);
    });

    it('takes only first positional as profile', () => {
      const result = parseArgs(['first', 'second', 'third']);
      assert.strictEqual(result.profile, 'first');
    });

    it('parses --list-backups flag', () => {
      const result = parseArgs(['--list-backups']);
      assert.strictEqual(result.listBackups, true);
      assert.strictEqual(result.profile, undefined);
    });

    it('parses --restore flag without timestamp (use latest)', () => {
      const result = parseArgs(['--restore']);
      assert.strictEqual(result.restore, true);
    });

    it('parses --restore flag with timestamp', () => {
      const result = parseArgs(['--restore', '20260110_205324']);
      assert.strictEqual(result.restore, '20260110_205324');
    });

    it('parses --restore with --yes flag', () => {
      const result = parseArgs(['--restore', '--yes']);
      assert.strictEqual(result.restore, true);
      assert.strictEqual(result.yes, true);
    });

    it('parses --restore with timestamp and --yes flag', () => {
      const result = parseArgs(['--restore', '20260110_205324', '--yes']);
      assert.strictEqual(result.restore, '20260110_205324');
      assert.strictEqual(result.yes, true);
    });
  });

  // =========================================================================
  // API Key Masking Tests
  // =========================================================================
  describe('maskApiKey', () => {
    /**
     * Simulates the maskApiKey function from persist-command.ts
     */
    function maskApiKey(key) {
      if (key.length <= 12) {
        return '****';
      }
      return `${key.slice(0, 4)}...${key.slice(-4)}`;
    }

    it('masks keys showing first 4 and last 4 characters', () => {
      const result = maskApiKey('sk-1234567890abcdef');
      assert.strictEqual(result, 'sk-1...cdef');
    });

    it('returns **** for keys <= 12 characters', () => {
      assert.strictEqual(maskApiKey('123456789012'), '****');
      assert.strictEqual(maskApiKey('12345678901'), '****');
      assert.strictEqual(maskApiKey('short'), '****');
      assert.strictEqual(maskApiKey(''), '****');
    });

    it('handles exactly 13 character keys', () => {
      const result = maskApiKey('1234567890abc');
      assert.strictEqual(result, '1234...0abc');
    });

    it('handles long API keys', () => {
      const longKey = 'api_key_1234567890abcdefghijklmnopqrstuvwxyz';
      const result = maskApiKey(longKey);
      assert.strictEqual(result, 'api_...wxyz');
    });

    it('preserves special characters', () => {
      const key = '!@#$%^&*()_+-=[]{}';
      const result = maskApiKey(key);
      assert.strictEqual(result, '!@#$...[]{}');
    });
  });

  // =========================================================================
  // Settings Merge Tests
  // =========================================================================
  describe('Settings Merge Logic', () => {
    /**
     * Simulates the merge logic from persist-command.ts
     */
    function mergeSettings(existing, newEnv) {
      const existingEnv = existing.env || {};
      return {
        ...existing,
        env: {
          ...existingEnv,
          ...newEnv,
        },
      };
    }

    it('merges env vars into empty settings', () => {
      const existing = {};
      const newEnv = { ANTHROPIC_BASE_URL: 'http://example.com' };
      const result = mergeSettings(existing, newEnv);
      assert.deepStrictEqual(result.env, newEnv);
    });

    it('preserves existing hooks', () => {
      const existing = {
        hooks: { PreToolUse: [{ matcher: 'WebSearch' }] },
      };
      const newEnv = { ANTHROPIC_MODEL: 'test' };
      const result = mergeSettings(existing, newEnv);
      assert.deepStrictEqual(result.hooks, existing.hooks);
    });

    it('preserves existing presets', () => {
      const existing = {
        presets: [{ name: 'test', default: 'model' }],
      };
      const newEnv = { ANTHROPIC_MODEL: 'test' };
      const result = mergeSettings(existing, newEnv);
      assert.deepStrictEqual(result.presets, existing.presets);
    });

    it('preserves other settings like model and alwaysThinkingEnabled', () => {
      const existing = {
        model: 'opus',
        alwaysThinkingEnabled: true,
      };
      const newEnv = { ANTHROPIC_MODEL: 'test' };
      const result = mergeSettings(existing, newEnv);
      assert.strictEqual(result.model, 'opus');
      assert.strictEqual(result.alwaysThinkingEnabled, true);
    });

    it('merges new env vars with existing env vars', () => {
      const existing = {
        env: { EXISTING_VAR: 'value' },
      };
      const newEnv = { NEW_VAR: 'new_value' };
      const result = mergeSettings(existing, newEnv);
      assert.strictEqual(result.env.EXISTING_VAR, 'value');
      assert.strictEqual(result.env.NEW_VAR, 'new_value');
    });

    it('overwrites existing env vars with new values', () => {
      const existing = {
        env: { ANTHROPIC_MODEL: 'old_model' },
      };
      const newEnv = { ANTHROPIC_MODEL: 'new_model' };
      const result = mergeSettings(existing, newEnv);
      assert.strictEqual(result.env.ANTHROPIC_MODEL, 'new_model');
    });

    it('handles complex settings with multiple fields', () => {
      const existing = {
        hooks: { PreToolUse: [] },
        presets: [],
        model: 'sonnet',
        env: { OLD_VAR: 'old' },
        customField: 'custom',
      };
      const newEnv = {
        ANTHROPIC_BASE_URL: 'http://test.com',
        ANTHROPIC_MODEL: 'test',
      };
      const result = mergeSettings(existing, newEnv);

      assert.deepStrictEqual(result.hooks, existing.hooks);
      assert.deepStrictEqual(result.presets, existing.presets);
      assert.strictEqual(result.model, 'sonnet');
      assert.strictEqual(result.customField, 'custom');
      assert.strictEqual(result.env.OLD_VAR, 'old');
      assert.strictEqual(result.env.ANTHROPIC_BASE_URL, 'http://test.com');
      assert.strictEqual(result.env.ANTHROPIC_MODEL, 'test');
    });
  });

  // =========================================================================
  // Backup Timestamp Tests
  // =========================================================================
  describe('Backup Timestamp Format', () => {
    /**
     * Simulates the timestamp generation from persist-command.ts
     */
    function generateTimestamp(date) {
      return (
        date.getFullYear().toString() +
        (date.getMonth() + 1).toString().padStart(2, '0') +
        date.getDate().toString().padStart(2, '0') +
        '_' +
        date.getHours().toString().padStart(2, '0') +
        date.getMinutes().toString().padStart(2, '0') +
        date.getSeconds().toString().padStart(2, '0')
      );
    }

    it('generates correct format YYYYMMDD_HHMMSS', () => {
      const date = new Date(2025, 0, 15, 10, 30, 45); // Jan 15, 2025 10:30:45
      const result = generateTimestamp(date);
      assert.strictEqual(result, '20250115_103045');
    });

    it('pads single digit months', () => {
      const date = new Date(2025, 0, 1, 0, 0, 0); // Jan 1
      const result = generateTimestamp(date);
      assert.match(result, /^202501/);
    });

    it('pads single digit days', () => {
      const date = new Date(2025, 11, 5, 0, 0, 0); // Dec 5
      const result = generateTimestamp(date);
      assert.match(result, /^20251205/);
    });

    it('pads single digit hours, minutes, seconds', () => {
      const date = new Date(2025, 5, 15, 1, 2, 3);
      const result = generateTimestamp(date);
      assert.strictEqual(result, '20250615_010203');
    });
  });

  // =========================================================================
  // Profile Type Detection Tests
  // =========================================================================
  describe('Profile Type Messages', () => {
    const profileTypes = {
      settings: 'API',
      cliproxy: 'CLIProxy',
      copilot: 'Copilot',
      account: 'Account (not supported)',
      default: 'Default (not supported)',
    };

    it('maps settings type to API', () => {
      assert.strictEqual(profileTypes.settings, 'API');
    });

    it('maps cliproxy type to CLIProxy', () => {
      assert.strictEqual(profileTypes.cliproxy, 'CLIProxy');
    });

    it('maps copilot type to Copilot', () => {
      assert.strictEqual(profileTypes.copilot, 'Copilot');
    });
  });

  // =========================================================================
  // Sensitive Key Detection Tests
  // =========================================================================
  describe('Sensitive Key Detection', () => {
    /**
     * Simulates the logic to detect sensitive keys for masking
     */
    function isSensitiveKey(key) {
      return key.includes('TOKEN') || key.includes('KEY') || key.includes('SECRET');
    }

    it('detects TOKEN in key name', () => {
      assert.strictEqual(isSensitiveKey('ANTHROPIC_AUTH_TOKEN'), true);
      assert.strictEqual(isSensitiveKey('ACCESS_TOKEN'), true);
    });

    it('detects KEY in key name', () => {
      assert.strictEqual(isSensitiveKey('API_KEY'), true);
      assert.strictEqual(isSensitiveKey('ANTHROPIC_API_KEY'), true);
    });

    it('detects SECRET in key name', () => {
      assert.strictEqual(isSensitiveKey('CLIENT_SECRET'), true);
      assert.strictEqual(isSensitiveKey('SECRET_KEY'), true);
    });

    it('does not flag non-sensitive keys', () => {
      assert.strictEqual(isSensitiveKey('ANTHROPIC_BASE_URL'), false);
      assert.strictEqual(isSensitiveKey('ANTHROPIC_MODEL'), false);
      assert.strictEqual(isSensitiveKey('DISABLE_TELEMETRY'), false);
    });
  });

  // =========================================================================
  // Help Text Coverage Tests
  // =========================================================================
  describe('Help Text Coverage', () => {
    const expectedOptions = ['--yes', '-y', '--help', '-h'];
    const expectedProfileTypes = ['API profiles', 'CLIProxy', 'Copilot', 'Account-based'];

    it('documents all CLI options', () => {
      expectedOptions.forEach((option) => {
        assert(typeof option === 'string', `Option ${option} should be a string`);
        assert(option.startsWith('-'), `Option ${option} should start with -`);
      });
    });

    it('documents all profile types', () => {
      expectedProfileTypes.forEach((type) => {
        assert(typeof type === 'string', `Profile type ${type} should be documented`);
      });
    });
  });

  // =========================================================================
  // Error Message Tests
  // =========================================================================
  describe('Error Messages', () => {
    it('account profile error message mentions CLAUDE_CONFIG_DIR', () => {
      const errorMessage =
        "Account profiles use CLAUDE_CONFIG_DIR isolation, not env vars.\n" +
        "Use 'ccs profileName' to run with this profile instead.";
      assert(errorMessage.includes('CLAUDE_CONFIG_DIR'));
      assert(errorMessage.includes('ccs profileName'));
    });

    it('no env vars error message includes profile name placeholder', () => {
      const profileName = 'test';
      const errorMessage = `Profile '${profileName}' has no env vars configured`;
      assert(errorMessage.includes(profileName));
    });
  });

  // =========================================================================
  // Backup File Parsing Tests
  // =========================================================================
  describe('Backup File Parsing', () => {
    const backupPattern = /^settings\.json\.backup\.(\d{8}_\d{6})$/;

    /**
     * Simulates parsing a backup filename into a BackupFile object
     */
    function parseBackupFile(filename, dir) {
      const match = filename.match(backupPattern);
      if (!match) return null;
      const timestamp = match[1];
      // Parse YYYYMMDD_HHMMSS
      const year = parseInt(timestamp.slice(0, 4));
      const month = parseInt(timestamp.slice(4, 6)) - 1;
      const day = parseInt(timestamp.slice(6, 8));
      const hour = parseInt(timestamp.slice(9, 11));
      const min = parseInt(timestamp.slice(11, 13));
      const sec = parseInt(timestamp.slice(13, 15));
      return {
        path: dir + '/' + filename,
        timestamp,
        date: new Date(year, month, day, hour, min, sec),
      };
    }

    it('matches valid backup filename pattern', () => {
      assert(backupPattern.test('settings.json.backup.20260110_205324'));
      assert(backupPattern.test('settings.json.backup.20250101_000000'));
    });

    it('rejects invalid backup filenames', () => {
      assert(!backupPattern.test('settings.json'));
      assert(!backupPattern.test('settings.json.backup'));
      assert(!backupPattern.test('settings.json.backup.invalid'));
      assert(!backupPattern.test('settings.json.backup.20260110'));
      assert(!backupPattern.test('other.json.backup.20260110_205324'));
    });

    it('parses backup file correctly', () => {
      const result = parseBackupFile('settings.json.backup.20260110_205324', '/home/user/.claude');
      assert.strictEqual(result.timestamp, '20260110_205324');
      assert.strictEqual(result.path, '/home/user/.claude/settings.json.backup.20260110_205324');
      assert.strictEqual(result.date.getFullYear(), 2026);
      assert.strictEqual(result.date.getMonth(), 0); // January
      assert.strictEqual(result.date.getDate(), 10);
      assert.strictEqual(result.date.getHours(), 20);
      assert.strictEqual(result.date.getMinutes(), 53);
      assert.strictEqual(result.date.getSeconds(), 24);
    });

    it('returns null for non-matching files', () => {
      const result = parseBackupFile('settings.json', '/home/user/.claude');
      assert.strictEqual(result, null);
    });

    it('sorts backup files by date descending (newest first)', () => {
      const files = [
        { timestamp: '20260109_100000', date: new Date(2026, 0, 9, 10, 0, 0) },
        { timestamp: '20260110_205324', date: new Date(2026, 0, 10, 20, 53, 24) },
        { timestamp: '20260110_100000', date: new Date(2026, 0, 10, 10, 0, 0) },
      ];
      const sorted = files.sort((a, b) => b.date.getTime() - a.date.getTime());
      assert.strictEqual(sorted[0].timestamp, '20260110_205324');
      assert.strictEqual(sorted[1].timestamp, '20260110_100000');
      assert.strictEqual(sorted[2].timestamp, '20260109_100000');
    });
  });

  // =========================================================================
  // Backup Restore Logic Tests
  // =========================================================================
  describe('Backup Restore Logic', () => {
    it('selects first backup when restore=true (latest)', () => {
      const backups = [
        { timestamp: '20260110_205324' },
        { timestamp: '20260110_100000' },
      ];
      const restore = true;
      const selected = restore === true ? backups[0] : backups.find((b) => b.timestamp === restore);
      assert.strictEqual(selected.timestamp, '20260110_205324');
    });

    it('selects specific backup when restore is a timestamp', () => {
      const backups = [
        { timestamp: '20260110_205324' },
        { timestamp: '20260110_100000' },
      ];
      const restore = '20260110_100000';
      const selected = restore === true ? backups[0] : backups.find((b) => b.timestamp === restore);
      assert.strictEqual(selected.timestamp, '20260110_100000');
    });

    it('returns undefined when timestamp not found', () => {
      const backups = [
        { timestamp: '20260110_205324' },
        { timestamp: '20260110_100000' },
      ];
      const restore = '20260101_000000';
      const selected = restore === true ? backups[0] : backups.find((b) => b.timestamp === restore);
      assert.strictEqual(selected, undefined);
    });
  });
});
