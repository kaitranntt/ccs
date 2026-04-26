/**
 * ApiProfileListPane
 * Left rail of the API Profiles page (ConfigLayout `left` slot).
 *
 * Contains:
 * - Toolbar: title, discover-orphans, import, and "New" actions
 * - Search input
 * - Scrollable profile list (loading / error / empty / populated states)
 * - Profile count summary footer
 * - OpenRouter and Alibaba promo cards
 */

import { type ChangeEvent, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  Search,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileJson,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { OpenRouterBanner } from '@/components/profiles/openrouter-banner';
import { OpenRouterPromoCard } from '@/components/profiles/openrouter-promo-card';
import { AlibabaCodingPlanPromoCard } from '@/components/profiles/alibaba-coding-plan-promo-card';
import { CopyButton } from '@/components/ui/copy-button';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import type { Profile } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ApiProfileListPaneProps {
  profiles: Profile[];
  filteredProfiles: Profile[];
  isLoading: boolean;
  isError: boolean;
  searchQuery: string;
  selectedProfile: string | null;
  isDiscoverPending: boolean;
  isRegisterPending: boolean;
  isImportPending: boolean;
  importFileInputRef: React.RefObject<HTMLInputElement | null>;
  onSearchChange: (v: string) => void;
  onProfileSelect: (name: string) => void;
  onDeleteRequest: (name: string) => void;
  onDiscoverOrphans: () => void;
  onImportClick: () => void;
  onImportFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onCreateClick: () => void;
  onCreateOpenRouter: () => void;
  onCreateAlibaba: () => void;
  onRetry: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ApiProfileListPane({
  profiles,
  filteredProfiles,
  isLoading,
  isError,
  searchQuery,
  selectedProfile,
  isDiscoverPending,
  isRegisterPending,
  isImportPending,
  importFileInputRef,
  onSearchChange,
  onProfileSelect,
  onDeleteRequest,
  onDiscoverOrphans,
  onImportClick,
  onImportFileChange,
  onCreateClick,
  onCreateOpenRouter,
  onCreateAlibaba,
  onRetry,
}: ApiProfileListPaneProps) {
  const { t } = useTranslation();

  // Memoised banner visibility — only show when no profiles exist
  const showBanner = useMemo(() => profiles.length === 0, [profiles.length]);

  return (
    <div className="flex h-full flex-col">
      {/* OpenRouter banner (only when profile list is empty) */}
      {showBanner && <OpenRouterBanner onCreateClick={onCreateClick} />}

      {/* Toolbar */}
      <div className="shrink-0 border-b bg-background/80 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t('apiProfiles.sidebarSubtitle')}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={onDiscoverOrphans}
              disabled={isDiscoverPending || isRegisterPending}
              aria-label={t('apiProfiles.discoverOrphans')}
              title={t('apiProfiles.discoverOrphans')}
            >
              <RefreshCw className={cn('h-4 w-4', isDiscoverPending && 'animate-spin')} />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onImportClick}
              disabled={isImportPending}
              aria-label={t('apiProfiles.importProfileBundle')}
              title={t('apiProfiles.importProfileBundle')}
            >
              <Upload className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={onCreateClick}>
              <Plus className="mr-1 h-4 w-4" />
              {t('apiProfiles.new')}
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('apiProfiles.searchPlaceholder')}
            className="h-9 pl-8"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>

      {/* Profile list */}
      <ScrollArea className="min-h-0 flex-1">
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">
            {t('apiProfiles.loadingProfiles')}
          </div>
        ) : isError ? (
          <div className="p-4 text-center">
            <div className="space-y-3 py-8">
              <AlertCircle className="mx-auto h-12 w-12 text-destructive/50" />
              <div>
                <p className="text-sm font-medium">{t('apiProfiles.failedLoadTitle')}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('apiProfiles.failedLoadDesc')}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={onRetry}>
                <RefreshCw className="mr-1 h-4 w-4" />
                {t('apiProfiles.retry')}
              </Button>
            </div>
          </div>
        ) : filteredProfiles.length === 0 ? (
          <div className="p-4 text-center">
            {profiles.length === 0 ? (
              <div className="space-y-3 py-8">
                <FileJson className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <div>
                  <p className="text-sm font-medium">{t('apiProfiles.noProfilesYet')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('apiProfiles.noProfilesDesc')}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={onCreateClick}>
                  <Plus className="mr-1 h-4 w-4" />
                  {t('apiProfiles.createProfile')}
                </Button>
              </div>
            ) : (
              <p className="py-4 text-sm text-muted-foreground">
                {t('apiProfiles.noProfileMatch', { query: searchQuery })}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {filteredProfiles.map((profile) => (
              <ApiProfileListItem
                key={profile.name}
                profile={profile}
                isSelected={selectedProfile === profile.name}
                onSelect={() => onProfileSelect(profile.name)}
                onDelete={() => onDeleteRequest(profile.name)}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Profile count footer */}
      {profiles.length > 0 && (
        <div className="shrink-0 border-t bg-background p-3 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>{t('apiProfiles.profileCount', { count: profiles.length })}</span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-green-600" />
              {t('apiProfiles.configuredCount', {
                count: profiles.filter((p) => p.configured).length,
              })}
            </span>
          </div>
        </div>
      )}

      {/* Promo cards */}
      <OpenRouterPromoCard onCreateClick={onCreateOpenRouter} />
      <AlibabaCodingPlanPromoCard onCreateClick={onCreateAlibaba} />

      {/* Hidden file input for import */}
      <input
        ref={importFileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={onImportFileChange}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProfileListItem (inlined sub-component)
// ---------------------------------------------------------------------------

interface ApiProfileListItemProps {
  profile: Profile;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function ApiProfileListItem({ profile, isSelected, onSelect, onDelete }: ApiProfileListItemProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-selected={isSelected}
      className={cn(
        'group flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2.5 transition-colors',
        isSelected ? 'border-primary/20 bg-primary/10' : 'border-transparent hover:bg-muted'
      )}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect()}
    >
      {profile.configured ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-label="Configured" />
      ) : (
        <AlertCircle className="h-4 w-4 shrink-0 text-yellow-600" aria-label="Not configured" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-sm font-medium">{profile.name}</div>
          <Badge variant="outline" className="h-4 px-1.5 text-[10px] uppercase">
            {profile.target || 'claude'}
          </Badge>
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="flex-1 truncate text-xs text-muted-foreground">
            {profile.settingsPath}
          </div>
          <CopyButton
            value={profile.settingsPath}
            size="icon"
            className="h-5 w-5 opacity-0 transition-opacity group-hover:opacity-100"
          />
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label={`Delete profile ${profile.name}`}
      >
        <Trash2 className="h-3.5 w-3.5 text-destructive" />
      </Button>
    </div>
  );
}
