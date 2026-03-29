import { useState } from 'react';
import { Loader2, SlidersHorizontal } from 'lucide-react';
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
  const personalityOptions = withCurrentValue(
    ['default', 'pragmatic', 'concise', 'direct'],
    draft.personality
  );

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs font-medium">Model</p>
          <Input
            value={draft.model ?? ''}
            onChange={(event) =>
              setDraft((current) => ({ ...current, model: event.target.value || null }))
            }
            placeholder="gpt-5.4"
            disabled={disabled}
          />
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium">Reasoning effort</p>
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
              <SelectValue placeholder="Use default" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>Use default</SelectItem>
              {reasoningOptions.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium">Default provider</p>
          <Select
            value={toSelectValue(draft.modelProvider)}
            onValueChange={(next) =>
              setDraft((current) => ({ ...current, modelProvider: next === UNSET ? null : next }))
            }
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Use Codex default" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>Use Codex default</SelectItem>
              {providerOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium">Approval policy</p>
          <Select
            value={toSelectValue(draft.approvalPolicy)}
            onValueChange={(next) =>
              setDraft((current) => ({ ...current, approvalPolicy: next === UNSET ? null : next }))
            }
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Use default" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>Use default</SelectItem>
              {approvalOptions.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium">Sandbox mode</p>
          <Select
            value={toSelectValue(draft.sandboxMode)}
            onValueChange={(next) =>
              setDraft((current) => ({ ...current, sandboxMode: next === UNSET ? null : next }))
            }
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Use default" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>Use default</SelectItem>
              {sandboxOptions.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium">Web search</p>
          <Select
            value={toSelectValue(draft.webSearch)}
            onValueChange={(next) =>
              setDraft((current) => ({ ...current, webSearch: next === UNSET ? null : next }))
            }
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Use default" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>Use default</SelectItem>
              {webSearchOptions.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium">Tool output token limit</p>
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
          <p className="text-xs font-medium">Personality</p>
          <Select
            value={toSelectValue(draft.personality)}
            onValueChange={(next) =>
              setDraft((current) => ({ ...current, personality: next === UNSET ? null : next }))
            }
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Use default" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>Use default</SelectItem>
              {personalityOptions.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => onSave(draft)} disabled={disabled || saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
      title="Top-level controls"
      badge="config.toml"
      icon={<SlidersHorizontal className="h-4 w-4" />}
      description="Structured controls for the stable top-level Codex settings users touch most often."
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
