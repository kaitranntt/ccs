/**
 * OAuth Process Execution for CLIProxyAPI (Facade)
 *
 * Re-exports OAuth process options, output/failure parsers, and process launcher
 * while preserving 100% public API compatibility.
 */

export type { OAuthProcessOptions } from './oauth-process/types';

export {
  extractDeviceCodePrompt,
  resolveDeviceCodeVerificationUrl,
  isLoopbackHost,
  getExpectedLocalCallback,
  validateManualCallbackUrl,
  getKiroBuilderIdSelectionInput,
  extractLikelyOAuthAuthorizationUrl,
  extractLikelyAuthFailureFromLogs,
  extractLikelyAuthFailureFromStderr,
  analyzeSuccessfulAuthExit,
} from './oauth-process/output-parser';

export { executeOAuthProcess } from './oauth-process/launcher';
