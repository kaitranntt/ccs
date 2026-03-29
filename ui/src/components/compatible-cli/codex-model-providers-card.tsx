import { useMemo, useState } from 'react';
import { KeyRound, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CodexModelProviderPatchValues } from '@/hooks/use-codex-types';
import type { CodexModelProviderEntry } from '@/lib/codex-config';
import { CodexConfigCardShell } from './codex-config-card-shell';

interface CodexModelProvidersCardProps {
  entries: CodexModelProviderEntry[];
  disabled?: boolean;
  disabledReason?: string | null;
  saving?: boolean;
  onSave: (name: string, values: CodexModelProviderPatchValues) => Promise<void> | void;
  onDelete: (name: string) => Promise<void> | void;
}

const EMPTY_MODEL_PROVIDER_DRAFT: CodexModelProviderEntry = {
  name: '',
  displayName: null,
  baseUrl: null,
  envKey: null,
  wireApi: 'responses',
  requiresOpenaiAuth: false,
  supportsWebsockets: false,
};

interface ModelProviderEditorProps {
  initialDraft: CodexModelProviderEntry;
  isNew: boolean;
  disabled: boolean;
  saving: boolean;
  canDelete: boolean;
  onSave: (name: string, values: CodexModelProviderPatchValues) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
}

function ModelProviderEditor({
  initialDraft,
  isNew,
  disabled,
  saving,
  canDelete,
  onSave,
  onDelete,
}: ModelProviderEditorProps) {
  const [draft, setDraft] = useState<CodexModelProviderEntry>(initialDraft);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          value={draft.name}
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          placeholder="Provider id"
          disabled={disabled || !isNew}
        />
        <Input
          value={draft.displayName ?? ''}
          onChange={(event) =>
            setDraft((current) => ({ ...current, displayName: event.target.value || null }))
          }
          placeholder="Display name"
          disabled={disabled}
        />
        <Input
          value={draft.baseUrl ?? ''}
          onChange={(event) =>
            setDraft((current) => ({ ...current, baseUrl: event.target.value || null }))
          }
          placeholder="http://127.0.0.1:8317/api/provider/codex"
          disabled={disabled}
        />
        <Input
          value={draft.envKey ?? ''}
          onChange={(event) =>
            setDraft((current) => ({ ...current, envKey: event.target.value || null }))
          }
          placeholder="CLIPROXY_API_KEY"
          disabled={disabled}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          value={draft.wireApi ?? 'responses'}
          onValueChange={(next) => setDraft((current) => ({ ...current, wireApi: next }))}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="responses">responses</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
          Requires OpenAI auth
          <Switch
            checked={draft.requiresOpenaiAuth}
            onCheckedChange={(next) =>
              setDraft((current) => ({ ...current, requiresOpenaiAuth: next }))
            }
            disabled={disabled}
          />
        </label>
        <label className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
          Supports websockets
          <Switch
            checked={draft.supportsWebsockets}
            onCheckedChange={(next) =>
              setDraft((current) => ({ ...current, supportsWebsockets: next }))
            }
            disabled={disabled}
          />
        </label>
      </div>

      <div className="flex justify-between gap-2">
        <Button variant="outline" onClick={onDelete} disabled={disabled || saving || !canDelete}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>
        <Button
          onClick={() =>
            onSave(draft.name, {
              displayName: draft.displayName,
              baseUrl: draft.baseUrl,
              envKey: draft.envKey,
              wireApi: draft.wireApi,
              requiresOpenaiAuth: draft.requiresOpenaiAuth,
              supportsWebsockets: draft.supportsWebsockets,
            })
          }
          disabled={disabled || saving || draft.name.trim().length === 0}
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save provider
        </Button>
      </div>
    </>
  );
}

export function CodexModelProvidersCard({
  entries,
  disabled = false,
  disabledReason,
  saving = false,
  onSave,
  onDelete,
}: CodexModelProvidersCardProps) {
  const [selectedName, setSelectedName] = useState<string>('new');
  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.name === selectedName) ?? null,
    [entries, selectedName]
  );
  const draftSeed = selectedEntry ?? EMPTY_MODEL_PROVIDER_DRAFT;
  const draftKey = JSON.stringify(draftSeed);

  return (
    <CodexConfigCardShell
      title="Model providers"
      badge="model_providers"
      icon={<KeyRound className="h-4 w-4" />}
      description="Edit the common provider fields CCS can support safely. Keep secret migration and inline bearer tokens in raw TOML."
      disabledReason={disabledReason}
    >
      <Select value={selectedName} onValueChange={setSelectedName} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder="Select provider" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="new">Create new provider</SelectItem>
          {entries.map((entry) => (
            <SelectItem key={entry.name} value={entry.name}>
              {entry.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ModelProviderEditor
        key={draftKey}
        initialDraft={draftSeed}
        isNew={selectedName === 'new'}
        disabled={disabled}
        saving={saving}
        canDelete={selectedEntry !== null}
        onDelete={async () => {
          if (!selectedEntry) return;
          await onDelete(selectedEntry.name);
          setSelectedName('new');
        }}
        onSave={async (name, values) => {
          await onSave(name, values);
          setSelectedName(name);
        }}
      />
    </CodexConfigCardShell>
  );
}
