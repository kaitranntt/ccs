/**
 * Cursor Module Index
 *
 * Central exports for Cursor IDE integration.
 */

// Types
export * from './types';

// Auth
export {
  autoDetectTokens,
  validateToken,
  saveCredentials,
  loadCredentials,
  deleteCredentials,
  checkAuthStatus,
} from './cursor-auth';

// Daemon
export {
  isDaemonRunning,
  getDaemonStatus,
  startDaemon,
  stopDaemon,
  getPidFromFile,
  writePidToFile,
  removePidFile,
} from './cursor-daemon';

// Models
export {
  DEFAULT_CURSOR_MODELS,
  DEFAULT_CURSOR_PORT,
  DEFAULT_CURSOR_MODEL,
  fetchModelsFromDaemon,
  fetchModelsFromCursorApi,
  getModelsForDaemon,
  getAvailableModels,
  getDefaultModel,
  clearCursorModelsCache,
  detectProvider,
  formatModelName,
} from './cursor-models';

// Executor
export { CursorExecutor } from './cursor-executor';
export { executeCursorProfile, generateCursorEnv } from './cursor-profile-executor';
