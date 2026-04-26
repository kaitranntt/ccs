/**
 * Droid overview section — Runtime & Install + Config Files + Warnings.
 * Maps to the former "Overview" tab in the droid monolith.
 */

import {
  CheckCircle2,
  Folder,
  Loader2,
  TerminalSquare,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormSection } from '@/components/config-layout';
import { cn } from '@/lib/utils';
import type { DroidDashboardDiagnostics } from '@/hooks/use-droid';

// ---- Detail row sub-component (local to this section) ----------------------

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn('text-right break-all', mono && 'font-mono text-xs')}>{value}</span>
    </div>
  );
}

// ---- Helpers ----------------------------------------------------------------

function formatTimestamp(value: number | null | undefined): string {
  if (!value || !Number.isFinite(value)) return 'N/A';
  return new Date(value).toLocaleString();
}

function formatBytes(value: number | null | undefined): string {
  if (!value || value <= 0) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

// ---- Props ------------------------------------------------------------------

interface OverviewSectionProps {
  diagnostics: DroidDashboardDiagnostics | null | undefined;
  diagnosticsLoading: boolean;
  diagnosticsError: unknown;
}

// ---- Component --------------------------------------------------------------

export function OverviewSection({
  diagnostics,
  diagnosticsLoading,
  diagnosticsError,
}: OverviewSectionProps) {
  const { t } = useTranslation();

  if (diagnosticsLoading) {
    return (
      <FormSection id="overview" title={t('droidPage.overview')}>
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          {t('droidPage.loadingDiagnostics')}
        </div>
      </FormSection>
    );
  }

  if (diagnosticsError || !diagnostics) {
    return (
      <FormSection id="overview" title={t('droidPage.overview')}>
        <div className="flex items-center justify-center px-6 py-8 text-center text-destructive">
          {t('droidPage.failedDiagnostics')}
        </div>
      </FormSection>
    );
  }

  return (
    <FormSection id="overview" title={t('droidPage.overview')}>
      <div className="space-y-4">
        {/* Runtime & Install card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TerminalSquare className="h-4 w-4" />
              {t('droidPage.runtimeInstall')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('droidPage.status')}</span>
              <Badge variant={diagnostics.binary.installed ? 'default' : 'secondary'}>
                {diagnostics.binary.installed ? t('droidPage.detected') : t('droidPage.notFound')}
              </Badge>
            </div>
            <DetailRow
              label={t('droidPage.detectionSource')}
              value={diagnostics.binary.source}
              mono
            />
            <DetailRow
              label={t('droidPage.binaryPath')}
              value={diagnostics.binary.path || t('droidPage.notFound')}
              mono
            />
            <DetailRow
              label={t('droidPage.installDirectory')}
              value={diagnostics.binary.installDir || 'N/A'}
              mono
            />
            <DetailRow
              label={t('droidPage.version')}
              value={diagnostics.binary.version || 'Unknown'}
              mono
            />
            <DetailRow
              label={t('droidPage.overridePath')}
              value={diagnostics.binary.overridePath || 'Not set'}
              mono
            />
          </CardContent>
        </Card>

        {/* Config Files card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Folder className="h-4 w-4" />
              {t('droidPage.configFiles')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[diagnostics.files.settings, diagnostics.files.legacyConfig].map((file) => (
              <div key={file.label} className="rounded-md border p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">{file.label}</span>
                  {file.exists ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <DetailRow label={t('droidPage.path')} value={file.path} mono />
                <DetailRow label={t('droidPage.resolved')} value={file.resolvedPath} mono />
                <DetailRow label={t('droidPage.size')} value={formatBytes(file.sizeBytes)} />
                <DetailRow
                  label={t('droidPage.lastModified')}
                  value={formatTimestamp(file.mtimeMs)}
                />
                {file.parseError && (
                  <p className="text-xs text-amber-600">
                    {t('droidPage.parseWarning', { value: file.parseError })}
                  </p>
                )}
                {file.readError && (
                  <p className="text-xs text-destructive">
                    {t('droidPage.readWarning', { value: file.readError })}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Warnings card — conditional */}
        {diagnostics.warnings.length > 0 && (
          <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                {t('droidPage.warnings')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {diagnostics.warnings.map((warning) => (
                <p key={warning} className="text-sm text-amber-800 dark:text-amber-300">
                  - {warning}
                </p>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </FormSection>
  );
}
