/**
 * Default Port Sync Test
 *
 * Keeps backend and UI default ports in sync while allowing independent modules.
 */

import { describe, expect, test } from 'bun:test';
import { CLIPROXY_DEFAULT_PORT as BACKEND_CLIPROXY_DEFAULT_PORT } from '../port-manager';
import { DEFAULT_CURSOR_PORT as BACKEND_CURSOR_DEFAULT_PORT } from '../../../cursor/cursor-models';
import {
  CLIPROXY_PROVIDER_IDS as BACKEND_CLIPROXY_PROVIDER_IDS,
  getDeviceCodeVerificationProviders,
  getProviderDescription as getBackendProviderDescription,
  getProviderDisplayName as getBackendProviderDisplayName,
} from '../../provider-capabilities';
import {
  CLIPROXY_DEFAULT_PORT as UI_CLIPROXY_DEFAULT_PORT,
  DEFAULT_CURSOR_PORT as UI_CURSOR_DEFAULT_PORT,
} from '../../../../ui/src/lib/default-ports';
import {
  CLIPROXY_PROVIDERS as UI_CLIPROXY_PROVIDERS,
  CORE_CLIPROXY_PROVIDERS as UI_CORE_CLIPROXY_PROVIDERS,
  PLUS_EXTRA_CLIPROXY_PROVIDERS as UI_PLUS_EXTRA_CLIPROXY_PROVIDERS,
  PROVIDER_METADATA as UI_PROVIDER_METADATA,
  VERIFICATION_CODE_AUTH_PROVIDERS as UI_VERIFICATION_CODE_AUTH_PROVIDERS,
} from '../../../../ui/src/lib/provider-config';
import { PLUS_ONLY_PROVIDERS as BACKEND_PLUS_ONLY_PROVIDERS } from '../../types/index';

function sorted(values: readonly string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

describe('Default Port Sync', () => {
  test('CLIProxy default port is synced between backend and UI', () => {
    expect(UI_CLIPROXY_DEFAULT_PORT).toBe(BACKEND_CLIPROXY_DEFAULT_PORT);
  });

  test('Cursor default port is synced between backend and UI', () => {
    expect(UI_CURSOR_DEFAULT_PORT).toBe(BACKEND_CURSOR_DEFAULT_PORT);
  });

  test('CLIProxy provider IDs are synced between backend and UI', () => {
    expect(sorted(UI_CLIPROXY_PROVIDERS)).toEqual(sorted(BACKEND_CLIPROXY_PROVIDER_IDS));
  });

  test('verification-code auth providers are synced between backend and UI', () => {
    expect(sorted(UI_VERIFICATION_CODE_AUTH_PROVIDERS)).toEqual(
      sorted(getDeviceCodeVerificationProviders())
    );
  });

  test('plus-extra providers are synced between backend and UI', () => {
    expect(sorted(UI_PLUS_EXTRA_CLIPROXY_PROVIDERS)).toEqual(sorted(BACKEND_PLUS_ONLY_PROVIDERS));
    expect(sorted(UI_CORE_CLIPROXY_PROVIDERS)).toEqual(
      sorted(
        BACKEND_CLIPROXY_PROVIDER_IDS.filter(
          (provider) => !BACKEND_PLUS_ONLY_PROVIDERS.includes(provider)
        )
      )
    );
  });

  test('Provider display names are synced between backend and UI', () => {
    for (const provider of BACKEND_CLIPROXY_PROVIDER_IDS) {
      expect(UI_PROVIDER_METADATA[provider].displayName).toBe(
        getBackendProviderDisplayName(provider)
      );
    }
  });

  test('Provider descriptions are synced between backend and UI', () => {
    for (const provider of BACKEND_CLIPROXY_PROVIDER_IDS) {
      expect(UI_PROVIDER_METADATA[provider].description).toBe(
        getBackendProviderDescription(provider)
      );
    }
  });
});
