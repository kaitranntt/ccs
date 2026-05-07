import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ProxyTarget } from '../../proxy/proxy-target-resolver';
import { InteractivePrompt } from '../../../utils/prompt';
import { getCapturedFetchRequests, mockFetch, restoreFetch } from '../../../../tests/mocks';

const remoteTarget: ProxyTarget = {
  host: 'proxy.example.com',
  port: 8317,
  protocol: 'https',
  managementKey: 'test-mgmt-key',
  isRemote: true,
};

afterEach(() => {
  restoreFetch();
});

describe('requestPasteCallbackStart', () => {
  it('uses management auth-url route for non-kiro providers', async () => {
    mockFetch([
      {
        url: /\/v0\/management\/anthropic-auth-url\?is_webui=true$/,
        response: { auth_url: 'https://auth.example.com/claude' },
      },
    ]);

    const { requestPasteCallbackStart } = await import(
      `../oauth-handler?request-claude-start=${Date.now()}`
    );
    const startData = await requestPasteCallbackStart('claude', remoteTarget);

    expect(startData.auth_url).toBe('https://auth.example.com/claude');

    const [request] = getCapturedFetchRequests();
    expect(request.url).toBe(
      'https://proxy.example.com:8317/v0/management/anthropic-auth-url?is_webui=true'
    );
    expect(request.method).toBe('GET');
    expect(request.headers['Authorization']).toBe('Bearer test-mgmt-key');
    expect(request.headers['Content-Type']).toBeUndefined();
  });

  it('uses the Kiro management auth-url route for paste-callback compatible methods', async () => {
    mockFetch([
      {
        url: /\/v0\/management\/kiro-auth-url\?is_webui=true&method=aws$/,
        response: { auth_url: 'https://auth.example.com/kiro' },
      },
    ]);

    const { requestPasteCallbackStart } = await import(
      `../oauth-handler?request-kiro-start=${Date.now()}`
    );
    const startData = await requestPasteCallbackStart('kiro', remoteTarget, {
      kiroMethod: 'aws',
    });

    expect(startData.auth_url).toBe('https://auth.example.com/kiro');

    const [request] = getCapturedFetchRequests();
    expect(request.url).toBe(
      'https://proxy.example.com:8317/v0/management/kiro-auth-url?is_webui=true&method=aws'
    );
    expect(request.method).toBe('GET');
    expect(request.headers['Authorization']).toBe('Bearer test-mgmt-key');
    expect(request.headers['Content-Type']).toBeUndefined();
  });

  it('throws for Kiro methods that require the local callback server flow', async () => {
    const { requestPasteCallbackStart } = await import(
      `../oauth-handler?request-kiro-authcode-start=${Date.now()}`
    );

    await expect(
      requestPasteCallbackStart('kiro', remoteTarget, { kiroMethod: 'aws-authcode' })
    ).rejects.toThrow(/paste-callback start is not available/i);
  });
});

describe('Gemini Plus OAuth credential diagnostics', () => {
  it('fails fast when Gemini uses Plus without OAuth client env', async () => {
    const { getGeminiPlusOAuthCredentialError } = await import(
      `../oauth-handler?gemini-plus-missing-env=${Date.now()}`
    );

    const error = getGeminiPlusOAuthCredentialError('gemini', 'plus', {});

    expect(error).toContain('Gemini OAuth from CLIProxy Plus is missing');
    expect(error).toContain('CLIPROXY_GEMINI_OAUTH_CLIENT_ID');
    expect(error).toContain('CLIPROXY_GEMINI_OAUTH_CLIENT_SECRET');
    expect(error).toContain('cliproxy.backend');
    expect(error).toContain('original');
  });

  it('allows Gemini Plus when both OAuth client env values exist', async () => {
    const { getGeminiPlusOAuthCredentialError } = await import(
      `../oauth-handler?gemini-plus-env-present=${Date.now()}`
    );

    expect(
      getGeminiPlusOAuthCredentialError('gemini', 'plus', {
        CLIPROXY_GEMINI_OAUTH_CLIENT_ID: 'client-id',
        CLIPROXY_GEMINI_OAUTH_CLIENT_SECRET: 'client-secret',
      })
    ).toBeNull();
  });

  it('does not warn for Gemini on the original backend', async () => {
    const { getGeminiPlusOAuthCredentialError } = await import(
      `../oauth-handler?gemini-original-backend=${Date.now()}`
    );

    expect(getGeminiPlusOAuthCredentialError('gemini', 'original', {})).toBeNull();
  });

  it('detects Gemini auth URLs missing client_id before display', async () => {
    const { getGeminiAuthUrlCredentialError } = await import(
      `../oauth-handler?gemini-auth-url-missing-client=${Date.now()}`
    );

    const error = getGeminiAuthUrlCredentialError(
      'gemini',
      'https://accounts.google.com/o/oauth2/v2/auth?client_id=&redirect_uri=http%3A%2F%2Flocalhost%3A8085%2Foauth2callback&state=test'
    );

    expect(error).toContain('Gemini OAuth from CLIProxy Plus is missing');
  });

  it('allows Gemini auth URLs with client_id present', async () => {
    const { getGeminiAuthUrlCredentialError } = await import(
      `../oauth-handler?gemini-auth-url-client-present=${Date.now()}`
    );

    expect(
      getGeminiAuthUrlCredentialError(
        'gemini',
        'https://accounts.google.com/o/oauth2/v2/auth?client_id=test-client&redirect_uri=http%3A%2F%2Flocalhost%3A8085%2Foauth2callback&state=test'
      )
    ).toBeNull();
  });
});

describe('usesKiroLocalCallbackReplay', () => {
  it('limits local callback replay to CLI auth-code flows', async () => {
    const { usesKiroLocalCallbackReplay } = await import(
      `../oauth-handler?kiro-local-callback-mode=${Date.now()}`
    );

    expect(usesKiroLocalCallbackReplay('aws-authcode', 'authcode')).toBe(true);
    expect(usesKiroLocalCallbackReplay('idc', 'authcode')).toBe(true);
    expect(usesKiroLocalCallbackReplay('idc', 'device')).toBe(false);
    expect(usesKiroLocalCallbackReplay('google', 'authcode')).toBe(false);
    expect(usesKiroLocalCallbackReplay('aws', 'authcode')).toBe(false);
  });
});

describe('resolvePasteCallbackAuthUrl', () => {
  it('returns the immediate auth URL without polling', async () => {
    const { resolvePasteCallbackAuthUrl } = await import(
      `../oauth-handler?resolve-immediate-auth-url=${Date.now()}`
    );
    const authUrl = await resolvePasteCallbackAuthUrl(
      remoteTarget,
      { auth_url: 'https://auth.example.com/direct' },
      50,
      0
    );

    expect(authUrl).toBe('https://auth.example.com/direct');
    expect(getCapturedFetchRequests()).toHaveLength(0);
  });

  it('polls management status when the start response only returns state', async () => {
    mockFetch([
      {
        url: /\/v0\/management\/get-auth-status\?state=state-123$/,
        response: { status: 'auth_url', auth_url: 'https://auth.example.com/polled' },
      },
    ]);

    const { resolvePasteCallbackAuthUrl } = await import(
      `../oauth-handler?resolve-polled-auth-url=${Date.now()}`
    );
    const authUrl = await resolvePasteCallbackAuthUrl(remoteTarget, { state: 'state-123' }, 50, 0);

    expect(authUrl).toBe('https://auth.example.com/polled');

    const [request] = getCapturedFetchRequests();
    expect(request.url).toBe(
      'https://proxy.example.com:8317/v0/management/get-auth-status?state=state-123'
    );
    expect(request.method).toBe('GET');
    expect(request.headers['Authorization']).toBe('Bearer test-mgmt-key');
  });
});

describe('findNewTokenSnapshotForManualAuth', () => {
  it('detects newly created provider token files', async () => {
    const tokenDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-kiro-manual-auth-'));
    const existingFile = path.join(tokenDir, 'kiro-existing.json');
    fs.writeFileSync(existingFile, JSON.stringify({ type: 'kiro', email: 'existing@example.com' }));
    const existingMtimeMs = fs.statSync(existingFile).mtimeMs;

    const { findNewTokenSnapshotForManualAuth } = await import(
      `../oauth-handler?manual-auth-new-token=${Date.now()}`
    );

    const newFile = path.join(tokenDir, 'kiro-new.json');
    fs.writeFileSync(newFile, JSON.stringify({ type: 'kiro', email: 'new@example.com' }));

    const snapshot = findNewTokenSnapshotForManualAuth('kiro', tokenDir, [
      { file: 'kiro-existing.json', mtimeMs: existingMtimeMs },
    ]);

    expect(snapshot?.file).toBe('kiro-new.json');
    fs.rmSync(tokenDir, { recursive: true, force: true });
  });

  it('treats a modified existing token as the new token during reauth', async () => {
    const tokenDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-kiro-reauth-'));
    const tokenFile = path.join(tokenDir, 'kiro-existing.json');
    fs.writeFileSync(tokenFile, JSON.stringify({ type: 'kiro', email: 'existing@example.com' }));
    const existingMtimeMs = fs.statSync(tokenFile).mtimeMs;

    const { findNewTokenSnapshotForManualAuth } = await import(
      `../oauth-handler?manual-auth-updated-token=${Date.now()}`
    );

    fs.writeFileSync(
      tokenFile,
      JSON.stringify({ type: 'kiro', email: 'existing@example.com', refreshed: true })
    );
    const bumpedTime = new Date(existingMtimeMs + 10_000);
    fs.utimesSync(tokenFile, bumpedTime, bumpedTime);

    const snapshot = findNewTokenSnapshotForManualAuth(
      'kiro',
      tokenDir,
      [{ file: 'kiro-existing.json', mtimeMs: existingMtimeMs }],
      'kiro-existing.json'
    );

    expect(snapshot?.file).toBe('kiro-existing.json');
    fs.rmSync(tokenDir, { recursive: true, force: true });
  });
});

describe('getCliAuthNicknameError', () => {
  it('allows omitted nicknames for no-email providers', async () => {
    const { getCliAuthNicknameError } = await import(
      `../oauth-handler?cli-nickname-empty=${Date.now()}`
    );

    expect(getCliAuthNicknameError('kiro', undefined, [])).toBeNull();
    expect(getCliAuthNicknameError('ghcp', undefined, [])).toBeNull();
  });

  it('rejects invalid supplied nicknames before OAuth starts', async () => {
    const { getCliAuthNicknameError } = await import(
      `../oauth-handler?cli-nickname-invalid=${Date.now()}`
    );

    expect(getCliAuthNicknameError('kiro', 'bad nickname', [])).toBe(
      'Nickname cannot contain whitespace'
    );
  });

  it('rejects supplied nicknames that collide with existing ids or nicknames', async () => {
    const { getCliAuthNicknameError } = await import(
      `../oauth-handler?cli-nickname-conflict=${Date.now()}`
    );
    const existingAccounts = [
      { id: 'github-ABC123', nickname: 'work' },
      { id: 'ghcp-2', nickname: 'personal' },
    ];

    expect(getCliAuthNicknameError('ghcp', 'github-ABC123', existingAccounts)).toBe(
      'Nickname "github-ABC123" is already in use. Choose a different one.'
    );
    expect(getCliAuthNicknameError('ghcp', 'work', existingAccounts)).toBe(
      'Nickname "work" is already in use. Choose a different one.'
    );
  });

  it('allows reauth when the supplied nickname already belongs to the same account', async () => {
    const { getCliAuthNicknameError } = await import(
      `../oauth-handler?cli-nickname-reauth=${Date.now()}`
    );
    const existingAccounts = [
      { id: 'github-ABC123', nickname: 'work' },
      { id: 'amazon-XYZ789', nickname: 'personal' },
    ];

    expect(getCliAuthNicknameError('kiro', 'work', existingAccounts, 'github-ABC123')).toBeNull();
    expect(
      getCliAuthNicknameError('kiro', 'github-ABC123', existingAccounts, 'github-ABC123')
    ).toBeNull();
  });
});

describe('promptGitLabPersonalAccessToken', () => {
  it('uses the masked password prompt and trims the token', async () => {
    const passwordSpy = spyOn(InteractivePrompt, 'password').mockImplementation(
      mock(async () => '  glpat-secret-token  ')
    );

    const { promptGitLabPersonalAccessToken } = await import(
      `../oauth-handler?gitlab-pat-prompt=${Date.now()}`
    );

    await expect(promptGitLabPersonalAccessToken()).resolves.toBe('glpat-secret-token');
    expect(passwordSpy).toHaveBeenCalledWith('GitLab Personal Access Token');
  });

  it('returns null when the masked prompt is left blank', async () => {
    const passwordSpy = spyOn(InteractivePrompt, 'password').mockImplementation(
      mock(async () => '   ')
    );

    const { promptGitLabPersonalAccessToken } = await import(
      `../oauth-handler?gitlab-pat-prompt-blank=${Date.now()}`
    );

    await expect(promptGitLabPersonalAccessToken()).resolves.toBeNull();
    expect(passwordSpy).toHaveBeenCalledWith('GitLab Personal Access Token');
  });
});

describe('normalizeGitLabBaseUrl', () => {
  it('returns undefined for blank values', async () => {
    const { normalizeGitLabBaseUrl } = await import(
      `../oauth-handler?gitlab-url-empty=${Date.now()}`
    );

    expect(normalizeGitLabBaseUrl(undefined)).toBeUndefined();
    expect(normalizeGitLabBaseUrl('   ')).toBeUndefined();
  });

  it('normalizes whitespace and trailing slashes for self-hosted URLs', async () => {
    const { normalizeGitLabBaseUrl } = await import(
      `../oauth-handler?gitlab-url-normalize=${Date.now()}`
    );

    expect(normalizeGitLabBaseUrl(' https://gitlab.example.com/custom/ ')).toBe(
      'https://gitlab.example.com/custom'
    );
  });

  it('rejects malformed or scheme-less URLs before hitting CLIProxy', async () => {
    const { normalizeGitLabBaseUrl } = await import(
      `../oauth-handler?gitlab-url-invalid=${Date.now()}`
    );

    expect(() => normalizeGitLabBaseUrl('gitlab.example.com')).toThrow(
      'GitLab URL must be a valid http:// or https:// URL'
    );
    expect(() => normalizeGitLabBaseUrl('ftp://gitlab.example.com')).toThrow(
      'GitLab URL must use http:// or https://'
    );
  });
});
