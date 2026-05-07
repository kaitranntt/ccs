import { describe, expect, it } from 'bun:test';
import {
  getKiroStartIDCValidationError,
  getStartAuthFailureMessage,
  getStartAuthNicknameError,
  getStartUrlUnsupportedReason,
} from '../../../src/web-server/routes/cliproxy-auth-routes';

describe('cliproxy-auth-routes start-url guard', () => {
  it('rejects device code providers', () => {
    expect(getStartUrlUnsupportedReason('kiro')).toContain(
      "Kiro method 'aws' uses Device Code flow"
    );
    expect(getStartUrlUnsupportedReason('ghcp')).toContain("Provider 'ghcp' uses Device Code flow");
    expect(getStartUrlUnsupportedReason('qwen')).toContain("Provider 'qwen' uses Device Code flow");
    expect(getStartUrlUnsupportedReason('codebuddy')).toContain(
      "Provider 'codebuddy' uses Device Code flow"
    );
    expect(getStartUrlUnsupportedReason('kilo')).toContain("Provider 'kilo' uses Device Code flow");
  });

  it('allows Cursor browser URL auth on start-url', () => {
    expect(getStartUrlUnsupportedReason('cursor')).toBeNull();
  });

  it('allows Kiro social methods on start-url', () => {
    expect(getStartUrlUnsupportedReason('kiro', { kiroMethod: 'google' })).toBeNull();
    expect(getStartUrlUnsupportedReason('kiro', { kiroMethod: 'github' })).toBeNull();
  });

  it('rejects Kiro aws-authcode method on start-url', () => {
    expect(getStartUrlUnsupportedReason('kiro', { kiroMethod: 'aws-authcode' })).toContain(
      "Kiro method 'aws-authcode' uses CLI auth flow"
    );
  });

  it('rejects Kiro idc method on start-url', () => {
    expect(getStartUrlUnsupportedReason('kiro', { kiroMethod: 'idc' })).toContain(
      "Kiro method 'idc' uses CLI auth flow"
    );
  });

  it('allows authorization code providers', () => {
    expect(getStartUrlUnsupportedReason('gemini')).toBeNull();
    expect(getStartUrlUnsupportedReason('codex')).toBeNull();
    expect(getStartUrlUnsupportedReason('claude')).toBeNull();
    expect(getStartUrlUnsupportedReason('gitlab')).toBeNull();
  });
});

describe('cliproxy-auth-routes Kiro IDC start validation', () => {
  it('requires an IDC start URL when idc auth is selected', () => {
    expect(
      getKiroStartIDCValidationError({
        kiroMethod: 'idc',
        kiroIDCStartUrl: undefined,
        invalidKiroIDCFlow: false,
      })
    ).toEqual({
      error: 'Kiro IDC login requires kiroIDCStartUrl',
      code: 'MISSING_KIRO_IDC_START_URL',
    });
  });

  it('rejects invalid IDC flow values before triggerOAuth is called', () => {
    expect(
      getKiroStartIDCValidationError({
        kiroMethod: 'idc',
        kiroIDCStartUrl: 'https://d-123.awsapps.com/start',
        invalidKiroIDCFlow: true,
      })
    ).toEqual({
      error: 'Invalid kiroIDCFlow. Supported: authcode, device',
      code: 'INVALID_KIRO_IDC_FLOW',
    });
  });

  it('allows valid IDC start payloads through', () => {
    expect(
      getKiroStartIDCValidationError({
        kiroMethod: 'idc',
        kiroIDCStartUrl: 'https://d-123.awsapps.com/start',
        invalidKiroIDCFlow: false,
      })
    ).toBeNull();
  });
});

describe('cliproxy-auth-routes start failure messaging', () => {
  it('returns ghcp-specific guidance for Copilot verification failures', () => {
    expect(getStartAuthFailureMessage('ghcp')).toContain(
      'GitHub Copilot verification did not complete'
    );
  });

  it('keeps generic failure text for other providers', () => {
    expect(getStartAuthFailureMessage('gemini')).toBe('Authentication failed or was cancelled');
    expect(getStartAuthFailureMessage('kiro')).toBe('Authentication failed or was cancelled');
    expect(getStartAuthFailureMessage('gitlab')).toBe('Authentication failed or was cancelled');
  });
});

describe('cliproxy-auth-routes nickname validation', () => {
  it('allows Kiro and GHCP start requests without a nickname', () => {
    expect(getStartAuthNicknameError('kiro', undefined, [])).toBeNull();
    expect(getStartAuthNicknameError('ghcp', undefined, [])).toBeNull();
  });

  it('rejects invalid supplied nicknames for no-email providers', () => {
    expect(getStartAuthNicknameError('kiro', 'bad nickname', [])).toEqual({
      error: 'Nickname cannot contain whitespace',
      code: 'INVALID_NICKNAME',
    });
  });

  it('rejects nicknames that collide with an existing account id or nickname', () => {
    const existingAccounts = [
      { id: 'github-ABC123', nickname: 'work' },
      { id: 'ghcp-2', nickname: 'personal' },
    ];

    expect(getStartAuthNicknameError('ghcp', 'github-ABC123', existingAccounts)).toEqual({
      error: 'Nickname "github-ABC123" is already in use. Choose a different one.',
      code: 'NICKNAME_EXISTS',
    });

    expect(getStartAuthNicknameError('ghcp', 'work', existingAccounts)).toEqual({
      error: 'Nickname "work" is already in use. Choose a different one.',
      code: 'NICKNAME_EXISTS',
    });
  });

  it('allows reauth when the nickname already belongs to the same account', () => {
    const existingAccounts = [
      { id: 'github-ABC123', nickname: 'work' },
      { id: 'ghcp-2', nickname: 'personal' },
    ];

    expect(getStartAuthNicknameError('kiro', 'work', existingAccounts, 'github-ABC123')).toBeNull();
    expect(
      getStartAuthNicknameError('kiro', 'github-ABC123', existingAccounts, 'github-ABC123')
    ).toBeNull();
  });
});
