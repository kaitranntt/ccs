/**
 * Reserved profile names that cannot be used for user-defined profiles.
 * These names are reserved for CLIProxy providers and CLI commands.
 */
export const RESERVED_PROFILE_NAMES = [
  // CLIProxy providers (built-in OAuth)
  'gemini',
  'codex',
  'agy',
  'qwen',
  'iflow',
  // Copilot API (GitHub Copilot proxy)
  'copilot',
  // CLI commands and special names
  'default',
  'config',
  'cliproxy',
] as const;

export type ReservedProfileName = (typeof RESERVED_PROFILE_NAMES)[number];

/**
 * Windows reserved device names - cannot be used as filenames on Windows.
 * Case-insensitive on Windows filesystem.
 */
export const WINDOWS_RESERVED_NAMES = [
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
] as const;

/**
 * Check if a name is reserved and cannot be used for user profiles.
 * @param name - The profile name to check
 * @returns true if the name is reserved
 */
export function isReservedName(name: string): boolean {
  return RESERVED_PROFILE_NAMES.includes(name.toLowerCase() as ReservedProfileName);
}

/**
 * Check if a name is a Windows reserved device name.
 * These cause filesystem errors on Windows systems.
 * @param name - The name to check
 * @returns true if the name is a Windows reserved name
 */
export function isWindowsReservedName(name: string): boolean {
  return WINDOWS_RESERVED_NAMES.includes(
    name.toUpperCase() as (typeof WINDOWS_RESERVED_NAMES)[number]
  );
}

/**
 * Validate a profile name and throw if reserved.
 * @param name - The profile name to validate
 * @throws Error if the name is reserved
 */
export function validateProfileName(name: string): void {
  if (isReservedName(name)) {
    throw new Error(
      `Profile name '${name}' is reserved. Reserved names: ${RESERVED_PROFILE_NAMES.join(', ')}`
    );
  }
}
