/**
 * Persist Command - Secret Detection & Masking
 *
 * Identifies sensitive env var names (TOKEN/KEY/SECRET/etc.) so the persist
 * preview can mask their values before printing to the terminal.
 */

/** Mask API key for display (show first 4 and last 4 chars) */
export function maskApiKey(key: string): string {
  if (key.length <= 12) {
    return '****';
  }
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

const SENSITIVE_ENV_PARTS = new Set([
  'TOKEN',
  'KEY',
  'SECRET',
  'PASSWORD',
  'PASS',
  'AUTH',
  'CREDENTIAL',
  'PRIVATE',
  'ACCESS',
  'REFRESH',
  'APIKEY',
]);

export function splitSensitiveKeyParts(key: string): string[] {
  const withCamelCaseBoundaries = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2');
  return withCamelCaseBoundaries
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

export function isSensitiveEnvKey(key: string): boolean {
  const parts = splitSensitiveKeyParts(key);
  if (parts.some((part) => SENSITIVE_ENV_PARTS.has(part))) {
    return true;
  }

  const compact = parts.join('');
  return (
    compact.includes('TOKEN') ||
    compact.includes('APIKEY') ||
    compact.includes('ACCESSKEY') ||
    compact.includes('AUTHKEY') ||
    compact.includes('SECRET') ||
    compact.includes('PASSWORD') ||
    compact.includes('CREDENTIAL')
  );
}
