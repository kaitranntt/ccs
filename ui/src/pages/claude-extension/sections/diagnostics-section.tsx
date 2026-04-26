/**
 * DiagnosticsSection — Warnings and notes cards from the setup payload.
 *
 * Conditionally rendered: only appears when setup has at least one warning
 * or note. Maps to the bottom grid of the Overview tab in the original monolith.
 */
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ClaudeExtensionSetupPayload } from '@/hooks/use-claude-extension';

interface DiagnosticsSectionProps {
  setup: ClaudeExtensionSetupPayload;
}

export function DiagnosticsSection({ setup }: DiagnosticsSectionProps) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {/* Warnings */}
      <Card className="border-border/60 bg-card/80">
        <CardHeader>
          <CardTitle className="text-base">{t('settingsPage.thinkingSection.warnings')}</CardTitle>
          <CardDescription>
            Operational details that can break the binding even when JSON is correct.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {setup.warnings.length > 0 ? (
            setup.warnings.map((warning) => (
              <div
                key={warning}
                className="flex items-start gap-3 rounded-lg border border-amber-400/40 bg-amber-50/60 p-3 text-sm dark:bg-amber-950/10"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>{warning}</span>
              </div>
            ))
          ) : (
            <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
              No runtime warnings for this binding.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      <Card className="border-border/60 bg-card/80">
        <CardHeader>
          <CardTitle className="text-base">{t('settingsPage.thinkingSection.notes')}</CardTitle>
          <CardDescription>
            Short context from CCS about account continuity and host-specific behavior.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {setup.notes.length > 0 ? (
            setup.notes.map((note) => (
              <div
                key={note}
                className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3 text-sm"
              >
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{note}</span>
              </div>
            ))
          ) : (
            <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
              No extra notes for this binding.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
