/**
 * Account Manager Discovery Tests
 *
 * Tests for discoverExistingAccounts() function including:
 * - Kiro/GHCP provider mapping
 * - Email extraction from filename
 * - Multiple accounts per provider
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('Account Manager - discoverExistingAccounts', () => {
  let testDir;
  let originalCcsHome;
  let accountManager;

  beforeEach(() => {
    // Create temp directory for test
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-test-'));
    const ccsDir = path.join(testDir, '.ccs', 'cliproxy');
    const authDir = path.join(ccsDir, 'auth');
    fs.mkdirSync(authDir, { recursive: true });

    // Mock CCS_HOME to use temp directory
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = testDir;

    // Clear cache and reload
    delete require.cache[require.resolve('../../../dist/cliproxy/account-manager')];
    delete require.cache[require.resolve('../../../dist/cliproxy/config-generator')];
    delete require.cache[require.resolve('../../../dist/utils/config-manager')];
    accountManager = require('../../../dist/cliproxy/account-manager');
  });

  afterEach(() => {
    // Restore CCS_HOME
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }

    // Cleanup temp directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  function createAuthFile(filename, content) {
    const authDir = path.join(testDir, '.ccs', 'cliproxy', 'auth');
    fs.writeFileSync(path.join(authDir, filename), JSON.stringify(content));
  }

  function getAccountsFile() {
    const accountsPath = path.join(testDir, '.ccs', 'cliproxy', 'accounts.json');
    if (fs.existsSync(accountsPath)) {
      return JSON.parse(fs.readFileSync(accountsPath, 'utf-8'));
    }
    return null;
  }

  // =========================================================================
  // Provider Type Mapping Tests
  // =========================================================================
  describe('Provider Type Mapping', () => {
    it('discovers kiro accounts with type="kiro"', () => {
      createAuthFile('kiro-google-user@example.com.json', {
        type: 'kiro',
        email: '',
        provider: 'Google',
        profile_arn: 'arn:aws:codewhisperer:us-east-1::profile/123',
      });

      accountManager.discoverExistingAccounts();
      const accounts = getAccountsFile();

      assert(accounts, 'accounts.json should be created');
      assert(accounts.providers.kiro, 'kiro provider should exist');
      assert.strictEqual(
        Object.keys(accounts.providers.kiro.accounts).length,
        1,
        'Should have 1 kiro account'
      );
    });

    it('discovers kiro accounts with type="codewhisperer"', () => {
      createAuthFile('codewhisperer-user@example.com.json', {
        type: 'codewhisperer',
        email: 'user@example.com',
      });

      accountManager.discoverExistingAccounts();
      const accounts = getAccountsFile();

      assert(accounts.providers.kiro, 'codewhisperer type should map to kiro provider');
    });

    it('discovers ghcp accounts with type="github-copilot"', () => {
      createAuthFile('ghcp-user@example.com.json', {
        type: 'github-copilot',
        email: 'user@example.com',
      });

      accountManager.discoverExistingAccounts();
      const accounts = getAccountsFile();

      assert(accounts.providers.ghcp, 'github-copilot type should map to ghcp provider');
    });

    it('discovers ghcp accounts with type="copilot"', () => {
      createAuthFile('copilot-user@example.com.json', {
        type: 'copilot',
        email: 'user@example.com',
      });

      accountManager.discoverExistingAccounts();
      const accounts = getAccountsFile();

      assert(accounts.providers.ghcp, 'copilot type should map to ghcp provider');
    });

    it('handles case-insensitive type values', () => {
      createAuthFile('kiro-test.json', {
        type: 'KIRO',
        email: 'test@example.com',
      });

      accountManager.discoverExistingAccounts();
      const accounts = getAccountsFile();

      assert(accounts.providers.kiro, 'KIRO (uppercase) should map to kiro provider');
    });
  });

  // =========================================================================
  // Email Extraction Tests
  // =========================================================================
  describe('Email Extraction from Filename', () => {
    it('extracts email from filename when data.email is empty', () => {
      createAuthFile('kiro-google-user@example.com.json', {
        type: 'kiro',
        email: '',
        provider: 'Google',
      });

      accountManager.discoverExistingAccounts();
      const accounts = getAccountsFile();

      const accountIds = Object.keys(accounts.providers.kiro.accounts);
      assert.strictEqual(accountIds[0], 'user@example.com', 'Should extract email from filename');
    });

    it('uses data.email when available', () => {
      createAuthFile('kiro-test.json', {
        type: 'kiro',
        email: 'actual@email.com',
      });

      accountManager.discoverExistingAccounts();
      const accounts = getAccountsFile();

      const accountIds = Object.keys(accounts.providers.kiro.accounts);
      assert.strictEqual(accountIds[0], 'actual@email.com', 'Should use data.email when available');
    });

    it('generates unique ID for kiro/ghcp when no email in file or filename', () => {
      createAuthFile('kiro-nomail.json', {
        type: 'kiro',
        email: '',
      });

      accountManager.discoverExistingAccounts();
      const accounts = getAccountsFile();

      const accountIds = Object.keys(accounts.providers.kiro.accounts);
      // For kiro/ghcp without email, generates unique ID like "kiro-1"
      assert.strictEqual(accountIds[0], 'kiro-1', 'Should generate unique ID for kiro without email');
    });

    it('handles dots in email local part', () => {
      createAuthFile('kiro-google-first.last@example.com.json', {
        type: 'kiro',
        email: '',
      });

      accountManager.discoverExistingAccounts();
      const accounts = getAccountsFile();

      const accountIds = Object.keys(accounts.providers.kiro.accounts);
      assert.strictEqual(
        accountIds[0],
        'first.last@example.com',
        'Should handle dots in local part'
      );
    });

    it('handles plus addressing in email', () => {
      createAuthFile('kiro-google-user+tag@example.com.json', {
        type: 'kiro',
        email: '',
      });

      accountManager.discoverExistingAccounts();
      const accounts = getAccountsFile();

      const accountIds = Object.keys(accounts.providers.kiro.accounts);
      assert.strictEqual(accountIds[0], 'user+tag@example.com', 'Should handle plus addressing');
    });
  });

  // =========================================================================
  // Multiple Accounts Tests
  // =========================================================================
  describe('Multiple Accounts', () => {
    it('discovers multiple kiro accounts', () => {
      createAuthFile('kiro-google-user1@example.com.json', {
        type: 'kiro',
        email: '',
      });
      createAuthFile('kiro-google-user2@example.com.json', {
        type: 'kiro',
        email: '',
      });

      accountManager.discoverExistingAccounts();
      const accounts = getAccountsFile();

      assert.strictEqual(
        Object.keys(accounts.providers.kiro.accounts).length,
        2,
        'Should discover 2 kiro accounts'
      );
    });

    it('does not overwrite existing accounts', () => {
      // Create first account
      createAuthFile('kiro-google-user1@example.com.json', {
        type: 'kiro',
        email: '',
      });
      accountManager.discoverExistingAccounts();

      // Add another file and run again
      createAuthFile('kiro-google-user2@example.com.json', {
        type: 'kiro',
        email: '',
      });

      // Reload module to clear in-memory cache
      delete require.cache[require.resolve('../../../dist/cliproxy/account-manager')];
      accountManager = require('../../../dist/cliproxy/account-manager');
      accountManager.discoverExistingAccounts();

      const accounts = getAccountsFile();
      assert.strictEqual(
        Object.keys(accounts.providers.kiro.accounts).length,
        2,
        'Should have 2 accounts without overwriting'
      );
    });

    it('sets first discovered account as default', () => {
      createAuthFile('kiro-google-user@example.com.json', {
        type: 'kiro',
        email: '',
      });

      accountManager.discoverExistingAccounts();
      const accounts = getAccountsFile();

      assert.strictEqual(
        accounts.providers.kiro.default,
        'user@example.com',
        'First account should be default'
      );
    });

    it('generates sequential IDs for multiple kiro files without email', () => {
      // Create multiple kiro files without email in filename
      // Files like "kiro-nomail.json" don't match oauth pattern (need 2+ hyphens)
      createAuthFile('kiro-account1.json', {
        type: 'kiro',
        email: '',
      });
      createAuthFile('kiro-account2.json', {
        type: 'kiro',
        email: '',
      });

      accountManager.discoverExistingAccounts();
      const accounts = getAccountsFile();

      const accountIds = Object.keys(accounts.providers.kiro.accounts);
      assert.strictEqual(accountIds.length, 2, 'Should have 2 accounts');
      // Both should have kiro-N format since filenames don't match oauth pattern (1 hyphen only)
      assert(accountIds.includes('kiro-1'), 'Should have kiro-1');
      assert(accountIds.includes('kiro-2'), 'Should have kiro-2');
    });

    it('skips to next ID when collision exists', () => {
      // Pre-create accounts.json with kiro-1 already registered
      const accountsPath = path.join(testDir, '.ccs', 'cliproxy', 'accounts.json');
      const existingRegistry = {
        version: 1,
        providers: {
          kiro: {
            default: 'kiro-1',
            accounts: {
              'kiro-1': {
                tokenFile: 'kiro-existing.json',
                createdAt: new Date().toISOString(),
              },
            },
          },
        },
      };
      fs.writeFileSync(accountsPath, JSON.stringify(existingRegistry));

      // Create the existing token file (matches registry)
      createAuthFile('kiro-existing.json', {
        type: 'kiro',
        email: '',
      });

      // Create new file that will need auto-generated ID (single hyphen = no oauth pattern match)
      createAuthFile('kiro-newaccount.json', {
        type: 'kiro',
        email: '',
      });

      // Reload module to pick up pre-existing accounts.json
      delete require.cache[require.resolve('../../../dist/cliproxy/account-manager')];
      accountManager = require('../../../dist/cliproxy/account-manager');
      accountManager.discoverExistingAccounts();

      const accounts = getAccountsFile();
      const accountIds = Object.keys(accounts.providers.kiro.accounts);

      assert.strictEqual(accountIds.length, 2, 'Should have 2 accounts');
      assert(accountIds.includes('kiro-1'), 'Should keep existing kiro-1');
      assert(accountIds.includes('kiro-2'), 'New account should be kiro-2 (skipped kiro-1)');
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================
  describe('Edge Cases', () => {
    it('skips files without type field', () => {
      createAuthFile('invalid.json', {
        email: 'test@example.com',
      });

      accountManager.discoverExistingAccounts();
      const accounts = getAccountsFile();

      // Should either be null or have no providers
      if (accounts) {
        assert.strictEqual(Object.keys(accounts.providers).length, 0, 'Should have no providers');
      }
    });

    it('skips files with unknown type', () => {
      createAuthFile('unknown.json', {
        type: 'unknown-provider',
        email: 'test@example.com',
      });

      accountManager.discoverExistingAccounts();
      const accounts = getAccountsFile();

      if (accounts) {
        assert.strictEqual(
          Object.keys(accounts.providers).length,
          0,
          'Should skip unknown providers'
        );
      }
    });

    it('skips non-JSON files', () => {
      fs.writeFileSync(
        path.join(testDir, '.ccs', 'cliproxy', 'auth', 'readme.txt'),
        'This is not JSON'
      );

      accountManager.discoverExistingAccounts();
      const accounts = getAccountsFile();

      // Should not throw, should skip the file
      if (accounts) {
        assert.strictEqual(Object.keys(accounts.providers).length, 0);
      }
    });

    it('handles malformed JSON gracefully', () => {
      fs.writeFileSync(
        path.join(testDir, '.ccs', 'cliproxy', 'auth', 'bad.json'),
        '{not valid json'
      );

      // Should not throw
      assert.doesNotThrow(() => {
        accountManager.discoverExistingAccounts();
      });
    });

    it('handles missing auth directory', () => {
      // Remove auth directory
      fs.rmSync(path.join(testDir, '.ccs', 'cliproxy', 'auth'), { recursive: true });

      // Should not throw
      assert.doesNotThrow(() => {
        accountManager.discoverExistingAccounts();
      });
    });
  });
});
