import { Loader2 } from 'lucide-react';
import i18n from '@/lib/i18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import type {
  ClaudeExtensionBinding,
  ClaudeExtensionFileState,
  ClaudeExtensionTargetStatus,
} from '@/hooks/use-claude-extension';
import { cn } from '@/lib/utils';
import { formatPathForDisplay } from './binding-utils';

export function StatusBadge({ state }: { state: ClaudeExtensionFileState }) {
  const classes =
    state === 'applied'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : state === 'drifted'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
        : state === 'missing'
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'border-border bg-muted text-muted-foreground';

  return (
    <Badge variant="outline" className={classes}>
      {state}
    </Badge>
  );
}

export function DetailRow({
  label,
  value,
  mono = false,
  copyValue,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyValue?: string;
}) {
  const isPathRow = typeof copyValue === 'string' && copyValue.trim().length > 0;

  return (
    <div className="grid gap-2 text-sm sm:grid-cols-[112px_minmax(0,1fr)] sm:items-start">
      <span className="text-muted-foreground">{label}</span>
      {isPathRow ? (
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1 rounded-md border bg-muted/25 px-3 py-2">
            <span className="block text-left font-mono text-xs leading-5 [overflow-wrap:anywhere]">
              {formatPathForDisplay(value)}
            </span>
          </div>
          <CopyButton
            value={copyValue}
            label={`Copy ${label.toLowerCase()}`}
            className="shrink-0"
          />
        </div>
      ) : (
        <span
          className={cn(
            'text-left sm:text-right',
            mono && 'font-mono text-xs leading-5 [overflow-wrap:anywhere]'
          )}
        >
          {value}
        </span>
      )}
    </div>
  );
}

export function CodeBlockCard({
  title,
  description,
  value,
}: {
  title: string;
  description: string;
  value: string;
}) {
  return (
    <Card className="border-border/60 bg-card/80">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
          <CopyButton value={value} label={`Copy ${title}`} />
        </div>
      </CardHeader>
      <CardContent>
        <pre className="max-h-[360px] overflow-auto rounded-lg border bg-muted/30 p-4 text-xs leading-6">
          {value}
        </pre>
      </CardContent>
    </Card>
  );
}

export function TargetStatusCard({
  title,
  description,
  status,
  applyLabel,
  resetLabel,
  onApply,
  onReset,
  disabled,
  busy,
}: {
  title: string;
  description: string;
  status?: ClaudeExtensionTargetStatus;
  applyLabel: string;
  resetLabel: string;
  onApply: () => void;
  onReset: () => void;
  disabled: boolean;
  busy: boolean;
}) {
  return (
    <Card className="border-border/60 bg-card/80">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
          {status ? <StatusBadge state={status.state} /> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <DetailRow
            label="Path"
            value={status?.path || 'Save a binding first'}
            mono
            copyValue={status?.path}
          />
          <DetailRow
            label="File"
            value={status ? (status.exists ? 'Present' : 'Not created yet') : 'Unavailable'}
          />
        </div>

        <div className="rounded-lg border bg-muted/25 p-3 text-sm text-muted-foreground">
          {status?.message ||
            i18n.t('claudeExtensionPage.verifyAfterSaving', {
              defaultValue: 'Verify the binding after saving to inspect the current file state.',
            })}
        </div>

        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={onApply} disabled={disabled || busy}>
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {applyLabel}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={onReset}
            disabled={disabled || busy}
          >
            {resetLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function BindingListItem({
  binding,
  isSelected,
  onSelect,
}: {
  binding: ClaudeExtensionBinding;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full rounded-lg border px-3 py-3 text-left transition-colors',
        isSelected
          ? 'border-primary/40 bg-primary/10'
          : 'border-border/60 bg-card hover:bg-muted/40'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{binding.name}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {binding.profile} · {binding.host}
          </div>
        </div>
        <Badge variant="outline" className="shrink-0">
          {binding.usesDefaultIdeSettingsPath ? 'Default path' : 'Custom path'}
        </Badge>
      </div>
    </button>
  );
}
