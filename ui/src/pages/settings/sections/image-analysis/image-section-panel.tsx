import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { SectionTone } from './utils';

interface ImageSectionPanelProps {
  tone?: SectionTone;
  eyebrow?: string;
  title: string;
  description: string;
  icon: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function ImageSectionPanel({
  title,
  description,
  icon,
  meta,
  action,
  children,
  className,
}: ImageSectionPanelProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border bg-gradient-to-br from-background via-background to-muted/25 p-4 shadow-sm',
        className
      )}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-primary/40 via-primary/10 to-transparent" />
      <div className="relative space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              {icon}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold tracking-tight">{title}</h3>
                {meta}
              </div>
              <p className="mt-0.5 text-sm leading-5 text-muted-foreground">{description}</p>
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
        <div className="space-y-3">{children}</div>
      </div>
    </div>
  );
}
