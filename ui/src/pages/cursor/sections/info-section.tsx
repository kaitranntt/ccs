/**
 * Cursor Info Section
 * Provider metadata, file path, env-var description, and available model list.
 */

import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { FormSection } from '@/components/config-layout';

interface CursorModel {
  id: string;
  name: string;
  provider: string;
}

interface InfoSectionProps {
  rawSettingsPath: string | undefined;
  models: CursorModel[];
  modelsLoading: boolean;
  currentModel: string | null;
}

export function InfoSection({
  rawSettingsPath,
  models,
  modelsLoading,
  currentModel,
}: InfoSectionProps) {
  const { t } = useTranslation();

  return (
    <FormSection id="info" title={t('cursorPage.availableModels')}>
      {/* Provider metadata card */}
      <div className="space-y-3 bg-card rounded-lg border p-4 shadow-sm">
        <div className="grid grid-cols-[100px_1fr] gap-2 text-sm items-center">
          <span className="font-medium text-muted-foreground">{t('cursorPage.provider')}</span>
          <span className="font-mono">Cursor IDE (Legacy)</span>
        </div>
        <div className="grid grid-cols-[100px_1fr] gap-2 text-sm items-center">
          <span className="font-medium text-muted-foreground">{t('cursorPage.filePath')}</span>
          <code className="bg-muted px-1.5 py-0.5 rounded text-xs break-all">
            {rawSettingsPath ?? '~/.ccs/cursor.settings.json'}
          </code>
        </div>
        <p className="text-xs text-muted-foreground">
          Legacy bridge model mapping writes <code className="font-mono">ANTHROPIC_MODEL</code>,{' '}
          <code className="font-mono">ANTHROPIC_DEFAULT_OPUS_MODEL</code>,{' '}
          <code className="font-mono">ANTHROPIC_DEFAULT_SONNET_MODEL</code>, and{' '}
          <code className="font-mono">ANTHROPIC_DEFAULT_HAIKU_MODEL</code> in{' '}
          <code className="font-mono">cursor.settings.json</code>.
        </p>
      </div>

      {/* Available models list */}
      <div className="space-y-2">
        {modelsLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('cursorPage.loadingModels')}
          </div>
        ) : models.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('cursorPage.noModels')}</p>
        ) : (
          <div className="space-y-2">
            {models.map((model) => (
              <div
                key={model.id}
                className="rounded-lg border px-3 py-2 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-medium">{model.id}</p>
                  <p className="text-xs text-muted-foreground">
                    {model.name} &bull; {model.provider}
                  </p>
                </div>
                {model.id === currentModel && <Badge>{t('cursorPage.default')}</Badge>}
              </div>
            ))}
          </div>
        )}
      </div>
    </FormSection>
  );
}
