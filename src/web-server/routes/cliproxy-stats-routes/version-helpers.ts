/**
 * CLIProxy version-check + versions-list payload resolvers.
 *
 * Public surface: `resolveCliproxyUpdateCheckPayload` and
 * `resolveCliproxyVersionsPayload` are re-exported by the barrel.
 */

import {
  checkCliproxyUpdate,
  getInstalledCliproxyVersion,
  getStoredConfiguredBackend,
} from '../../../cliproxy/binary-manager';
import { fetchAllVersions, isNewerVersion } from '../../../cliproxy/binary/version-checker';
import {
  CLIPROXY_MAX_STABLE_VERSION,
  CLIPROXY_FAULTY_RANGE,
} from '../../../cliproxy/binary/platform-detector';

type Backend = ReturnType<typeof getStoredConfiguredBackend>;

function buildUpdateCheckFallback(
  backend: Backend,
  getInstalledVersionFn: typeof getInstalledCliproxyVersion = getInstalledCliproxyVersion
) {
  const currentVersion = getInstalledVersionFn(backend);
  const isStable = !isNewerVersion(currentVersion, CLIPROXY_MAX_STABLE_VERSION);
  const backendLabel = backend === 'plus' ? 'CLIProxy Plus' : 'CLIProxy';

  return {
    hasUpdate: false,
    currentVersion,
    latestVersion: currentVersion,
    fromCache: true,
    checkedAt: Date.now(),
    backend,
    backendLabel,
    isStable,
    maxStableVersion: CLIPROXY_MAX_STABLE_VERSION,
    stabilityMessage: isStable
      ? undefined
      : `v${currentVersion} has known stability issues. Max stable: v${CLIPROXY_MAX_STABLE_VERSION}`,
  };
}

function buildVersionsFallback(
  backend: Backend,
  getInstalledVersionFn: typeof getInstalledCliproxyVersion = getInstalledCliproxyVersion
) {
  const currentVersion = getInstalledVersionFn(backend);

  return {
    versions: currentVersion ? [currentVersion] : [],
    latestStable: currentVersion || CLIPROXY_MAX_STABLE_VERSION,
    latest: currentVersion || CLIPROXY_MAX_STABLE_VERSION,
    fromCache: true,
    checkedAt: Date.now(),
    currentVersion,
    maxStableVersion: CLIPROXY_MAX_STABLE_VERSION,
    faultyRange: CLIPROXY_FAULTY_RANGE,
  };
}

export interface ResolveUpdateCheckDeps {
  checkCliproxyUpdateFn?: typeof checkCliproxyUpdate;
  getInstalledVersionFn?: typeof getInstalledCliproxyVersion;
}

export interface ResolveVersionsDeps {
  fetchAllVersionsFn?: typeof fetchAllVersions;
  getInstalledVersionFn?: typeof getInstalledCliproxyVersion;
}

export async function resolveCliproxyUpdateCheckPayload(
  backend: Backend,
  deps: ResolveUpdateCheckDeps = {}
) {
  const checkCliproxyUpdateFn = deps.checkCliproxyUpdateFn ?? checkCliproxyUpdate;
  const getInstalledVersionFn = deps.getInstalledVersionFn ?? getInstalledCliproxyVersion;

  return checkCliproxyUpdateFn(backend).catch(() =>
    buildUpdateCheckFallback(backend, getInstalledVersionFn)
  );
}

export async function resolveCliproxyVersionsPayload(
  backend: Backend,
  deps: ResolveVersionsDeps = {}
) {
  const fetchAllVersionsFn = deps.fetchAllVersionsFn ?? fetchAllVersions;
  const getInstalledVersionFn = deps.getInstalledVersionFn ?? getInstalledCliproxyVersion;
  const result = await fetchAllVersionsFn(false, backend).catch(() => null);
  if (!result) {
    return buildVersionsFallback(backend, getInstalledVersionFn);
  }

  return {
    ...result,
    currentVersion: getInstalledVersionFn(backend),
    maxStableVersion: CLIPROXY_MAX_STABLE_VERSION,
    faultyRange: CLIPROXY_FAULTY_RANGE,
  };
}
