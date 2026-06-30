/**
 * Regression tests for the `ccs api create --cliproxy-provider <provider>` bridge path.
 *
 * The bridge path must use the same route rules as the main CLIProxy env-builder
 * (resolveCliproxyBridgeProfile / listCliproxyBridgeProviders) so both paths stay
 * consistent across backends.
 *
 * Background: the original CLIProxyAPI backend registers Claude-compatible routes at
 * the root. The /api/provider/<x> prefix is a Plus-only route. Using provider-scoped
 * routes against the original backend returns 404.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  resolveCliproxyBridgeProfile,
  listCliproxyBridgeProviders,
} from '../cliproxy-profile-bridge';
import { resolveCliproxyBridgeMetadata } from '../cliproxy-profile-bridge';
import { invalidateConfigCache } from '../../../config/config-loader-facade';
import { clearConfigCache } from '../../../cliproxy/config/base-config-loader';

describe('cliproxy-profile-bridge: backend-aware provider route paths', () => {
  let tempHome: string;
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    originalCcsHome = process.env.CCS_HOME;
    // Empty temp dir → loadOrCreateUnifiedConfig defaults to local target (127.0.0.1:8317).
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-bridge-test-'));
    process.env.CCS_HOME = tempHome;
    invalidateConfigCache();
    clearConfigCache();
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }
    invalidateConfigCache();
    clearConfigCache();
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  function writeBackendConfig(backend: 'original' | 'plus'): void {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    fs.writeFileSync(
      path.join(ccsDir, 'config.yaml'),
      ['version: 1', 'cliproxy:', `  backend: ${backend}`, ''].join('\n'),
      'utf8'
    );
    invalidateConfigCache();
    clearConfigCache();
  }

  // ── resolveCliproxyBridgeProfile ──────────────────────────────────────────

  it('resolveCliproxyBridgeProfile(claude) produces root base URL', () => {
    const profile = resolveCliproxyBridgeProfile('claude');
    // Must be the root URL — NOT /api/provider/claude.
    expect(profile.baseUrl).toBe('http://127.0.0.1:8317/');
    expect(profile.baseUrl).not.toContain('/api/provider/claude');
  });

  it('resolveCliproxyBridgeProfile(claude) reports root routePath', () => {
    const profile = resolveCliproxyBridgeProfile('claude');
    expect(profile.routePath).toBe('/');
  });

  it('resolveCliproxyBridgeProfile(claude) does not leak model pins (model-neutral)', () => {
    const profile = resolveCliproxyBridgeProfile('claude');
    expect(profile.models.default).toBe('');
    expect(profile.models.opus).toBe('');
    expect(profile.models.sonnet).toBe('');
    expect(profile.models.haiku).toBe('');
  });

  it('resolveCliproxyBridgeProfile(gemini) uses root URL on the original backend', () => {
    const profile = resolveCliproxyBridgeProfile('gemini');
    expect(profile.baseUrl).toBe('http://127.0.0.1:8317/');
    expect(profile.routePath).toBe('/');
  });

  it('resolveCliproxyBridgeProfile(codex) uses root URL on the original backend', () => {
    const profile = resolveCliproxyBridgeProfile('codex');
    expect(profile.baseUrl).toBe('http://127.0.0.1:8317/');
    expect(profile.routePath).toBe('/');
  });

  it('resolveCliproxyBridgeProfile(codex) uses scoped path on the plus backend', () => {
    writeBackendConfig('plus');
    const profile = resolveCliproxyBridgeProfile('codex');
    expect(profile.baseUrl).toContain('/api/provider/codex');
    expect(profile.routePath).toBe('/api/provider/codex');
  });

  // ── listCliproxyBridgeProviders ───────────────────────────────────────────

  it('listCliproxyBridgeProviders shows root routePath for claude', () => {
    const providers = listCliproxyBridgeProviders();
    const claudeInfo = providers.find((p) => p.provider === 'claude');
    expect(claudeInfo).toBeDefined();
    expect(claudeInfo?.routePath).toBe('/');
    expect(claudeInfo?.routePath).not.toContain('/api/provider/claude');
  });

  it('listCliproxyBridgeProviders shows root routePaths for original-backend providers', () => {
    const providers = listCliproxyBridgeProviders();
    for (const info of providers) {
      expect(info.routePath).toBe('/');
    }
  });

  it('listCliproxyBridgeProviders keeps scoped routePaths for plus-backend non-claude providers', () => {
    writeBackendConfig('plus');
    const providers = listCliproxyBridgeProviders();
    for (const info of providers) {
      if (info.provider === 'claude') continue;
      expect(info.routePath).toBe(`/api/provider/${info.provider}`);
    }
  });

  // ── resolveCliproxyBridgeMetadata fallback behaviour under root URL ───────
  //
  // When a claude profile stores the fixed root URL (http://127.0.0.1:8317/),
  // extractProviderFromPathname('/') returns null (no /api/provider/ segment),
  // so resolveCliproxyBridgeMetadata returns null for that settings object.
  // Dashboard routes fall back to mapExternalProviderName(profile.name) or the
  // profile's cliproxyProvider field — both benign paths that still identify the
  // provider correctly.  This test locks the null-return so a future change to
  // extractProviderFromPathname cannot silently introduce a regression.

  it('resolveCliproxyBridgeMetadata returns null for a root-URL claude settings object (benign fallback locked)', () => {
    const settings = {
      env: {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/',
        ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
      },
    };
    // extractProviderFromPathname cannot identify the provider from a root path.
    // The caller falls back to profile.name / cliproxyBridge from other sources.
    expect(resolveCliproxyBridgeMetadata(settings)).toBeNull();
  });

  it('resolveCliproxyBridgeMetadata still resolves non-claude providers from scoped URL', () => {
    const settings = {
      env: {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:8317/api/provider/gemini',
        ANTHROPIC_AUTH_TOKEN: 'ccs-internal-managed',
      },
    };
    const meta = resolveCliproxyBridgeMetadata(settings);
    expect(meta).not.toBeNull();
    expect(meta?.provider).toBe('gemini');
  });
});
