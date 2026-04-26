/**
 * Small shared primitives used across entry editor sections.
 * Kept co-located with the page — not promoted to shared components yet (YAGNI).
 */

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// SummaryCard
// ---------------------------------------------------------------------------

export function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 break-all text-sm font-medium leading-5">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EntrySecretBadge
// ---------------------------------------------------------------------------

export function EntrySecretBadge({ configured }: { configured: boolean }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        'border-transparent text-[10px]',
        configured
          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-50'
          : 'bg-muted text-muted-foreground hover:bg-muted'
      )}
    >
      {configured ? 'Configured' : 'Missing secret'}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// EntryEditorField — label + optional helper text wrapper
// ---------------------------------------------------------------------------

export function EntryEditorField({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {children}
      {helper ? <div className="text-xs leading-5 text-muted-foreground">{helper}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EntryEditorTextArea — styled textarea
// ---------------------------------------------------------------------------

export function EntryEditorTextArea({
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
    />
  );
}

// ---------------------------------------------------------------------------
// SetupStepSection — numbered step list with badge
// ---------------------------------------------------------------------------

export function SetupStepSection({
  badge,
  title,
  items,
}: {
  badge: string;
  title: string;
  items: string[];
}) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="text-[11px]">
          {badge}
        </Badge>
        <div className="text-sm font-medium">{title}</div>
      </div>
      <div className="mt-4 space-y-3">
        {items.map((item, index) => (
          <div
            key={`${title}:${item}`}
            className="flex items-start gap-3 rounded-lg border bg-muted/10 px-3 py-3"
          >
            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border bg-background text-[11px] font-semibold text-muted-foreground">
              {index + 1}
            </div>
            <div className="text-sm leading-6 text-muted-foreground">{item}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
