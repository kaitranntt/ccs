import { useMemo, useState } from 'react';
import { Loader2, PlugZap, Trash2 } from 'lucide-react';
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
import type { CodexMcpServerPatchValues } from '@/hooks/use-codex-types';
import type { CodexMcpServerEntry } from '@/lib/codex-config';
import { CodexConfigCardShell } from './codex-config-card-shell';

interface CodexMcpServersCardProps {
  entries: CodexMcpServerEntry[];
  disabled?: boolean;
  disabledReason?: string | null;
  saving?: boolean;
  onSave: (name: string, values: CodexMcpServerPatchValues) => Promise<void> | void;
  onDelete: (name: string) => Promise<void> | void;
}

const EMPTY_MCP_SERVER_DRAFT: CodexMcpServerEntry = {
  name: '',
  transport: 'stdio',
  command: null,
  args: [],
  url: null,
  enabled: true,
  required: false,
  startupTimeoutSec: null,
  toolTimeoutSec: null,
  enabledTools: [],
  disabledTools: [],
};

function toCsv(value: string[]) {
  return value.join(', ');
}

function fromCsv(value: string) {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

interface McpServerEditorProps {
  initialDraft: CodexMcpServerEntry;
  isNew: boolean;
  disabled: boolean;
  saving: boolean;
  canDelete: boolean;
  onSave: (name: string, values: CodexMcpServerPatchValues) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
}

function McpServerEditor({
  initialDraft,
  isNew,
  disabled,
  saving,
  canDelete,
  onSave,
  onDelete,
}: McpServerEditorProps) {
  const [draft, setDraft] = useState<CodexMcpServerEntry>(initialDraft);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          value={draft.name}
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          placeholder="playwright"
          disabled={disabled || !isNew}
        />
        <Select
          value={draft.transport}
          onValueChange={(next) =>
            setDraft((current) => ({
              ...current,
              transport: next as CodexMcpServerEntry['transport'],
            }))
          }
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="stdio">stdio</SelectItem>
            <SelectItem value="streamable-http">streamable-http</SelectItem>
          </SelectContent>
        </Select>
        {draft.transport === 'stdio' ? (
          <>
            <Input
              value={draft.command ?? ''}
              onChange={(event) =>
                setDraft((current) => ({ ...current, command: event.target.value || null }))
              }
              placeholder="npx"
              disabled={disabled}
            />
            <Input
              value={toCsv(draft.args)}
              onChange={(event) =>
                setDraft((current) => ({ ...current, args: fromCsv(event.target.value) }))
              }
              placeholder="@playwright/mcp@latest, --flag"
              disabled={disabled}
            />
          </>
        ) : (
          <Input
            className="sm:col-span-2"
            value={draft.url ?? ''}
            onChange={(event) =>
              setDraft((current) => ({ ...current, url: event.target.value || null }))
            }
            placeholder="https://example.test/mcp"
            disabled={disabled}
          />
        )}
        <Input
          type="number"
          min={1}
          value={draft.startupTimeoutSec ?? ''}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              startupTimeoutSec: event.target.value ? Number(event.target.value) : null,
            }))
          }
          placeholder="Startup timeout (sec)"
          disabled={disabled}
        />
        <Input
          type="number"
          min={1}
          value={draft.toolTimeoutSec ?? ''}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              toolTimeoutSec: event.target.value ? Number(event.target.value) : null,
            }))
          }
          placeholder="Tool timeout (sec)"
          disabled={disabled}
        />
        <Input
          value={toCsv(draft.enabledTools)}
          onChange={(event) =>
            setDraft((current) => ({ ...current, enabledTools: fromCsv(event.target.value) }))
          }
          placeholder="enabled_tools"
          disabled={disabled}
        />
        <Input
          value={toCsv(draft.disabledTools)}
          onChange={(event) =>
            setDraft((current) => ({ ...current, disabledTools: fromCsv(event.target.value) }))
          }
          placeholder="disabled_tools"
          disabled={disabled}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
          Enabled
          <Switch
            checked={draft.enabled}
            onCheckedChange={(next) => setDraft((current) => ({ ...current, enabled: next }))}
            disabled={disabled}
          />
        </label>
        <label className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
          Required
          <Switch
            checked={draft.required}
            onCheckedChange={(next) => setDraft((current) => ({ ...current, required: next }))}
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
              transport: draft.transport,
              command: draft.command,
              args: draft.args,
              url: draft.url,
              enabled: draft.enabled,
              required: draft.required,
              startupTimeoutSec: draft.startupTimeoutSec,
              toolTimeoutSec: draft.toolTimeoutSec,
              enabledTools: draft.enabledTools,
              disabledTools: draft.disabledTools,
            })
          }
          disabled={disabled || saving || draft.name.trim().length === 0}
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save MCP server
        </Button>
      </div>
    </>
  );
}

export function CodexMcpServersCard({
  entries,
  disabled = false,
  disabledReason,
  saving = false,
  onSave,
  onDelete,
}: CodexMcpServersCardProps) {
  const [selectedName, setSelectedName] = useState('new');
  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.name === selectedName) ?? null,
    [entries, selectedName]
  );
  const draftSeed = selectedEntry ?? EMPTY_MCP_SERVER_DRAFT;
  const draftKey = JSON.stringify(draftSeed);

  return (
    <CodexConfigCardShell
      title="MCP servers"
      badge="mcp_servers"
      icon={<PlugZap className="h-4 w-4" />}
      description="Manage the safe MCP transport fields. Keep auth headers and bearer tokens in raw TOML."
      disabledReason={disabledReason}
    >
      <Select value={selectedName} onValueChange={setSelectedName} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder="Select MCP server" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="new">Create new MCP server</SelectItem>
          {entries.map((entry) => (
            <SelectItem key={entry.name} value={entry.name}>
              {entry.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <McpServerEditor
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
