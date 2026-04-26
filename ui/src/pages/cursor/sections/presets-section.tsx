/**
 * Cursor Presets Section
 * One-click model preset buttons: GPT-5.3 Codex, Claude 4.6, Gemini 3 Pro.
 */

import { Sparkles, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormSection } from '@/components/config-layout';
import { useTranslation } from 'react-i18next';

type PresetKey = 'codex53' | 'claude46' | 'gemini3';

interface PresetsSectionProps {
  modelsLoading: boolean;
  hasModels: boolean;
  onApplyPreset: (preset: PresetKey) => void;
}

export function PresetsSection({ modelsLoading, hasModels, onApplyPreset }: PresetsSectionProps) {
  const { t } = useTranslation();
  const disabled = modelsLoading || !hasModels;

  return (
    <FormSection
      id="presets"
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          {t('cursorPage.presets')}
        </span>
      }
      description={t('cursorPage.presetsDesc')}
    >
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7 gap-1"
          onClick={() => onApplyPreset('codex53')}
          disabled={disabled}
          title="OpenAI-only mapping: GPT-5.3 Codex / Codex Max / GPT-5 Mini"
        >
          <Zap className="w-3 h-3" />
          GPT-5.3 Codex
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7 gap-1"
          onClick={() => onApplyPreset('claude46')}
          disabled={disabled}
          title="Claude-first mapping: Opus 4.6 / Sonnet 4.5 / Haiku 4.5"
        >
          <Zap className="w-3 h-3" />
          Claude 4.6
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7 gap-1"
          onClick={() => onApplyPreset('gemini3')}
          disabled={disabled}
          title="Gemini-first mapping: Gemini 3 Pro + Gemini 3 Flash"
        >
          <Zap className="w-3 h-3" />
          Gemini 3 Pro
        </Button>
      </div>
    </FormSection>
  );
}
