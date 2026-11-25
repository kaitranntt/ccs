import type { ImageAnalysisDashboardData } from '@/lib/api-client';
import i18n from '@/lib/i18n';

export interface MappingDraft {
  id: string;
  profileName: string;
  backendId: string;
}

export type ImageBackend = ImageAnalysisDashboardData['backends'][number];
export type ImageProfile = ImageAnalysisDashboardData['profiles'][number];
export type SectionTone = 'sky' | 'amber' | 'emerald' | 'cyan' | 'slate';

export const NO_BACKEND = '__no_backend__';

export function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === 'string')
  );
}

export function isImageAnalysisDashboardData(value: unknown): value is ImageAnalysisDashboardData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<ImageAnalysisDashboardData>;
  return (
    !!candidate.config &&
    typeof candidate.config.enabled === 'boolean' &&
    typeof candidate.config.timeout === 'number' &&
    isStringRecord(candidate.config.providerModels) &&
    (candidate.config.fallbackBackend === null ||
      typeof candidate.config.fallbackBackend === 'string') &&
    isStringRecord(candidate.config.profileBackends) &&
    !!candidate.summary &&
    typeof candidate.summary.state === 'string' &&
    typeof candidate.summary.title === 'string' &&
    typeof candidate.summary.detail === 'string' &&
    Array.isArray(candidate.backends) &&
    Array.isArray(candidate.profiles) &&
    !!candidate.catalog &&
    Array.isArray(candidate.catalog.knownBackends) &&
    Array.isArray(candidate.catalog.profileNames) &&
    typeof candidate.summary.nativeProfileCount === 'number'
  );
}

export function toMappingDrafts(profileBackends: Record<string, string>): MappingDraft[] {
  return Object.entries(profileBackends)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([profileName, backendId], index) => ({
      id: `${profileName}-${backendId}-${index}`,
      profileName,
      backendId,
    }));
}

export function summaryToneClass(state: ImageAnalysisDashboardData['summary']['state']): string {
  switch (state) {
    case 'ready':
      return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200';
    case 'partial':
      return 'border-amber-500/25 bg-amber-500/10 text-amber-900 dark:text-amber-200';
    case 'needs_setup':
      return 'border-rose-500/25 bg-rose-500/10 text-rose-900 dark:text-rose-200';
    case 'disabled':
      return 'border-border/80 bg-background/85 text-muted-foreground';
  }
}

export function backendStateClass(state: ImageBackend['state']): string {
  switch (state) {
    case 'ready':
      return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200';
    case 'starts_on_launch':
      return 'border-sky-500/25 bg-sky-500/10 text-sky-800 dark:text-sky-200';
    case 'needs_auth':
      return 'border-rose-500/25 bg-rose-500/10 text-rose-800 dark:text-rose-200';
    case 'needs_proxy':
      return 'border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-200';
    case 'review':
      return 'border-border/80 bg-background/85 text-muted-foreground';
  }
}

export function currentTargetModeLabel(mode: ImageProfile['currentTargetMode']): string {
  switch (mode) {
    case 'active':
      return i18n.t('imageAnalysisStatus.badgeReady');
    case 'bypassed':
      return i18n.t('imageAnalysisStatus.badgeBypassed');
    case 'fallback':
      return i18n.t('imageAnalysisStatus.nativeFallback');
    case 'setup':
      return i18n.t('imageAnalysisStatus.badgeSetup');
    case 'disabled':
      return i18n.t('imageAnalysisStatus.badgeDisabled');
    case 'native':
      return i18n.t('imageAnalysisStatus.badgeNative');
    case 'unresolved':
      return i18n.t('imageAnalysisStatus.nativeImageReading');
  }
}

export function currentTargetModeClass(mode: ImageProfile['currentTargetMode']): string {
  switch (mode) {
    case 'active':
      return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200';
    case 'bypassed':
      return 'border-sky-500/25 bg-sky-500/10 text-sky-800 dark:text-sky-200';
    case 'fallback':
    case 'setup':
      return 'border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-200';
    case 'native':
      return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200';
    case 'disabled':
    case 'unresolved':
      return 'border-border/80 bg-background/85 text-muted-foreground';
  }
}

export function backendStateLabel(state: ImageBackend['state']): string {
  switch (state) {
    case 'starts_on_launch':
      return i18n.t('imageAnalysisSection.backendStartsOnLaunch', {
        defaultValue: 'Starts on launch',
      });
    case 'needs_auth':
      return i18n.t('imageAnalysisStatus.needsAuth');
    case 'needs_proxy':
      return i18n.t('imageAnalysisStatus.needsProxy');
    case 'review':
      return i18n.t('imageAnalysisSection.review', { defaultValue: 'Review' });
    case 'ready':
      return i18n.t('imageAnalysisStatus.badgeReady');
  }
}

export function backendStatusNote(backend: ImageBackend | undefined): string | null {
  if (!backend) {
    return i18n.t('imageAnalysisSection.noModelConfigured', {
      defaultValue: 'No model configured.',
    });
  }

  switch (backend.state) {
    case 'needs_auth':
      return (
        backend.authReason ||
        i18n.t('imageAnalysisSection.authenticateToRoute', {
          defaultValue: 'Authenticate to route here.',
        })
      );
    case 'needs_proxy':
      return (
        backend.proxyReason ||
        i18n.t('imageAnalysisSection.proxyUnavailable', {
          defaultValue: 'Proxy unavailable.',
        })
      );
    case 'starts_on_launch':
      return i18n.t('imageAnalysisSection.authReadyLaunchesLocally', {
        defaultValue: 'Auth ready. Launches locally on demand.',
      });
    case 'review':
      return i18n.t('imageAnalysisSection.needsManualReview', {
        defaultValue: 'Needs manual review.',
      });
    case 'ready':
      return null;
  }
}

export function routeSourceLabel(source: ImageProfile['resolutionSource']): string {
  switch (source) {
    case 'profile-backend':
      return i18n.t('imageAnalysisSection.explicitMapping', {
        defaultValue: 'Explicit mapping',
      });
    case 'fallback-backend':
      return i18n.t('imageAnalysisSection.fallbackBackend', {
        defaultValue: 'Fallback backend',
      });
    case 'cliproxy-provider':
      return i18n.t('imageAnalysisSection.providerMatch', {
        defaultValue: 'Provider match',
      });
    case 'cliproxy-bridge':
      return i18n.t('imageAnalysisSection.bridgeMatch', {
        defaultValue: 'Bridge match',
      });
    case 'native-compatible':
      return i18n.t('imageAnalysisSection.nativePath', {
        defaultValue: 'Native path',
      });
    case 'copilot-alias':
      return i18n.t('imageAnalysisSection.copilotAlias', {
        defaultValue: 'Copilot alias',
      });
    default:
      return source.replace(/-/g, ' ');
  }
}

export function getInsetPanelClass(_tone?: SectionTone): string {
  return 'border-border/50 bg-background/40';
}

export function getBackendRowClass(state: ImageBackend['state'] | undefined): string {
  switch (state) {
    case 'ready':
      return 'bg-[linear-gradient(90deg,rgba(16,185,129,0.08),transparent_18%),linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,255,255,0.46))] dark:bg-[linear-gradient(90deg,rgba(16,185,129,0.12),transparent_18%),linear-gradient(180deg,rgba(15,23,42,0.82),rgba(15,23,42,0.56))]';
    case 'starts_on_launch':
      return 'bg-[linear-gradient(90deg,rgba(14,165,233,0.08),transparent_18%),linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,255,255,0.46))] dark:bg-[linear-gradient(90deg,rgba(14,165,233,0.12),transparent_18%),linear-gradient(180deg,rgba(15,23,42,0.82),rgba(15,23,42,0.56))]';
    case 'needs_auth':
      return 'bg-[linear-gradient(90deg,rgba(244,63,94,0.08),transparent_18%),linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,255,255,0.46))] dark:bg-[linear-gradient(90deg,rgba(244,63,94,0.12),transparent_18%),linear-gradient(180deg,rgba(15,23,42,0.82),rgba(15,23,42,0.56))]';
    case 'needs_proxy':
      return 'bg-[linear-gradient(90deg,rgba(245,158,11,0.08),transparent_18%),linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,255,255,0.46))] dark:bg-[linear-gradient(90deg,rgba(245,158,11,0.12),transparent_18%),linear-gradient(180deg,rgba(15,23,42,0.82),rgba(15,23,42,0.56))]';
    case 'review':
    default:
      return 'bg-[linear-gradient(180deg,rgba(255,255,255,0.74),rgba(255,255,255,0.5))] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.8),rgba(15,23,42,0.58))]';
  }
}

export function getBackendRailClass(state: ImageBackend['state'] | undefined): string {
  switch (state) {
    case 'ready':
      return 'from-emerald-500 to-emerald-400/30';
    case 'starts_on_launch':
      return 'from-sky-500 to-sky-400/30';
    case 'needs_auth':
      return 'from-rose-500 to-rose-400/30';
    case 'needs_proxy':
      return 'from-amber-500 to-amber-400/30';
    case 'review':
    default:
      return 'from-slate-400 to-slate-300/20';
  }
}

export function getCoverageRowClass(index: number, profile: ImageProfile): string {
  if (profile.nativeReadPreference) {
    return index % 2 === 0 ? 'bg-emerald-500/[0.06]' : 'bg-emerald-500/[0.08]';
  }

  return index % 2 === 0 ? 'bg-background/75' : 'bg-muted/18';
}

// TODO i18n: missing keys for summaryCompactDetail format strings
export function summaryCompactDetail(summary: ImageAnalysisDashboardData['summary']): string {
  const parts = [`${summary.activeProfileCount} routed`, `${summary.nativeProfileCount} native`];

  if (summary.mappedProfileCount > 0) {
    parts.push(
      `${summary.mappedProfileCount} override${summary.mappedProfileCount === 1 ? '' : 's'}`
    );
  }

  return parts.join(' · ');
}

export function buildProviderModelsPayload(
  providerModels: Record<string, string>
): Record<string, string | null> {
  return Object.entries(providerModels).reduce(
    (acc, [backendId, model]) => {
      const normalizedModel = model.trim();
      acc[backendId] = normalizedModel || null;
      return acc;
    },
    {} as Record<string, string | null>
  );
}

export function getConfiguredBackendIds(providerModels: Record<string, string>): string[] {
  return Object.entries(providerModels)
    .filter(([, model]) => model.trim().length > 0)
    .map(([backendId]) => backendId);
}

export function buildProfileBackends(mappingDrafts: MappingDraft[]): Record<string, string> {
  return mappingDrafts.reduce(
    (acc, row) => {
      const profileName = row.profileName.trim();
      if (!profileName || !row.backendId) {
        return acc;
      }

      acc[profileName] = row.backendId;
      return acc;
    },
    {} as Record<string, string>
  );
}

export function normalizeTimeoutDraft(rawValue: string, fallbackValue: string): string {
  const parsed = Number.parseInt(rawValue.trim(), 10);
  if (!Number.isInteger(parsed)) {
    return fallbackValue;
  }

  return String(Math.min(600, Math.max(10, parsed)));
}
