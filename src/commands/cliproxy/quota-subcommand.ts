/**
 * CLIProxy Quota Management - public barrel.
 *
 * Source lives in ./quota-subcommand/. This file re-exports the original
 * public surface so existing importers (src/commands/cliproxy/index.ts and
 * the unit-test module loader) are unaffected by the god-file split.
 *
 * Public surface (unchanged):
 *   - handleQuotaStatus   (`ccs cliproxy quota`)
 *   - handleDoctor        (`ccs cliproxy doctor` / `diag`)
 *   - handleSetDefault    (`ccs cliproxy default <account>`)
 *   - handlePauseAccount  (`ccs cliproxy pause <account>`)
 *   - handleResumeAccount (`ccs cliproxy resume <account>`)
 *   - __testExports       (helpers consumed by the unit test loader)
 */

export {
  handleQuotaStatus,
  handleDoctor,
  handleSetDefault,
  handlePauseAccount,
  handleResumeAccount,
} from './quota-subcommand/handlers';
export { __testExports } from './quota-subcommand/test-exports';
