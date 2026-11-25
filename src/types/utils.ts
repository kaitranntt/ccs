/**
 * Utility Types
 */

export type { ErrorCode } from '../utils/error-codes';

/**
 * Log levels
 */
export const LogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

/**
 * Color codes (TTY-aware)
 */
export type ColorName =
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'cyan'
  | 'bold'
  | 'cyanBold'
  | 'reset';

/**
 * Terminal capabilities
 */
export interface TerminalInfo {
  isTTY: boolean;
  supportsColor: boolean;
  noColorEnv: boolean; // NO_COLOR env var set
}

/**
 * Helper result types
 */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

/**
 * Generic operation result for success/failure patterns
 * Use this instead of defining new *Result interfaces
 */
export interface OperationResult<T = void> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

/**
 * Generic component/tool status
 * Used for CLI tools, services, etc.
 */
export interface ComponentStatus {
  installed: boolean;
  path?: string;
  version?: string;
}

/**
 * Generic validation result
 * Standardized on 'valid' property name
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

// =============================================================================
// UI TYPES (Phase 1: CLI UI/UX Enhancement)
// =============================================================================

/**
 * Semantic color names for UI elements
 */
export type SemanticColor =
  | 'success' // green - [OK] messages
  | 'error' // red - [X] messages
  | 'warning' // yellow - [!] messages
  | 'info' // cyan - [i] messages
  | 'dim' // gray - secondary text
  | 'primary' // #00ECFA - headers, emphasis
  | 'secondary' // #0099FF - links, accents
  | 'command' // yellow italic - command examples
  | 'path'; // cyan underline - file paths

/**
 * Box style options for boxen wrapper
 */
export interface BoxOptions {
  title?: string;
  titleAlignment?: 'left' | 'center' | 'right';
  padding?: number;
  margin?: number;
  borderColor?: string;
  borderStyle?: 'single' | 'double' | 'round' | 'bold' | 'classic';
}

/**
 * Table style options for cli-table3 wrapper
 */
export interface TableOptions {
  head?: string[];
  colWidths?: number[];
  wordWrap?: boolean;
  style?: 'unicode' | 'ascii';
}

/**
 * Spinner options for ora wrapper
 */
export interface SpinnerOptions {
  text: string;
  color?: string;
  prefixText?: string;
}

/**
 * Spinner control interface
 */
export interface SpinnerController {
  succeed: (msg?: string) => void;
  fail: (msg?: string) => void;
  warn: (msg?: string) => void;
  info: (msg?: string) => void;
  update: (text: string) => void;
  stop: () => void;
}
