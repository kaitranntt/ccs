/**
 * Profile-Scoped Empty Banner
 *
 * Rendered above the analytics summary cards when the user picked a specific
 * profile but the profile-scoped query returned zero totals. Explains why the
 * cards look empty and offers a one-click switch back to "All profiles".
 */

import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProfileScopedEmptyBannerProps {
  selectedProfileLabel: string;
  onShowAll: () => void;
}

export function ProfileScopedEmptyBanner({
  selectedProfileLabel,
  onShowAll,
}: ProfileScopedEmptyBannerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="profile-scoped-empty-banner"
      className="flex flex-col gap-3 rounded-md border border-border bg-muted/40 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex gap-3">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-medium">No usage recorded for "{selectedProfileLabel}".</p>
          <p className="text-muted-foreground">
            Traffic from CLIProxy and native runtimes isn't tagged per profile yet — it only appears
            under <span className="font-medium">All profiles</span>.
          </p>
        </div>
      </div>
      <Button
        size="sm"
        variant="default"
        onClick={onShowAll}
        className="self-start sm:self-auto"
        data-testid="profile-scoped-empty-banner-show-all"
      >
        Show All profiles
      </Button>
    </div>
  );
}
