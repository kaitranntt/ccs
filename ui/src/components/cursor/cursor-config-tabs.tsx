import { Loader2, Sparkles, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CursorModelSelector } from './cursor-model-selector';
import type { CursorConfigDraft } from './cursor-utils';

export function CursorConfigTabs({
  modelsLoading,
  modelsCount,
  orderedModels,
  currentModel,
  rawSettingsPath,
  effectivePort,
  effectiveAutoStart,
  effectiveGhostMode,
  effectiveModel,
  effectiveOpusModel,
  effectiveSonnetModel,
  effectiveHaikuModel,
  onApplyPreset,
  onUpdateConfigDraft,
}: {
  modelsLoading: boolean;
  modelsCount: number;
  orderedModels: Array<{ id: string; name: string; provider: string }>;
  currentModel?: string | null;
  rawSettingsPath?: string;
  effectivePort: string;
  effectiveAutoStart: boolean;
  effectiveGhostMode: boolean;
  effectiveModel: string;
  effectiveOpusModel: string;
  effectiveSonnetModel: string;
  effectiveHaikuModel: string;
  onApplyPreset: (preset: 'codex53' | 'claude46' | 'gemini3') => void;
  onUpdateConfigDraft: (updater: (draft: CursorConfigDraft) => CursorConfigDraft) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="w-[540px] shrink-0 flex flex-col min-h-0 overflow-hidden bg-muted/5">
      <Tabs defaultValue="config" className="h-full flex flex-col">
        <div className="px-4 pt-4 shrink-0">
          <TabsList className="w-full">
            <TabsTrigger value="config" className="flex-1">
              {t('cursorPage.modelConfig')}
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex-1">
              {t('cursorPage.settings')}
            </TabsTrigger>
            <TabsTrigger value="info" className="flex-1">
              {t('cursorPage.info')}
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <TabsContent
            value="config"
            className="flex-1 mt-0 border-0 p-0 data-[state=inactive]:hidden flex flex-col overflow-hidden"
          >
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-6">
                <div>
                  <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    {t('cursorPage.presets')}
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    {t('cursorPage.presetsDesc')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 gap-1"
                      onClick={() => onApplyPreset('codex53')}
                      disabled={modelsLoading || modelsCount === 0}
                      /* TODO i18n: missing key for "OpenAI-only mapping: GPT-5.3 Codex / Codex Max / GPT-5 Mini" */
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
                      disabled={modelsLoading || modelsCount === 0}
                      /* TODO i18n: missing key for "Claude-first mapping: Opus 4.6 / Sonnet 4.5 / Haiku 4.5" */
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
                      disabled={modelsLoading || modelsCount === 0}
                      /* TODO i18n: missing key for "Gemini-first mapping: Gemini 3 Pro + Gemini 3 Flash" */
                      title="Gemini-first mapping: Gemini 3 Pro + Gemini 3 Flash"
                    >
                      <Zap className="w-3 h-3" />
                      Gemini 3 Pro
                    </Button>
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-sm font-medium mb-2">{t('cursorPage.modelMapping')}</h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    {t('cursorPage.modelMappingDesc')}
                  </p>
                  <div className="space-y-4">
                    <CursorModelSelector
                      label={t('cursorPage.defaultModel')}
                      description={t('cursorPage.defaultModelDesc')}
                      value={effectiveModel}
                      models={orderedModels}
                      disabled={modelsLoading}
                      onChange={(value) => {
                        onUpdateConfigDraft((draft) => ({ ...draft, model: value }));
                      }}
                    />
                    <CursorModelSelector
                      label={t('cursorPage.opusModel')}
                      description={t('cursorPage.opusModelDesc')}
                      value={effectiveOpusModel}
                      models={orderedModels}
                      disabled={modelsLoading}
                      allowDefaultFallback
                      onChange={(value) => {
                        onUpdateConfigDraft((draft) => ({ ...draft, opus_model: value }));
                      }}
                    />
                    <CursorModelSelector
                      label={t('cursorPage.sonnetModel')}
                      description={t('cursorPage.sonnetModelDesc')}
                      value={effectiveSonnetModel}
                      models={orderedModels}
                      disabled={modelsLoading}
                      allowDefaultFallback
                      onChange={(value) => {
                        onUpdateConfigDraft((draft) => ({ ...draft, sonnet_model: value }));
                      }}
                    />
                    <CursorModelSelector
                      label={t('cursorPage.haikuModel')}
                      description={t('cursorPage.haikuModelDesc')}
                      value={effectiveHaikuModel}
                      models={orderedModels}
                      disabled={modelsLoading}
                      allowDefaultFallback
                      onChange={(value) => {
                        onUpdateConfigDraft((draft) => ({ ...draft, haiku_model: value }));
                      }}
                    />
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent
            value="settings"
            className="flex-1 mt-0 border-0 p-0 data-[state=inactive]:hidden flex flex-col overflow-hidden"
          >
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-medium">{t('cursorPage.runtimeSettings')}</h3>

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
                      onChange={(e) => {
                        onUpdateConfigDraft((draft) => ({
                          ...draft,
                          port: e.target.value,
                        }));
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="cursor-auto-start" className="text-xs">
                        {t('cursorPage.autoStartDaemon')}
                      </Label>
                      <p className="text-[10px] text-muted-foreground">
                        {t('cursorPage.autoStartDesc')}
                      </p>
                    </div>
                    <Switch
                      id="cursor-auto-start"
                      checked={effectiveAutoStart}
                      onCheckedChange={(value) => {
                        onUpdateConfigDraft((draft) => ({ ...draft, auto_start: value }));
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="cursor-ghost-mode" className="text-xs">
                        {t('cursorPage.ghostMode')}
                      </Label>
                      <p className="text-[10px] text-muted-foreground">
                        {t('cursorPage.ghostModeDesc')}
                      </p>
                    </div>
                    <Switch
                      id="cursor-ghost-mode"
                      checked={effectiveGhostMode}
                      onCheckedChange={(value) => {
                        onUpdateConfigDraft((draft) => ({ ...draft, ghost_mode: value }));
                      }}
                    />
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent
            value="info"
            className="flex-1 mt-0 border-0 p-0 data-[state=inactive]:hidden flex flex-col overflow-hidden"
          >
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-6">
                <div className="space-y-3 bg-card rounded-lg border p-4 shadow-sm">
                  <div className="grid grid-cols-[100px_1fr] gap-2 text-sm items-center">
                    <span className="font-medium text-muted-foreground">
                      {t('cursorPage.provider')}
                    </span>
                    <span className="font-mono">Cursor IDE (Legacy)</span>
                  </div>
                  <div className="grid grid-cols-[100px_1fr] gap-2 text-sm items-center">
                    <span className="font-medium text-muted-foreground">
                      {t('cursorPage.filePath')}
                    </span>
                    <code className="bg-muted px-1.5 py-0.5 rounded text-xs break-all">
                      {rawSettingsPath ?? '~/.ccs/cursor.settings.json'}
                    </code>
                  </div>
                  {/* TODO i18n: missing key for model mapping env var info paragraph */}
                  <p className="text-xs text-muted-foreground">
                    Legacy bridge model mapping writes `ANTHROPIC_MODEL`,
                    `ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, and
                    `ANTHROPIC_DEFAULT_HAIKU_MODEL` in `cursor.settings.json`.
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-medium mb-3">{t('cursorPage.availableModels')}</h3>
                  {modelsLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('cursorPage.loadingModels')}
                    </div>
                  ) : orderedModels.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('cursorPage.noModels')}</p>
                  ) : (
                    <div className="space-y-2">
                      {orderedModels.map((model) => (
                        <div
                          key={model.id}
                          className="rounded-lg border px-3 py-2 flex items-center justify-between"
                        >
                          <div>
                            <p className="text-sm font-medium">{model.id}</p>
                            <p className="text-xs text-muted-foreground">
                              {model.name} • {model.provider}
                            </p>
                          </div>
                          {model.id === currentModel && <Badge>{t('cursorPage.default')}</Badge>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
