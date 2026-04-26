/**
 * Provider Empty State — shown when a family has no entries yet.
 * Includes setup guidance, profile boundary info, and route summary.
 */

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, KeyRound, Route, ShieldCheck, Workflow } from 'lucide-react';
import { Plus } from 'lucide-react';
import type { AiProviderFamilyState } from '../../../../../src/cliproxy/ai-providers';
import { getFamilyGuide } from '../lib/ai-provider-utils';
import { SetupStepSection } from './provider-entry-primitives';

interface ProviderEmptyStateProps {
  family: AiProviderFamilyState;
  onAddEntry: () => void;
  onOpenControlPanel: () => void;
  onOpenProfiles: () => void;
}

export function ProviderEmptyState({
  family,
  onAddEntry,
  onOpenControlPanel,
  onOpenProfiles,
}: ProviderEmptyStateProps) {
  const guide = getFamilyGuide(family);
  const addLabel = family.supportsNamedEntries
    ? 'Create connector'
    : `Add ${family.displayName} entry`;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Main setup card */}
        <div className="rounded-xl border bg-card">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <KeyRound className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Set up {family.displayName}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Start with the smallest working setup. Add routing rules only after the route is
                  already working.
                </p>
              </div>
            </div>
            <Button type="button" onClick={onAddEntry}>
              <Plus className="mr-1 h-4 w-4" />
              {addLabel}
            </Button>
          </div>

          <div className="space-y-4 p-5">
            <div className="rounded-xl border bg-muted/10 p-4">
              <div className="text-sm font-medium">Recommended setup flow</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Finish the left section first. Treat the right section as optional follow-up.
              </div>
              <div className="mt-4 space-y-4">
                <SetupStepSection
                  badge="Do this first"
                  title="Minimum working setup"
                  items={guide.requiredNow}
                />
                <SetupStepSection
                  badge="Only if needed"
                  title="Optional later"
                  items={guide.optionalLater}
                />
              </div>
            </div>

            <div className="rounded-xl border bg-muted/15 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Need the other pages?
              </div>
              <div className="mt-2 text-sm leading-6 text-muted-foreground">
                Use Overview or Control Panel for OAuth sign-ins. Use API Profiles only for
                CCS-native Anthropic-compatible profiles and presets.
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={onOpenControlPanel}>
                  Control Panel
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={onOpenProfiles}>
                  API Profiles
                  <ExternalLink className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Side info cards */}
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Route className="h-4 w-4 text-primary" />
              What this route does
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline" className="font-mono text-[11px]">
                {family.routePath}
              </Badge>
              <Badge variant="outline" className="uppercase text-[11px]">
                {family.authMode}
              </Badge>
            </div>
            <div className="mt-4 space-y-3">
              {guide.emptyStateSummary.map((item) => (
                <div
                  key={item}
                  className="rounded-lg border bg-muted/10 p-4 text-sm leading-6 text-muted-foreground"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Workflow className="h-4 w-4 text-primary" />
              When API Profiles is the better fit
            </div>
            <div className="mt-3 text-sm leading-6 text-muted-foreground">
              {guide.profileBoundary}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
