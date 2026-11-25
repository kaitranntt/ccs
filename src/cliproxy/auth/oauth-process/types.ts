/**
 * Shared types for OAuth process execution
 */

import { CLIProxyProvider } from '../../types';
import { GCloudProject } from '../project-selection-handler';
import { KiroAuthMethod, ProviderOAuthConfig } from '../auth-types';

/** Options for OAuth process execution */
export interface OAuthProcessOptions {
  provider: CLIProxyProvider;
  binaryPath: string;
  args: string[];
  tokenDir: string;
  oauthConfig: ProviderOAuthConfig;
  callbackPort: number | null;
  headless: boolean;
  verbose: boolean;
  isCLI: boolean;
  nickname?: string;
  expectedAccountId?: string;
  authFlowType?: 'device_code' | 'authorization_code';
  kiroMethod?: KiroAuthMethod;
  manualCallback?: boolean;
}

/** Internal state for OAuth process */
export interface ProcessState {
  stderrData: string;
  urlDisplayed: boolean;
  browserOpened: boolean;
  projectPromptHandled: boolean;
  accumulatedOutput: string;
  parsedProjects: GCloudProject[];
  sessionId: string;
  /** Device code displayed to user (for Device Code Flow) */
  deviceCodeDisplayed: boolean;
  /** The user code to enter at verification URL */
  userCode: string | null;
  kiroMethodSelectionHandled: boolean;
  manualCallbackPrompted: boolean;
  cancelManualCallbackPrompt: (() => void) | null;
}
