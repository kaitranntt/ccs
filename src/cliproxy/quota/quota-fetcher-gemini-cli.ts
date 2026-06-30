/**
 * Quota Fetcher for Gemini CLI Accounts (barrel)
 *
 * Fetches quota information from Google Cloud Code internal API.
 * Used for displaying bucket-based quotas grouped by model series.
 *
 * This file is a thin re-export barrel. The implementation has been split
 * into focused submodules under `./quota-fetcher-gemini-cli/`:
 *   - token-parsing:         access token / expiry / project-id extraction
 *   - auth-file-discovery:   on-disk auth-file lookup and parsing
 *   - managed-request:       managed (CLIProxy) + direct upstream HTTP paths
 *   - supplementary-metadata: tier / credit resolution (loadCodeAssist)
 *   - error-parsing:         error-body sanitization and failure-result builders
 *   - bucket-building:       raw bucket -> normalized GeminiCliBucket array
 *   - quota-fetcher:         top-level fetchGeminiCliQuota orchestration
 *
 * Public surface is preserved exactly: every previously-importable symbol
 * keeps its name and signature. Token values are never logged.
 */

export {
  fetchGeminiCliQuota,
  fetchAllGeminiCliQuotas,
  resolveGeminiCliProjectId,
  buildGeminiCliBuckets,
  __testExports,
} from './quota-fetcher-gemini-cli/index';
