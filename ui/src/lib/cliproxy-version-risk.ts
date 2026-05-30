interface ParsedCliproxyVersion {
  major: number;
  minor: number;
  patch: number;
  forkRelease: number;
}

function parseCliproxyVersion(version: string): ParsedCliproxyVersion {
  const normalized = version.trim().replace(/^v/, '');
  const [coreVersion, forkReleaseValue = '0'] = normalized.split('-', 2);
  const [major = 0, minor = 0, patch = 0] = coreVersion
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
  const forkRelease = /^\d+$/.test(forkReleaseValue)
    ? Number.parseInt(forkReleaseValue, 10) || 0
    : 0;

  return { major, minor, patch, forkRelease };
}

function compareVersionPart(a: number, b: number): number {
  if (a > b) return 1;
  if (a < b) return -1;
  return 0;
}

export function compareCliproxyVersions(a: string, b: string): number {
  const left = parseCliproxyVersion(a);
  const right = parseCliproxyVersion(b);

  return (
    compareVersionPart(left.major, right.major) ||
    compareVersionPart(left.minor, right.minor) ||
    compareVersionPart(left.patch, right.patch) ||
    compareVersionPart(left.forkRelease, right.forkRelease)
  );
}

export function isCliproxyVersionExperimental(version: string, maxStableVersion: string): boolean {
  return compareCliproxyVersions(version, maxStableVersion) > 0;
}

export function isCliproxyVersionInRange(version: string, min: string, max: string): boolean {
  return compareCliproxyVersions(version, min) >= 0 && compareCliproxyVersions(version, max) <= 0;
}
