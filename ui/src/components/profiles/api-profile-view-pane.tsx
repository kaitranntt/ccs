/**
 * ApiProfileViewPane
 * Form slot of the API Profiles page (ConfigLayout `form` slot).
 *
 * Renders one of:
 * - Profile action bar + ProfileEditor (when a profile is selected)
 * - OpenRouterQuickStart empty state (when no profile is selected)
 *
 * NOTE: No FormPane wrapper — ProfileEditor owns its internal scroll.
 * Wrapping in FormPane would create a double-scroll (copilot lesson, PR #1093).
 */

import { Button } from '@/components/ui/button';
import { Copy, Download } from 'lucide-react';
import { ProfileEditor } from '@/components/profile-editor';
import { OpenRouterQuickStart } from '@/components/profiles/openrouter-quick-start';
import type { CliTarget } from '@/lib/api-client';
import type { ProviderPreset } from '@/lib/provider-presets';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ApiProfileViewPaneProps {
  /** Currently selected profile name, or null when nothing is selected. */
  selectedProfileName: string | null;
  /** Target of the selected profile (e.g. 'claude', 'droid', 'codex'). */
  selectedProfileTarget: CliTarget | undefined;
  /** Total number of profiles (drives empty-state messaging). */
  profileCount: number;
  /** Whether the copy mutation is in flight. */
  isCopyPending: boolean;
  /** Whether the export mutation is in flight. */
  isExportPending: boolean;
  /** Called when user requests copying the selected profile. */
  onCopyProfile: () => void;
  /** Called when user requests exporting the selected profile. */
  onExportProfile: () => void;
  /** Called when user requests deleting the selected profile. */
  onDeleteProfile: () => void;
  /** Propagates unsaved-changes flag from ProfileEditor up to page state. */
  onHasChangesUpdate: (hasChanges: boolean) => void;
  /** Navigate to CLIProxy AI providers page. */
  onCliproxyClick: () => void;
  /** Open create dialog pre-set to OpenRouter mode. */
  onOpenRouterClick: () => void;
  /** Open create dialog pre-set to Alibaba Coding Plan mode. */
  onAlibabaCodingPlanClick: () => void;
  /** Open create dialog pre-set to Ollama mode. */
  onOllamaClick: () => void;
  /** Open create dialog pre-set to llama.cpp mode. */
  onLlamacppClick: () => void;
  /** Open create dialog in custom / normal mode. */
  onCustomClick: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ApiProfileViewPane({
  selectedProfileName,
  selectedProfileTarget,
  profileCount,
  isCopyPending,
  isExportPending,
  onCopyProfile,
  onExportProfile,
  onDeleteProfile,
  onHasChangesUpdate,
  onCliproxyClick,
  onOpenRouterClick,
  onAlibabaCodingPlanClick,
  onOllamaClick,
  onLlamacppClick,
  onCustomClick,
}: ApiProfileViewPaneProps) {
  if (selectedProfileName) {
    return (
      // Outer wrapper fills ConfigLayout's form slot height.
      // ProfileEditor itself handles scrolling — no FormPane wrapper here.
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {/* Secondary action bar pinned above the editor */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-b bg-background px-4 py-2">
          <Button size="sm" variant="outline" onClick={onCopyProfile} disabled={isCopyPending}>
            <Copy className="mr-1 h-4 w-4" />
            Copy
          </Button>
          <Button size="sm" variant="outline" onClick={onExportProfile} disabled={isExportPending}>
            <Download className="mr-1 h-4 w-4" />
            Export
          </Button>
        </div>

        {/* Profile editor — owns its own scroll via internal ScrollArea */}
        <ProfileEditor
          key={selectedProfileName}
          profileName={selectedProfileName}
          profileTarget={selectedProfileTarget}
          onDelete={onDeleteProfile}
          onHasChangesUpdate={onHasChangesUpdate}
        />
      </div>
    );
  }

  return (
    <OpenRouterQuickStart
      hasProfiles={profileCount > 0}
      profileCount={profileCount}
      onCliproxyClick={onCliproxyClick}
      onOpenRouterClick={onOpenRouterClick}
      onAlibabaCodingPlanClick={onAlibabaCodingPlanClick}
      onOllamaClick={onOllamaClick}
      onLlamacppClick={onLlamacppClick}
      onCustomClick={onCustomClick}
    />
  );
}

// Re-export ProviderPreset id type used by parent for createMode state
export type { ProviderPreset };
