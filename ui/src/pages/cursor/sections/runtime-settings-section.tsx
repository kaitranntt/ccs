/**
 * Cursor Runtime Settings Section
 * Port input, auto-start toggle, ghost mode toggle.
 */

import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { FormSection } from '@/components/config-layout';

interface RuntimeSettingsSectionProps {
  effectivePort: string;
  effectiveAutoStart: boolean;
  effectiveGhostMode: boolean;
  onChangePort: (value: string) => void;
  onChangeAutoStart: (value: boolean) => void;
  onChangeGhostMode: (value: boolean) => void;
}

export function RuntimeSettingsSection({
  effectivePort,
  effectiveAutoStart,
  effectiveGhostMode,
  onChangePort,
  onChangeAutoStart,
  onChangeGhostMode,
}: RuntimeSettingsSectionProps) {
  const { t } = useTranslation();

  return (
    <FormSection id="runtime-settings" title={t('cursorPage.runtimeSettings')}>
      <div className="space-y-4">
        {/* Port */}
        <div className="space-y-2">
          <Label htmlFor="cursor-port" className="text-xs">
            {t('cursorPage.port')}
          </Label>
          <Input
            id="cursor-port"
            type="number"
            min={1}
            max={65535}
            className="max-w-[150px] h-8"
            value={effectivePort}
            onChange={(e) => onChangePort(e.target.value)}
          />
        </div>

        {/* Auto-start daemon */}
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="cursor-auto-start" className="text-xs">
              {t('cursorPage.autoStartDaemon')}
            </Label>
            <p className="text-[10px] text-muted-foreground">{t('cursorPage.autoStartDesc')}</p>
          </div>
          <Switch
            id="cursor-auto-start"
            checked={effectiveAutoStart}
            onCheckedChange={onChangeAutoStart}
          />
        </div>

        {/* Ghost mode */}
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="cursor-ghost-mode" className="text-xs">
              {t('cursorPage.ghostMode')}
            </Label>
            <p className="text-[10px] text-muted-foreground">{t('cursorPage.ghostModeDesc')}</p>
          </div>
          <Switch
            id="cursor-ghost-mode"
            checked={effectiveGhostMode}
            onCheckedChange={onChangeGhostMode}
          />
        </div>
      </div>
    </FormSection>
  );
}
