/**
 * Quota Fetcher for Antigravity Accounts (barrel).
 *
 * Fetches quota information from the Google Cloud Code internal API.
 * Used for displaying remaining quota percentages and reset times.
 *
 * This file is a thin barrel over the focused submodules in ./quota-fetcher/.
 * The public API surface (exports, signatures, types, and __testExports) is
 * preserved exactly so all existing imports from 'quota-fetcher' keep working.
 */

// Public types
export type { ModelQuota, QuotaResult, AllAccountsQuotaResult } from './quota-fetcher/types';

// Public functions
export { fetchAccountQuota } from './quota-fetcher/account-quota-fetcher';
export { fetchAllProviderQuotas } from './quota-fetcher/all-accounts-fetcher';
export { findAvailableAccount } from './quota-fetcher/all-accounts-fetcher';
export { readProjectIdFromAuthFile } from './quota-fetcher/auth-file-reader';

// Test-only exports (consumed by quota-fetcher-antigravity-failure.test.ts via
// dynamic import of ../quota-fetcher?...). buildAntigravityFailure is the only
// pure helper exercised through this surface; keep it stable.
export { buildAntigravityFailure } from './quota-fetcher/status-classifier';
import { buildAntigravityFailure } from './quota-fetcher/status-classifier';

export const __testExports = {
  buildAntigravityFailure,
};
