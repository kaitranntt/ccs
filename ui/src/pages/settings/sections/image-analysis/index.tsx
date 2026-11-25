import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, type ImageAnalysisDashboardData } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useRawConfig } from '../../hooks';
import { BackendRoutesPanel } from './backend-routes-panel';
import { CoreSetupPanel } from './core-setup-panel';
import { CoveragePanel } from './coverage-panel';
import { NativeReadingPanel } from './native-reading-panel';
import { ProfileRoutingPanel } from './profile-routing-panel';
import {
  type MappingDraft,
  buildProfileBackends,
  buildProviderModelsPayload,
  getConfiguredBackendIds,
  isImageAnalysisDashboardData,
  normalizeTimeoutDraft,
  summaryCompactDetail,
  summaryToneClass,
  toMappingDrafts,
} from './utils';

export default function ImageAnalysisSection() {
  const { t } = useTranslation();
  const { fetchRawConfig } = useRawConfig();
  const [data, setData] = useState<ImageAnalysisDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showProfileRouting, setShowProfileRouting] = useState(false);

  const [enabled, setEnabled] = useState(true);
  const [timeout, setTimeout] = useState('60');
  const [fallbackBackend, setFallbackBackend] = useState('');
  const [providerModels, setProviderModels] = useState<Record<string, string>>({});
  const [mappingDrafts, setMappingDrafts] = useState<MappingDraft[]>([]);

  const hydrateDraft = useCallback((nextData: ImageAnalysisDashboardData) => {
    setEnabled(nextData.config.enabled);
    setTimeout(String(nextData.config.timeout));
    setFallbackBackend(nextData.config.fallbackBackend ?? '');
    setProviderModels(
      nextData.catalog.knownBackends.reduce(
        (acc, backendId) => {
          acc[backendId] = nextData.config.providerModels[backendId] ?? '';
          return acc;
        },
        {} as Record<string, string>
      )
    );
    setMappingDrafts(toMappingDrafts(nextData.config.profileBackends));
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const payload = await api.imageAnalysis.get();
      if (!isImageAnalysisDashboardData(payload)) {
        throw new Error(
          'Image settings returned an unexpected response. Restart the dashboard server so the new API route is available.'
        );
      }
      setData(payload);
      hydrateDraft(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load image settings.');
    } finally {
      setLoading(false);
    }
  }, [hydrateDraft]);

  useEffect(() => {
    void fetchData();
    void fetchRawConfig();
  }, [fetchData, fetchRawConfig]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(null), 2500);
    return () => window.clearTimeout(timer);
  }, [success]);

  useEffect(() => {
    if (!data) return;
    if (Object.keys(data.config.profileBackends).length > 0) {
      setShowProfileRouting(true);
    }
  }, [data]);

  const configuredBackendIds = useMemo(
    () => getConfiguredBackendIds(providerModels),
    [providerModels]
  );

  const orderedBackendIds = useMemo(() => {
    if (!data) return [];

    const configured = data.catalog.knownBackends.filter((backendId) =>
      configuredBackendIds.includes(backendId)
    );
    const inactive = data.catalog.knownBackends.filter(
      (backendId) => !configuredBackendIds.includes(backendId)
    );

    return [...configured, ...inactive];
  }, [configuredBackendIds, data]);

  const nativeReadProfiles = useMemo(
    () => data?.profiles.filter((profile) => profile.nativeReadPreference) ?? [],
    [data]
  );

  useEffect(() => {
    if (configuredBackendIds.length === 0) {
      setFallbackBackend('');
      return;
    }
    if (!configuredBackendIds.includes(fallbackBackend)) {
      setFallbackBackend(configuredBackendIds[0]);
    }
  }, [configuredBackendIds, fallbackBackend]);

  const persistSettings = useCallback(
    async (overrides?: {
      enabled?: boolean;
      timeout?: string;
      fallbackBackend?: string;
      providerModels?: Record<string, string>;
      mappingDrafts?: MappingDraft[];
    }) => {
      if (!data) return false;

      const nextEnabled = overrides?.enabled ?? enabled;
      const nextProviderModels = overrides?.providerModels ?? providerModels;
      const nextConfiguredBackendIds = getConfiguredBackendIds(nextProviderModels);
      const nextTimeout = normalizeTimeoutDraft(
        overrides?.timeout ?? timeout,
        String(data.config.timeout)
      );
      const requestedFallbackBackend = overrides?.fallbackBackend ?? fallbackBackend;
      const nextFallbackBackend =
        nextConfiguredBackendIds.length === 0
          ? ''
          : nextConfiguredBackendIds.includes(requestedFallbackBackend)
            ? requestedFallbackBackend
            : nextConfiguredBackendIds[0];
      const nextMappingDrafts = overrides?.mappingDrafts ?? mappingDrafts;
      const nextPayload = {
        enabled: nextEnabled,
        timeout: nextTimeout,
        fallbackBackend: nextFallbackBackend,
        providerModels: buildProviderModelsPayload(nextProviderModels),
        profileBackends: buildProfileBackends(nextMappingDrafts),
      };

      const currentPayload = {
        enabled: data.config.enabled,
        timeout: String(data.config.timeout),
        fallbackBackend: data.config.fallbackBackend ?? '',
        providerModels: data.catalog.knownBackends.reduce(
          (acc, backendId) => {
            acc[backendId] = data.config.providerModels[backendId] ?? null;
            return acc;
          },
          {} as Record<string, string | null>
        ),
        profileBackends: data.config.profileBackends,
      };

      if (JSON.stringify(nextPayload) === JSON.stringify(currentPayload)) {
        return true;
      }

      if (nextEnabled && nextConfiguredBackendIds.length === 0) {
        setError('Keep at least one provider model configured, or disable Image globally.');
        hydrateDraft(data);
        return false;
      }

      try {
        setSaving(true);
        setError(null);
        const payload = await api.imageAnalysis.update({
          enabled: nextEnabled,
          timeout: Number.parseInt(nextTimeout, 10),
          fallbackBackend: nextFallbackBackend || null,
          providerModels: nextPayload.providerModels,
          profileBackends: nextPayload.profileBackends,
        });
        setData(payload);
        hydrateDraft(payload);
        setSuccess(t('commonToast.settingsSaved'));
        await fetchRawConfig();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save image settings.');
        hydrateDraft(data);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [
      data,
      enabled,
      fallbackBackend,
      fetchRawConfig,
      hydrateDraft,
      mappingDrafts,
      providerModels,
      t,
      timeout,
    ]
  );

  const handleRefresh = async () => {
    if (loading || saving) return;
    setSuccess(null);
    await Promise.all([fetchData(), fetchRawConfig()]);
  };

  const handleEnabledChange = async (nextEnabled: boolean) => {
    if (saving) return;
    if (nextEnabled && configuredBackendIds.length === 0) {
      setError('Keep at least one provider model configured, or disable Image globally.');
      return;
    }

    setEnabled(nextEnabled);
    await persistSettings({ enabled: nextEnabled });
  };

  const commitTimeout = async (nextValue: string) => {
    if (!data || saving) return;
    const normalizedTimeout = normalizeTimeoutDraft(nextValue, String(data.config.timeout));
    setTimeout(normalizedTimeout);
    await persistSettings({ timeout: normalizedTimeout });
  };

  const commitFallbackBackend = async (nextFallbackBackend: string) => {
    if (saving) return;
    setFallbackBackend(nextFallbackBackend);
    await persistSettings({ fallbackBackend: nextFallbackBackend });
  };

  const commitProviderModel = async (backendId: string, nextValue: string) => {
    if (!data || saving) return;

    const normalizedValue = nextValue.trim();
    const nextProviderModels = {
      ...providerModels,
      [backendId]: normalizedValue,
    };
    const nextConfiguredBackendIds = getConfiguredBackendIds(nextProviderModels);

    if (enabled && nextConfiguredBackendIds.length === 0) {
      setError('Disable Image first or keep one backend configured.');
      setProviderModels((current) => ({
        ...current,
        [backendId]: data.config.providerModels[backendId] ?? '',
      }));
      return;
    }

    const nextFallbackBackend =
      nextConfiguredBackendIds.length === 0
        ? ''
        : nextConfiguredBackendIds.includes(fallbackBackend)
          ? fallbackBackend
          : nextConfiguredBackendIds[0];

    setProviderModels(nextProviderModels);
    setFallbackBackend(nextFallbackBackend);
    await persistSettings({
      providerModels: nextProviderModels,
      fallbackBackend: nextFallbackBackend,
    });
  };

  const updateMappingRow = (rowId: string, patch: Partial<MappingDraft>) => {
    setMappingDrafts((current) =>
      current.map((entry) => (entry.id === rowId ? { ...entry, ...patch } : entry))
    );
  };

  const commitMappingDrafts = async (nextMappingDrafts: MappingDraft[]) => {
    if (saving) return;
    setMappingDrafts(nextMappingDrafts);
    await persistSettings({ mappingDrafts: nextMappingDrafts });
  };

  const completeMappingCount = mappingDrafts.filter(
    (row) => row.profileName.trim() && row.backendId
  ).length;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>{t('settingsPage.imageAnalysisSection.loading')}</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-5">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error ?? t('settingsPage.imageAnalysisSection.description')}
          </AlertDescription>
        </Alert>
        <div className="mt-4">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="mr-1 h-4 w-4" />
            {t('sharedPage.retry')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        className={`absolute left-5 right-5 top-20 z-10 transition-all duration-200 ease-out ${
          error || success
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none -translate-y-2 opacity-0'
        }`}
      >
        {error && (
          <Alert variant="destructive" className="py-2 shadow-lg">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-green-700 shadow-lg dark:border-green-900/50 dark:bg-green-900/90 dark:text-green-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium">{success}</span>
          </div>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-6 p-5">
          <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-background via-background to-muted/30 p-4 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-primary/70 via-primary/20 to-transparent" />
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.035]"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(0deg, transparent, transparent 2px, currentColor 2px, currentColor 3px)',
              }}
            />
            <div className="relative">
              <div className="mb-3 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-primary/20 bg-primary/8 text-primary">
                      <ImageIcon className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-semibold tracking-tight">
                      {t('settingsPage.imageAnalysisSection.title')}
                    </p>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <Badge className={cn('border', summaryToneClass(data.summary.state))}>
                      {data.summary.title}
                    </Badge>
                    <span>{summaryCompactDetail(data.summary)}</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={loading || saving}
                  aria-label="Refresh"
                  title="Refresh"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-[18px] border bg-background/72 px-3 py-2.5 backdrop-blur-sm">
                  <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Active routes
                  </div>
                  <div className="mt-1.5 text-xl font-semibold text-foreground">
                    {data.summary.activeProfileCount}
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Current target path</p>
                </div>
                <div className="rounded-[18px] border bg-background/72 px-3 py-2.5 backdrop-blur-sm">
                  <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Native path
                  </div>
                  <div className="mt-1.5 text-xl font-semibold text-foreground">
                    {data.summary.nativeProfileCount}
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Skip transformer</p>
                </div>
              </div>
            </div>
          </div>

          <CoreSetupPanel
            enabled={enabled}
            timeout={timeout}
            fallbackBackend={fallbackBackend}
            configuredBackendIds={configuredBackendIds}
            completeMappingCount={completeMappingCount}
            nativeReadCount={nativeReadProfiles.length}
            saving={saving}
            onEnabledChange={handleEnabledChange}
            onTimeoutChange={setTimeout}
            onCommitTimeout={commitTimeout}
            onCommitFallbackBackend={commitFallbackBackend}
          />

          <BackendRoutesPanel
            orderedBackendIds={orderedBackendIds}
            backends={data.backends}
            providerModels={providerModels}
            saving={saving}
            onProviderModelChange={(backendId, value) =>
              setProviderModels((current) => ({ ...current, [backendId]: value }))
            }
            onCommitProviderModel={commitProviderModel}
          />

          <NativeReadingPanel nativeReadProfiles={nativeReadProfiles} />

          <ProfileRoutingPanel
            showProfileRouting={showProfileRouting}
            onToggleShow={() => setShowProfileRouting((current) => !current)}
            mappingDrafts={mappingDrafts}
            profileNames={data.catalog.profileNames}
            configuredBackendIds={configuredBackendIds}
            saving={saving}
            onAddMapping={() =>
              setMappingDrafts((current) => [
                ...current,
                {
                  id: `mapping-${Date.now()}`,
                  profileName: '',
                  backendId: configuredBackendIds[0] ?? '',
                },
              ])
            }
            onUpdateMappingRow={updateMappingRow}
            onCommitMappingDrafts={commitMappingDrafts}
          />

          <CoveragePanel profiles={data.profiles} />
        </div>
      </ScrollArea>
    </div>
  );
}
