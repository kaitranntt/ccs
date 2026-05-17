import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Lazy import so tests can run before implementation
let decodeIdToken: (idToken: string) => { email?: string; plan_type?: string; account_id?: string };
let hasStructurallyValidIdToken: (idToken: string) => boolean;

// Fixture: real-shape JWT with nested claims
// Payload (base64url): {"email":"user@example.com","https://api.openai.com/auth":{"chatgpt_plan_type":"pro","chatgpt_account_id":"4b0448c0-e4a2-4cc0-a70d-77065d613553"}}
const VALID_NESTED_TOKEN = buildToken({
  email: 'user@example.com',
  'https://api.openai.com/auth': {
    chatgpt_plan_type: 'pro',
    chatgpt_account_id: '4b0448c0-e4a2-4cc0-a70d-77065d613553',
  },
});

// Fixture: email only via profile fallback path
const PROFILE_EMAIL_TOKEN = buildToken({
  'https://api.openai.com/profile': { email: 'profile@example.com' },
  'https://api.openai.com/auth': { chatgpt_plan_type: 'plus', chatgpt_account_id: 'acct-xyz' },
});

// Fixture: neither top-level email nor profile email — both absent
const NO_EMAIL_TOKEN = buildToken({
  sub: 'user-abc',
  'https://api.openai.com/auth': {
    chatgpt_plan_type: 'free',
    chatgpt_account_id: 'acct-123',
  },
});

// Fixture: missing plan_type in auth claim
const MISSING_PLAN_TOKEN = buildToken({
  email: 'user@example.com',
  'https://api.openai.com/auth': {
    chatgpt_account_id: 'acct-no-plan',
  },
});

// Fixture: missing account_id in auth claim
const MISSING_ACCOUNT_ID_TOKEN = buildToken({
  email: 'user@example.com',
  'https://api.openai.com/auth': {
    chatgpt_plan_type: 'pro',
  },
});

// Fixture: no https://api.openai.com/auth claim at all
const NO_AUTH_CLAIM_TOKEN = buildToken({
  email: 'user@example.com',
  sub: 'user-abc',
});

function buildToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fakesig`;
}

beforeEach(async () => {
  const mod = await import('../../../src/codex-auth/decode-id-token');
  decodeIdToken = mod.decodeIdToken;
  hasStructurallyValidIdToken = mod.hasStructurallyValidIdToken;
});

describe('decodeIdToken', () => {
  it('extracts email, plan_type, account_id from standard nested JWT', () => {
    const result = decodeIdToken(VALID_NESTED_TOKEN);
    expect(result.email).toBe('user@example.com');
    expect(result.plan_type).toBe('pro');
    expect(result.account_id).toBe('4b0448c0-e4a2-4cc0-a70d-77065d613553');
  });

  it('falls back to profile email when top-level email is absent', () => {
    const result = decodeIdToken(PROFILE_EMAIL_TOKEN);
    expect(result.email).toBe('profile@example.com');
    expect(result.plan_type).toBe('plus');
    expect(result.account_id).toBe('acct-xyz');
  });

  it('returns {} for token with only 2 segments (malformed)', () => {
    const result = decodeIdToken('header.payload');
    expect(result).toEqual({});
  });

  it('returns {} for non-base64 garbage input', () => {
    const result = decodeIdToken('!!!.%%%.$$$');
    expect(result).toEqual({});
  });

  it('returns empty object when email is absent in both paths', () => {
    const result = decodeIdToken(NO_EMAIL_TOKEN);
    expect(result.email).toBeUndefined();
    expect(result.plan_type).toBe('free');
    expect(result.account_id).toBe('acct-123');
  });

  it('returns undefined plan_type when chatgpt_plan_type is absent', () => {
    const result = decodeIdToken(MISSING_PLAN_TOKEN);
    expect(result.email).toBe('user@example.com');
    expect(result.plan_type).toBeUndefined();
    expect(result.account_id).toBe('acct-no-plan');
  });

  it('returns undefined account_id when chatgpt_account_id is absent', () => {
    const result = decodeIdToken(MISSING_ACCOUNT_ID_TOKEN);
    expect(result.email).toBe('user@example.com');
    expect(result.plan_type).toBe('pro');
    expect(result.account_id).toBeUndefined();
  });

  it('returns partial result when https://api.openai.com/auth claim is absent', () => {
    const result = decodeIdToken(NO_AUTH_CLAIM_TOKEN);
    expect(result.email).toBe('user@example.com');
    expect(result.plan_type).toBeUndefined();
    expect(result.account_id).toBeUndefined();
  });

  it('does not throw on empty string input', () => {
    expect(() => decodeIdToken('')).not.toThrow();
    expect(decodeIdToken('')).toEqual({});
  });

  it('reports valid sparse JWT payloads as structurally valid', () => {
    expect(hasStructurallyValidIdToken(buildToken({}))).toBe(true);
  });

  it('rejects JWT segments with invalid base64url characters', () => {
    const [header, payload, signature] = buildToken({}).split('.');
    expect(hasStructurallyValidIdToken(`${header}.${payload}$.${signature}`)).toBe(false);
    expect(hasStructurallyValidIdToken(`${header}=.${payload}.${signature}`)).toBe(false);
  });

  it('rejects JWT segments with impossible base64url length', () => {
    const [header, payload] = buildToken({}).split('.');
    expect(hasStructurallyValidIdToken(`${header}.${payload}.a`)).toBe(false);
    expect(decodeIdToken(`${header}.${payload}.a`)).toEqual({});
  });
});
