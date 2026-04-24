import { useState } from 'react';
import { CircleAlert, Loader2, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CodexTopLevelSettingsPatch } from '@/hooks/use-codex-types';
import type { CodexTopLevelSettingsView } from '@/lib/codex-config';
import { CodexConfigCardShell } from './codex-config-card-shell';

const UNSET = '__unset__';
const GPT_5X_MAX_CONTEXT_WINDOW = 1_050_000;
const GPT_5X_STANDARD_CONTEXT_WINDOW = 272_000;
const CCS_GPT_5X_STARTER_CONTEXT_WINDOW = 800_000;
const CCS_GPT_5X_STARTER_AUTO_COMPACT_TOKEN_LIMIT = 700_000;
const INTEGER_FORMATTER = new Intl.NumberFormat('en-US');

interface CodexTopLevelControlsCardProps {
  values: CodexTopLevelSettingsView;
  providerNames: string[];
  disabled?: boolean;
  disabledReason?: string | null;
  saving?: boolean;
  onSave: (values: CodexTopLevelSettingsPatch) => Promise<void> | void;
}

function toSelectValue(value: string | null | undefined) {
  return value ?? UNSET;
}

function withCurrentValue(options: string[], current: string | null | undefined) {
  return current && !options.includes(current) ? [current, ...options] : options;
}

function formatInteger(value: number) {
  return INTEGER_FORMATTER.format(value);
}

function isGpt5LongContextModelId(value: string | null | undefined) {
  const model = value?.trim().toLowerCase();
  return model?.startsWith('gpt-5.4') === true || model?.startsWith('gpt-5.5') === true;
}

function buildTopLevelPatch(
  initialValues: CodexTopLevelSettingsView,
  draft: CodexTopLevelSettingsView
): CodexTopLevelSettingsPatch {
  const patch: CodexTopLevelSettingsPatch = {};

  if (draft.model !== initialValues.model) patch.model = draft.model;
  if (draft.modelReasoningEffort !== initialValues.modelReasoningEffort) {
    patch.modelReasoningEffort = draft.modelReasoningEffort;
  }
  if (draft.modelContextWindow !== initialValues.modelContextWindow) {
    patch.modelContextWindow = draft.modelContextWindow;
  }
  if (draft.modelAutoCompactTokenLimit !== initialValues.modelAutoCompactTokenLimit) {
    patch.modelAutoCompactTokenLimit = draft.modelAutoCompactTokenLimit;
  }
  if (draft.modelProvider !== initialValues.modelProvider) {
    patch.modelProvider = draft.modelProvider;
  }
  if (draft.approvalPolicy !== initialValues.approvalPolicy) {
    patch.approvalPolicy = draft.approvalPolicy;
  }
  if (draft.sandboxMode !== initialValues.sandboxMode) patch.sandboxMode = draft.sandboxMode;
  if (draft.webSearch !== initialValues.webSearch) patch.webSearch = draft.webSearch;
  if (draft.toolOutputTokenLimit !== initialValues.toolOutputTokenLimit) {
    patch.toolOutputTokenLimit = draft.toolOutputTokenLimit;
  }
  if (draft.personality !== initialValues.personality) patch.personality = draft.personality;

  return patch;
}

interface TopLevelControlsFormProps {
  initialValues: CodexTopLevelSettingsView;
  providerNames: string[];
  disabled: boolean;
  saving: boolean;
  onSave: (values: CodexTopLevelSettingsPatch) => Promise<void> | void;
}

function TopLevelControlsForm({
  initialValues,
  providerNames,
  disabled,
  saving,
  onSave,
}: TopLevelControlsFormProps) {
  const { t } = useTranslation();

  const [draft, setDraft] = useState<CodexTopLevelSettingsView>(initialValues);
  const reasoningOptions = withCurrentValue(
    ['minimal', 'low', 'medium', 'high', 'xhigh'],
    draft.modelReasoningEffort
  );
  const providerOptions = withCurrentValue(providerNames, draft.modelProvider);
  const approvalOptions = withCurrentValue(
    ['on-request', 'never', 'untrusted'],
    draft.approvalPolicy
  );
  const sandboxOptions = withCurrentValue(
    ['read-only', 'workspace-write', 'danger-full-access'],
    draft.sandboxMode
  );
  const webSearchOptions = withCurrentValue(['cached', 'live', 'disabled'], draft.webSearch);
  const personalityOptions = withCurrentValue(['none', 'friendly', 'pragmatic'], draft.personality);
  const patch = buildTopLevelPatch(initialValues, draft);
  const hasChanges = Object.keys(patch).length > 0;
  const isGpt5LongContextSelected = isGpt5LongContextModelId(draft.model);
  const parseOptionalInteger = (value: string) => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? Number(trimmed) : null;
  };

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs font-medium">{t('codex.model')}</p>
          <Input
            value={draft.model ?? ''}
            onChange={(event) =>
              setDraft((current) => ({ ...current, model: event.target.value || null }))
            }
            placeholder="gpt-5.5"
            disabled={disabled}
          />
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium">{t('codex.reasoningEffort')}</p>
          <Select
            value={toSelectValue(draft.modelReasoningEffort)}
            onValueChange={(next) =>
              setDraft((current) => ({
                ...current,
                modelReasoningEffort: next === UNSET ? null : next,
              }))
            }
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('codex.useDefault')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>{t('codex.useDefault')}</SelectItem>
              {reasoningOptions.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium">{t('codex.defaultProvider')}</p>
          <Select
            value={toSelectValue(draft.modelProvider)}
            onValueChange={(next) =>
              setDraft((current) => ({ ...current, modelProvider: next === UNSET ? null : next }))
            }
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('codex.useCodexDefault')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>{t('codex.useCodexDefault')}</SelectItem>
              {providerOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium">{t('codex.approvalPolicy')}</p>
          <Select
            value={toSelectValue(draft.approvalPolicy)}
            onValueChange={(next) =>
              setDraft((current) => ({ ...current, approvalPolicy: next === UNSET ? null : next }))
            }
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('codex.useDefault')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>{t('codex.useDefault')}</SelectItem>
              {approvalOptions.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium">{t('codex.sandboxMode')}</p>
          <Select
            value={toSelectValue(draft.sandboxMode)}
            onValueChange={(next) =>
              setDraft((current) => ({ ...current, sandboxMode: next === UNSET ? null : next }))
            }
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('codex.useDefault')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>{t('codex.useDefault')}</SelectItem>
              {sandboxOptions.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium">{t('codex.webSearch')}</p>
          <Select
            value={toSelectValue(draft.webSearch)}
            onValueChange={(next) =>
              setDraft((current) => ({ ...current, webSearch: next === UNSET ? null : next }))
            }
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('codex.useDefault')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>{t('codex.useDefault')}</SelectItem>
              {webSearchOptions.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium">{t('codex.toolOutputTokenLimit')}</p>
          <Input
            type="number"
            min={1}
            value={draft.toolOutputTokenLimit ?? ''}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                toolOutputTokenLimit: event.target.value ? Number(event.target.value) : null,
              }))
            }
            placeholder="25000"
            disabled={disabled}
          />
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium">{t('codex.personality')}</p>
          <Select
            value={toSelectValue(draft.personality)}
            onValueChange={(next) =>
              setDraft((current) => ({ ...current, personality: next === UNSET ? null : next }))
            }
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('codex.useDefault')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>{t('codex.useDefault')}</SelectItem>
              {personalityOptions.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 shadow-sm dark:bg-amber-400/5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CircleAlert className="h-4 w-4 text-amber-600 dark:text-amber-300" />
              <p className="text-sm font-semibold">{t('codex.longContextOverride')}</p>
              <Badge
                variant="outline"
                className="border-amber-500/40 bg-background/80 text-[10px] uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300"
              >
                {/* TODO i18n: missing key codex.manualOptInOnly */}
                Manual opt-in only
              </Badge>
              <Badge
                variant="secondary"
                className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
              >
                {/* TODO i18n: missing keys codex.gpt5Selected / codex.gpt5Reference */}
                {isGpt5LongContextSelected ? 'GPT-5.x selected' : 'GPT-5.x reference'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {/* TODO i18n: missing key codex.draftValuesOnly */}
              Draft values only. Nothing applies until Save.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  modelContextWindow: CCS_GPT_5X_STARTER_CONTEXT_WINDOW,
                  modelAutoCompactTokenLimit: CCS_GPT_5X_STARTER_AUTO_COMPACT_TOKEN_LIMIT,
                }))
              }
            >
              {/* TODO i18n: missing key codex.fillCautiousPair */}
              Fill cautious pair
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  modelContextWindow: GPT_5X_MAX_CONTEXT_WINDOW,
                }))
              }
            >
              {/* TODO i18n: missing key codex.setOfficialMaxWindow */}
              Set official max window
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  modelContextWindow: null,
                  modelAutoCompactTokenLimit: null,
                }))
              }
            >
              {/* TODO i18n: missing key codex.clear */}
              Clear
            </Button>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border bg-background/85 px-3 py-3 shadow-sm shadow-black/5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {/* TODO i18n: missing key codex.officialMax */}
              Official max
            </p>
            <p className="mt-1 font-mono text-base font-semibold text-foreground">1.05M / 1M</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{t('codex.gptContextCap')}</p>
          </div>
          <div className="rounded-lg border bg-background/85 px-3 py-3 shadow-sm shadow-black/5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {/* TODO i18n: missing key codex.standardWindow */}
              Standard window
            </p>
            <p className="mt-1 font-mono text-base font-semibold text-foreground">
              {formatInteger(GPT_5X_STANDARD_CONTEXT_WINDOW)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">{t('codex.normalUsageWindow')}</p>
          </div>
          <div className="rounded-lg border bg-background/85 px-3 py-3 shadow-sm shadow-black/5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {/* TODO i18n: missing key codex.above272k */}
              Above 272K
            </p>
            <p className="mt-1 font-mono text-base font-semibold text-foreground">
              {t('codex.counts2x')}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">{t('codex.usageLimitCost')}</p>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border bg-background/75 px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {/* TODO i18n: missing key codex.oneCautiousPair */}
                One cautious pair
              </p>
              <div className="rounded-full border bg-background px-2.5 py-1 font-mono text-[11px] font-medium">
                {/* TODO i18n: missing key codex.context */}
                Context {formatInteger(CCS_GPT_5X_STARTER_CONTEXT_WINDOW)}
              </div>
              <div className="rounded-full border bg-background px-2.5 py-1 font-mono text-[11px] font-medium">
                {/* TODO i18n: missing key codex.autoCompact */}
                Auto-compact {formatInteger(CCS_GPT_5X_STARTER_AUTO_COMPACT_TOKEN_LIMIT)}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant="outline"
                className="border-border/70 bg-background/80 text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
              >
                {/* TODO i18n: missing key codex.notOfficial */}
                Not official
              </Badge>
              <Badge
                variant="outline"
                className="border-border/70 bg-background/80 text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
              >
                {/* TODO i18n: missing key codex.draftOnly */}
                Draft only
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span>{t('codex.quickFillWarning')}</span>
            {!isGpt5LongContextSelected && draft.model ? (
              <span>
                {/* TODO i18n: missing key codex.shouldBeCheckedSeparately */}
                <code>{draft.model}</code> should be checked separately.
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs font-medium">{t('codex.modelContextWindow')}</p>
            <Input
              aria-label={t('codex.modelContextWindow')}
              type="number"
              min={1}
              value={draft.modelContextWindow ?? ''}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  modelContextWindow: parseOptionalInteger(event.target.value),
                }))
              }
              // TODO i18n: missing key codex.unset
              placeholder="Unset"
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">
              {/* TODO i18n: missing key codex.writesModelContextWindow */}
              Writes <code>model_context_window</code>. Leave unset to keep Codex defaults.
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium">{t('codex.autoCompactTokenLimit')}</p>
            <Input
              aria-label={t('codex.autoCompactTokenLimit')}
              type="number"
              min={1}
              value={draft.modelAutoCompactTokenLimit ?? ''}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  modelAutoCompactTokenLimit: parseOptionalInteger(event.target.value),
                }))
              }
              // TODO i18n: missing key codex.unset
              placeholder="Unset"
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">
              {/* TODO i18n: missing key codex.writesAutoCompactTokenLimit */}
              Writes <code>model_auto_compact_token_limit</code>. Leave unset to keep model
              defaults.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {/* TODO i18n: missing key codex.docs */}
          <span className="text-[10px] uppercase tracking-[0.14em]">Docs</span>
          <a
            href="https://developers.openai.com/api/docs/models/gpt-5.5"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            {/* TODO i18n: missing key codex.gpt55ModelPage */}
            GPT-5.5 model page
          </a>
          <a
            href="https://openai.com/index/introducing-gpt-5-4/"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            {/* TODO i18n: missing key codex.releaseNotes */}
            Release notes
          </a>
          <a
            href="https://developers.openai.com/codex/config-reference"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            {/* TODO i18n: missing key codex.configReference */}
            Config reference
          </a>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => onSave(patch)} disabled={disabled || saving || !hasChanges}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {/* TODO i18n: missing key codex.saveTopLevelSettings */}
          Save top-level settings
        </Button>
      </div>
    </>
  );
}

export function CodexTopLevelControlsCard({
  values,
  providerNames,
  disabled = false,
  disabledReason,
  saving = false,
  onSave,
}: CodexTopLevelControlsCardProps) {
  return (
    <CodexConfigCardShell
      // TODO i18n: missing key codex.topLevelControls
      title="Top-level controls"
      badge="config.toml"
      icon={<SlidersHorizontal className="h-4 w-4" />}
      // TODO i18n: missing key codex.topLevelControlsDesc
      description="Structured controls for the stable top-level Codex settings users touch most often. Unsupported upstream shapes stay untouched and should be edited in raw TOML."
      disabledReason={disabledReason}
    >
      <TopLevelControlsForm
        key={JSON.stringify(values)}
        initialValues={values}
        providerNames={providerNames}
        disabled={disabled}
        saving={saving}
        onSave={onSave}
      />
    </CodexConfigCardShell>
  );
}
