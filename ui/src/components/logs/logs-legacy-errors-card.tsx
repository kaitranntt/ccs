/**
 * logs-legacy-errors-card.tsx
 *
 * "Legacy Errors" tab content — wraps ErrorLogsMonitor with a descriptive
 * card header explaining its purpose (historical CLIProxy failure analysis).
 *
 * Extracted from logs.tsx to keep the page under 300 LOC.
 */
import { ScrollText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { ErrorLogsMonitor } from '@/components/error-logs-monitor';

export function LogsLegacyErrorsCard() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Intro card */}
      <div className="relative overflow-hidden rounded-[2.5rem] border-2 border-border bg-card/40 p-1.5 shadow-2xl shadow-black/10">
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none [background-image:radial-gradient(circle_at_center,var(--primary)_1px,transparent_0)] [background-size:24px_24px]" />

        <Card className="rounded-[calc(2.5rem-0.375rem)] border-none bg-background/60 shadow-none overflow-hidden backdrop-blur-md">
          <CardContent className="flex flex-col gap-6 p-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-primary/20 bg-primary/10 text-primary shadow-inner">
                  <ScrollText className="h-5 w-5" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">
                    Legacy Diagnostic Node
                  </p>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">
                    CCS-MATRIX-FAILURE-MONITOR
                  </p>
                </div>
              </div>
              <div className="rounded-full border border-border bg-background/50 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-foreground/40 shadow-inner">
                Mode: Historical
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-3xl font-black uppercase tracking-tighter text-foreground">
                CLIProxy Failure Analysis
              </h2>
              <p className="max-w-3xl text-[15px] font-medium leading-relaxed text-muted-foreground/60">
                Maintain oversight of legacy request failures while the unified stream consolidates
                system-wide telemetry. This view provides direct access to the historical failure
                matrix for deep-field debugging.
              </p>
            </div>

            <div className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent opacity-40" />
          </CardContent>
        </Card>
      </div>

      {/* Live monitor */}
      <div className="rounded-[2.5rem] border-2 border-border bg-muted/5 p-8 shadow-inner backdrop-blur-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-foreground/40">
            Realtime Monitoring Deck
          </span>
        </div>
        <ErrorLogsMonitor />
      </div>
    </div>
  );
}
