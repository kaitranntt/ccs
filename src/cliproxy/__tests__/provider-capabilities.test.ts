import { describe, expect, it } from 'bun:test';
import {
  buildProviderAliasMap,
  CLIPROXY_PROVIDER_IDS,
  getDeviceCodeVerificationProviders,
  getOAuthCallbackPort,
  getOAuthFlowType,
  PROVIDER_CAPABILITIES,
  getProviderDisplayName,
  getProvidersByOAuthFlow,
  isCLIProxyProvider,
  mapExternalProviderName,
  QUOTA_SUPPORTED_PROVIDER_IDS,
  isQuotaSupportedProvider,
  QUOTA_PROVIDER_OPTION_VALUES,
  QUOTA_PROVIDER_HELP_TEXT,
} from '../provider-capabilities';
import {
  OAUTH_CALLBACK_PORTS as DIAGNOSTIC_CALLBACK_PORTS,
  OAUTH_FLOW_TYPES,
} from '../../management/oauth-port-diagnostics';
import {
  DEFAULT_KIRO_AUTH_METHOD,
  getKiroCallbackPort,
  getKiroCLIAuthArgs,
  getKiroCLIAuthFlag,
  normalizeKiroIDCFlow,
  normalizeKiroAuthMethod,
  OAUTH_CALLBACK_PORTS as AUTH_CALLBACK_PORTS,
  toKiroManagementMethod,
} from '../auth/auth-types';

describe('provider-capabilities', () => {
  it('keeps canonical provider IDs backward-compatible', () => {
    expect(CLIPROXY_PROVIDER_IDS).toEqual([
      'gemini',
      'codex',
      'agy',
      'qwen',
      'iflow',
      'kiro',
      'ghcp',
      'claude',
      'kimi',
      'cursor',
      'gitlab',
      'codebuddy',
      'kilo',
    ]);
  });

  it('validates provider IDs', () => {
    expect(isCLIProxyProvider('gemini')).toBe(true);
    expect(isCLIProxyProvider('ghcp')).toBe(true);
    expect(isCLIProxyProvider('gitlab')).toBe(true);
    expect(isCLIProxyProvider('not-a-provider')).toBe(false);
    expect(isCLIProxyProvider('Gemini')).toBe(false);
  });

  it('returns providers by OAuth flow capability', () => {
    expect(getProvidersByOAuthFlow('device_code')).toEqual([
      'qwen',
      'kiro',
      'ghcp',
      'kimi',
      'cursor',
      'codebuddy',
      'kilo',
    ]);
    expect(getProvidersByOAuthFlow('authorization_code')).toEqual([
      'gemini',
      'codex',
      'agy',
      'iflow',
      'claude',
      'gitlab',
    ]);
  });

  it('separates browser URL auth providers from verification-code device flows', () => {
    expect(getDeviceCodeVerificationProviders()).toEqual([
      'qwen',
      'kiro',
      'ghcp',
      'kimi',
      'codebuddy',
      'kilo',
    ]);
  });

  it('maps external provider aliases to canonical IDs', () => {
    expect(mapExternalProviderName('gemini-cli')).toBe('gemini');
    expect(mapExternalProviderName('antigravity')).toBe('agy');
    expect(mapExternalProviderName('codewhisperer')).toBe('kiro');
    expect(mapExternalProviderName('github-copilot')).toBe('ghcp');
    expect(mapExternalProviderName('copilot')).toBe('ghcp');
    expect(mapExternalProviderName('anthropic')).toBe('claude');
    expect(mapExternalProviderName('gitlab-duo')).toBe('gitlab');
    expect(mapExternalProviderName('tencent')).toBe('codebuddy');
    expect(mapExternalProviderName('  COPILOT  ')).toBe('ghcp');
    expect(mapExternalProviderName('')).toBeNull();
    expect(mapExternalProviderName('unknown-provider')).toBeNull();
  });

  it('exposes quota-supported providers and guards correctly', () => {
    expect(QUOTA_SUPPORTED_PROVIDER_IDS).toEqual(['agy', 'codex', 'claude', 'gemini', 'ghcp']);
    expect(QUOTA_PROVIDER_OPTION_VALUES).toEqual([
      'agy',
      'codex',
      'claude',
      'gemini',
      'ghcp',
      'antigravity',
      'anthropic',
      'gemini-cli',
      'github-copilot',
      'copilot',
      'all',
    ]);
    expect(QUOTA_PROVIDER_HELP_TEXT).toBe(
      'agy, codex, claude, gemini, ghcp, antigravity, anthropic, gemini-cli, github-copilot, copilot, all'
    );
    expect(isQuotaSupportedProvider('ghcp')).toBe(true);
    expect(isQuotaSupportedProvider('kiro')).toBe(false);
  });

  it('exposes callback port and display name capabilities', () => {
    expect(getOAuthCallbackPort('qwen')).toBeNull();
    expect(getOAuthCallbackPort('kiro')).toBeNull();
    expect(getOAuthCallbackPort('cursor')).toBeNull();
    expect(getOAuthCallbackPort('gitlab')).toBe(17171);
    expect(getOAuthCallbackPort('gemini')).toBe(8085);
    expect(PROVIDER_CAPABILITIES.gemini.refreshOwnership).toBe('cliproxy');
    expect(getProviderDisplayName('agy')).toBe('Antigravity');
    expect(getProviderDisplayName('kilo')).toBe('Kilo AI');
  });

  it('throws when provider aliases collide across providers', () => {
    const capabilitiesWithCollision = {
      ...PROVIDER_CAPABILITIES,
      gemini: {
        ...PROVIDER_CAPABILITIES.gemini,
        aliases: ['shared-alias'],
      },
      codex: {
        ...PROVIDER_CAPABILITIES.codex,
        aliases: ['shared-alias'],
      },
    };

    expect(() =>
      buildProviderAliasMap(capabilitiesWithCollision as typeof PROVIDER_CAPABILITIES)
    ).toThrow(/shared-alias/i);
  });

  it('keeps diagnostics flow metadata in sync with provider capabilities', () => {
    for (const provider of CLIPROXY_PROVIDER_IDS) {
      expect(OAUTH_FLOW_TYPES[provider]).toBe(getOAuthFlowType(provider));
      expect(DIAGNOSTIC_CALLBACK_PORTS[provider]).toBe(getOAuthCallbackPort(provider));
    }
  });

  it('does not define callback ports for device code providers in auth constants', () => {
    for (const provider of getProvidersByOAuthFlow('device_code')) {
      expect(AUTH_CALLBACK_PORTS[provider]).toBeUndefined();
    }
  });

  it('maps Kiro auth methods to upstream CLI/management contracts', () => {
    expect(DEFAULT_KIRO_AUTH_METHOD).toBe('aws');
    expect(normalizeKiroAuthMethod()).toBe('aws');
    expect(normalizeKiroAuthMethod('GOOGLE')).toBe('google');
    expect(normalizeKiroAuthMethod('IDC')).toBe('idc');
    expect(normalizeKiroAuthMethod('not-valid')).toBe('aws');
    expect(normalizeKiroIDCFlow()).toBe('authcode');
    expect(normalizeKiroIDCFlow('DEVICE')).toBe('device');

    expect(getKiroCLIAuthFlag('aws')).toBe('--kiro-aws-login');
    expect(getKiroCLIAuthFlag('aws-authcode')).toBe('--kiro-aws-authcode');
    expect(getKiroCLIAuthFlag('google')).toBe('--kiro-google-login');
    expect(getKiroCLIAuthFlag('idc')).toBe('--kiro-idc-login');
    expect(getKiroCLIAuthArgs('idc', { idcStartUrl: 'https://d-123.awsapps.com/start' })).toEqual([
      '--kiro-idc-login',
      '--kiro-idc-start-url',
      'https://d-123.awsapps.com/start',
      '--kiro-idc-flow',
      'authcode',
    ]);

    expect(getKiroCallbackPort('aws')).toBeNull();
    expect(getKiroCallbackPort('google')).toBe(9876);
    expect(getKiroCallbackPort('github')).toBe(9876);
    expect(getKiroCallbackPort('aws-authcode')).toBe(9876);
    expect(getKiroCallbackPort('idc')).toBe(9876);
    expect(getKiroCallbackPort('idc', { idcFlow: 'device' })).toBeNull();

    expect(toKiroManagementMethod('aws')).toBe('aws');
    expect(toKiroManagementMethod('aws-authcode')).toBe('aws');
    expect(toKiroManagementMethod('google')).toBe('google');
    expect(toKiroManagementMethod('github')).toBe('github');
    expect(toKiroManagementMethod('idc')).toBeNull();
  });
});
