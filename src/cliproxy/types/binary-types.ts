/**
 * Binary management, download, and verification types
 */

import type { CLIProxyBackend } from './provider-types';
import type { PlatformInfo } from './platform-types';
import type { UpdateCheckResult } from '../binary/types';

/** Binary manager configuration */
export interface BinaryManagerConfig {
  version: string;
  releaseUrl: string;
  binPath: string;
  maxRetries: number;
  verbose: boolean;
  forceVersion: boolean;
  replaceExisting?: boolean;
  /**
   * Runs after the new binary is downloaded, verified and staged, right before
   * it replaces the installed one. Lets callers stop a running proxy only for
   * the swap instead of for the whole download.
   */
  beforeReplace?: () => Promise<void>;
  skipAutoUpdate: boolean;
  allowInstall: boolean;
  backend?: CLIProxyBackend;
  checkForUpdatesFn?: (
    binPath: string,
    configVersion: string,
    verbose?: boolean,
    backend?: CLIProxyBackend
  ) => Promise<UpdateCheckResult>;
}

/** Download progress callback data */
export interface DownloadProgress {
  total: number;
  downloaded: number;
  percentage: number;
}

/** Download progress callback function type */
export type ProgressCallback = (progress: DownloadProgress) => void;

/** Binary info after successful download/verification */
export interface BinaryInfo {
  path: string;
  version: string;
  platform: PlatformInfo;
  checksum: string;
}

/** Checksum verification result */
export interface ChecksumResult {
  valid: boolean;
  expected: string;
  actual: string;
}

/** Download result */
export interface DownloadResult {
  success: boolean;
  filePath?: string;
  error?: string;
  retries: number;
}
