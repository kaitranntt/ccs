import { useMemo, useState } from 'react';
import { Layers3, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CodexProfilePatchValues } from '@/hooks/use-codex-types';
import type { CodexProfileEntry } from '@/lib/codex-config';
import { CodexConfigCardShell } from './codex-config-card-shell';

interface CodexProfilesCardProps {
  activeProfile: string | null;
  entries: CodexProfileEntry[];
  providerNames: string[];
  disabled?: boolean;
  disabledReason?: string | null;
  saving?: boolean;
  onSave: (
    name: string,
    values: CodexProfilePatchValues,
    setAsActive: boolean
  ) => Promise<void> | void;
  onDelete: (name: string) => Promise<void> | void;
  onSetActive: (name: string) => Promise<void> | void;
}

interface ProfileEditorProps {
  initialName: string;
  initialModel: string | null;
  initialProvider: string | null;
  initialEffort: string | null;
  providerNames: string[];
  activeProfile: string | null;
  selectedEntryName: string | null;
  disabled: boolean;
  saving: boolean;
  onSave: (
    name: string,
    values: CodexProfilePatchValues,
    setAsActive: boolean
  ) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
  onSetActive: () => Promise<void> | void;
}

function ProfileEditor({
  initialName,
  initialModel,
  initialProvider,
  initialEffort,
  providerNames,
  activeProfile,
  selectedEntryName,
  disabled,
  saving,
  onSave,
  onDelete,
  onSetActive,
}: ProfileEditorProps) {
  const [nameDraft, setNameDraft] = useState(initialName);
  const [modelDraft, setModelDraft] = useState<string | null>(initialModel);
  const [providerDraft, setProviderDraft] = useState<string | null>(initialProvider);
  const [effortDraft, setEffortDraft] = useState<string | null>(initialEffort);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          value={nameDraft}
          onChange={(event) => setNameDraft(event.target.value)}
          placeholder="deep-review"
          disabled={disabled || selectedEntryName !== null}
        />
        <Input
          value={modelDraft ?? ''}
          onChange={(event) => setModelDraft(event.target.value || null)}
          placeholder="gpt-5.4"
          disabled={disabled}
        />
        <Select
          value={providerDraft ?? '__unset__'}
          onValueChange={(next) => setProviderDraft(next === '__unset__' ? null : next)}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Use global provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__unset__">Use global provider</SelectItem>
            {providerNames.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={effortDraft ?? '__unset__'}
          onValueChange={(next) => setEffortDraft(next === '__unset__' ? null : next)}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Use global effort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__unset__">Use global effort</SelectItem>
            {['minimal', 'low', 'medium', 'high', 'xhigh'].map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-between gap-2">
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={onDelete}
            disabled={disabled || saving || !selectedEntryName}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
          <Button
            variant="outline"
            onClick={onSetActive}
            disabled={
              disabled || saving || !selectedEntryName || selectedEntryName === activeProfile
            }
          >
            Set active
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() =>
              onSave(
                nameDraft,
                {
                  model: modelDraft,
                  modelProvider: providerDraft,
                  modelReasoningEffort: effortDraft,
                },
                false
              )
            }
            disabled={disabled || saving || nameDraft.trim().length === 0}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save profile
          </Button>
          <Button
            onClick={() =>
              onSave(
                nameDraft,
                {
                  model: modelDraft,
                  modelProvider: providerDraft,
                  modelReasoningEffort: effortDraft,
                },
                true
              )
            }
            disabled={disabled || saving || nameDraft.trim().length === 0}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save + activate
          </Button>
        </div>
      </div>
    </>
  );
}

export function CodexProfilesCard({
  activeProfile,
  entries,
  providerNames,
  disabled = false,
  disabledReason,
  saving = false,
  onSave,
  onDelete,
  onSetActive,
}: CodexProfilesCardProps) {
  const [selectedName, setSelectedName] = useState('new');
  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.name === selectedName) ?? null,
    [entries, selectedName]
  );
  const draftKey = JSON.stringify(selectedEntry ?? { name: '', values: {} });

  return (
    <CodexConfigCardShell
      title="Profiles"
      badge="profiles"
      icon={<Layers3 className="h-4 w-4" />}
      description="Create reusable Codex overlays and set the active default profile."
      disabledReason={disabledReason}
    >
      <Select value={selectedName} onValueChange={setSelectedName} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder="Select profile" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="new">Create new profile</SelectItem>
          {entries.map((entry) => (
            <SelectItem key={entry.name} value={entry.name}>
              {entry.name}
              {entry.name === activeProfile ? ' (active)' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ProfileEditor
        key={draftKey}
        initialName={selectedEntry?.name ?? ''}
        initialModel={selectedEntry?.values.model ?? null}
        initialProvider={selectedEntry?.values.modelProvider ?? null}
        initialEffort={selectedEntry?.values.modelReasoningEffort ?? null}
        providerNames={providerNames}
        activeProfile={activeProfile}
        selectedEntryName={selectedEntry?.name ?? null}
        disabled={disabled}
        saving={saving}
        onDelete={async () => {
          if (!selectedEntry) return;
          await onDelete(selectedEntry.name);
          setSelectedName('new');
        }}
        onSetActive={async () => {
          if (!selectedEntry) return;
          await onSetActive(selectedEntry.name);
        }}
        onSave={async (name, values, setAsActive) => {
          await onSave(name, values, setAsActive);
          setSelectedName(name);
        }}
      />
    </CodexConfigCardShell>
  );
}
