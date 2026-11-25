/**
 * OAuth Handler for CLIProxyAPI (Facade)
 *
 * Re-exports credential validation, paste-callback handling, interactive prompts,
 * and interactive OAuth flow orchestration while preserving 100% public API compatibility.
 */

export {
  PLUS_OAUTH_ENV_BY_PROVIDER,
  getPlusOAuthCredentialError,
  getPlusAuthUrlCredentialError,
  getGeminiPlusOAuthCredentialError,
  getGeminiAuthUrlCredentialError,
  getCliAuthNicknameError,
  normalizeGitLabBaseUrl,
  usesKiroLocalCallbackReplay,
} from './oauth-handler/credential-validation';

export {
  requestPasteCallbackStart,
  findNewTokenSnapshotForManualAuth,
  resolvePasteCallbackAuthUrl,
  handlePasteCallbackMode,
} from './oauth-handler/paste-callback-handler';

export { promptGitLabPersonalAccessToken } from './oauth-handler/interactive-prompts';

export { triggerOAuth, ensureAuth } from './oauth-handler/interactive-flow';
