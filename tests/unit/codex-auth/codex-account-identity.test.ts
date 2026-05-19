import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let decodeAccountIdentity: (authJsonPath: string) => {
  email?: string;
  plan_type?: string;
  account_id?: string;
};

function buildToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fakesig`;
}

const VALID_TOKEN = buildToken({
  email: 'test@example.com',
  'https://api.openai.com/auth': {
    chatgpt_plan_type: 'pro',
    chatgpt_account_id: 'acct-abc123',
  },
});

let tempDir: string;

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-identity-test-'));
  const mod = await import('../../../src/codex-auth/codex-account-identity');
  decodeAccountIdentity = mod.decodeAccountIdentity;
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('decodeAccountIdentity', () => {
  it('returns {} when auth.json does not exist', () => {
    const result = decodeAccountIdentity(path.join(tempDir, 'auth.json'));
    expect(result).toEqual({});
  });

  it('returns identity fields from valid auth.json with id_token', () => {
    const authJson = {
      auth_mode: 'chatgpt_oauth',
      tokens: { id_token: VALID_TOKEN, access_token: 'acc', refresh_token: 'ref' },
    };
    fs.writeFileSync(path.join(tempDir, 'auth.json'), JSON.stringify(authJson), { mode: 0o600 });
    const result = decodeAccountIdentity(path.join(tempDir, 'auth.json'));
    expect(result.email).toBe('test@example.com');
    expect(result.plan_type).toBe('pro');
    expect(result.account_id).toBe('acct-abc123');
  });

  it('returns {} when auth.json contains corrupt JSON', () => {
    fs.writeFileSync(path.join(tempDir, 'auth.json'), '{ not valid json !!!', { mode: 0o600 });
    const result = decodeAccountIdentity(path.join(tempDir, 'auth.json'));
    expect(result).toEqual({});
  });

  it('returns {} when id_token field is missing from tokens', () => {
    const authJson = { auth_mode: 'openai', tokens: { access_token: 'acc' } };
    fs.writeFileSync(path.join(tempDir, 'auth.json'), JSON.stringify(authJson), { mode: 0o600 });
    const result = decodeAccountIdentity(path.join(tempDir, 'auth.json'));
    expect(result).toEqual({});
  });

  it('returns {} when tokens field is absent entirely', () => {
    const authJson = { auth_mode: 'openai', OPENAI_API_KEY: 'sk-...' };
    fs.writeFileSync(path.join(tempDir, 'auth.json'), JSON.stringify(authJson), { mode: 0o600 });
    const result = decodeAccountIdentity(path.join(tempDir, 'auth.json'));
    expect(result).toEqual({});
  });
});
