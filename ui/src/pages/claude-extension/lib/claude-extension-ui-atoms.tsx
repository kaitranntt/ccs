/**
 * Shared UI primitives for the Claude Extension page.
 *
 * Extracted from the monolith to be reused across section files without
 * creating circular dependencies. All are pure presentational components.
 */
import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import { cn } from '@/lib/utils';
import type { ClaudeExtensionFileState } from '@/hooks/use-claude-extension';

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------

/**
 * Colored badge for the four Claude Extension file states.
 */
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

// ---------------------------------------------------------------------------
// DetailRow
// ---------------------------------------------------------------------------

/** Insert zero-width spaces after path separators for better wrapping. */
function formatPathForDisplay(value: string): string {
  return value.replace(/[\\/]/g, '$&​');
}

/**
 * Two-column label/value row. When `copyValue` is provided the value is
 * rendered as a monospace block with a copy button (path row variant).
 */
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

// ---------------------------------------------------------------------------
// CodeBlockCard
// ---------------------------------------------------------------------------

/**
 * Card wrapping a scrollable `<pre>` code block. Copy button in header.
 */
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

// ---------------------------------------------------------------------------
// ErrorBanner
// ---------------------------------------------------------------------------

/**
 * Full-width destructive card shown when any query in the page errors.
 */
export function ErrorBanner({ error }: { error: Error }) {
  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardContent className="flex items-start gap-3 pt-6 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>{error.message}</div>
      </CardContent>
    </Card>
  );
}
