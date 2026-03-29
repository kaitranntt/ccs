import { useState } from 'react';
import { FolderCheck, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CodexProjectTrustEntry } from '@/lib/codex-config';
import { CodexConfigCardShell } from './codex-config-card-shell';

interface CodexProjectTrustCardProps {
  workspacePath: string;
  entries: CodexProjectTrustEntry[];
  disabled?: boolean;
  disabledReason?: string | null;
  saving?: boolean;
  onSave: (path: string, trustLevel: string | null) => Promise<void> | void;
}

interface ProjectTrustComposerProps {
  workspacePath: string;
  disabled: boolean;
  saving: boolean;
  onSave: (path: string, trustLevel: string | null) => Promise<void> | void;
}

function ProjectTrustComposer({
  workspacePath,
  disabled,
  saving,
  onSave,
}: ProjectTrustComposerProps) {
  const [pathDraft, setPathDraft] = useState(workspacePath);
  const [trustLevel, setTrustLevel] = useState('trusted');

  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_160px_auto]">
      <Input
        value={pathDraft}
        onChange={(event) => setPathDraft(event.target.value)}
        placeholder="~/repo or /absolute/path"
        disabled={disabled}
      />
      <Select value={trustLevel} onValueChange={setTrustLevel} disabled={disabled}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="trusted">trusted</SelectItem>
          <SelectItem value="ask">ask</SelectItem>
        </SelectContent>
      </Select>
      <Button onClick={() => onSave(pathDraft, trustLevel)} disabled={disabled || saving}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Save trust
      </Button>
    </div>
  );
}

export function CodexProjectTrustCard({
  workspacePath,
  entries,
  disabled = false,
  disabledReason,
  saving = false,
  onSave,
}: CodexProjectTrustCardProps) {
  return (
    <CodexConfigCardShell
      title="Project trust"
      badge="projects"
      icon={<FolderCheck className="h-4 w-4" />}
      description="Trust current workspaces or remove stale trust entries without opening raw TOML."
      disabledReason={disabledReason}
    >
      <p className="text-xs text-muted-foreground">
        Paths must be absolute or start with <code>~/</code>. Relative paths are rejected so CCS
        does not trust the wrong folder.
      </p>
      <ProjectTrustComposer
        key={workspacePath}
        workspacePath={workspacePath}
        disabled={disabled}
        saving={saving}
        onSave={onSave}
      />

      <Button
        variant="outline"
        className="w-full justify-start"
        onClick={() => onSave(workspacePath, 'trusted')}
        disabled={disabled || saving}
      >
        Trust current workspace
      </Button>

      <div className="space-y-2">
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">No explicit project trust entries saved.</p>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.path}
              className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{entry.path}</p>
                <p className="text-xs text-muted-foreground">trust_level = {entry.trustLevel}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onSave(entry.path, entry.trustLevel === 'trusted' ? 'ask' : 'trusted')
                  }
                  disabled={disabled || saving}
                >
                  Toggle
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onSave(entry.path, null)}
                  disabled={disabled || saving}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </CodexConfigCardShell>
  );
}
