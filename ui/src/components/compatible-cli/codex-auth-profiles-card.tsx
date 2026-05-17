/**
 * Read-only dashboard card displaying codex-auth profile state.
 *
 * Distinct from codex-profiles-card.tsx (which edits config.toml [profiles]).
 * This card shows CCS-side shell profiles: active account, email, plan tier,
 * last-used timestamp, and auth validity.
 *
 * All mutating actions (switch, remove) are disabled with a terminal redirect
 * tooltip per the read-only dashboard spec (D5).
 */

import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { Trans, useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useCodexAuthProfiles } from '@/hooks/use-codex-auth-profiles';
import type { CodexAuthProfileEntry } from '@/hooks/use-codex-auth-profiles';

// ── Helpers ─────────────────────────────────────────────────────────────────

function InlineCode({ children }: { children?: ReactNode }) {
  return (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">
      {children}
    </code>
  );
}

function formatLastUsed(iso: string | null): string {
  if (!iso) return 'never';
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 2) return 'just now';
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD === 1) return 'yesterday';
    return `${diffD}d ago`;
  } catch {
    return iso;
  }
}

function sourceLabel(source: 'default' | 'env' | 'explicit-codex-home', t: TFunction): string {
  switch (source) {
    case 'default':
      return t('codex.auth.sourceDefault');
    case 'env':
      return t('codex.auth.sourceEnv');
    case 'explicit-codex-home':
      return t('codex.auth.sourceExplicitCodexHome');
  }
}

// ── Disabled action button with terminal-redirect tooltip ───────────────────

function TerminalOnlyButton({ label }: { label: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* span wrapper needed — disabled buttons don't trigger mouse events */}
          <span tabIndex={0} className="inline-block">
            <Button variant="outline" size="sm" disabled className="pointer-events-none">
              {label}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <Trans
            i18nKey="codex.auth.terminalOnlyTooltipRich"
            components={{ code: <InlineCode /> }}
          />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Profile table row ────────────────────────────────────────────────────────

function ProfileRow({
  entry,
  isActive,
  activeSource,
}: {
  entry: CodexAuthProfileEntry;
  isActive: boolean;
  activeSource?: 'default' | 'env' | 'explicit-codex-home';
}) {
  const { t } = useTranslation();

  return (
    <TableRow className={isActive ? 'bg-muted/40' : undefined}>
      <TableCell className="font-medium">
        <span className="flex items-center gap-2">
          {entry.name}
          {isActive && activeSource && (
            <Badge variant="secondary" className="text-xs">
              {t('codex.auth.activeSourceBadge', { source: sourceLabel(activeSource, t) })}
            </Badge>
          )}
        </span>
      </TableCell>
      <TableCell>{entry.email ?? '—'}</TableCell>
      <TableCell>{entry.plan ?? '—'}</TableCell>
      <TableCell>{formatLastUsed(entry.lastUsed)}</TableCell>
      <TableCell>
        {entry.authValid ? (
          <Badge variant="secondary" className="text-xs text-green-700 dark:text-green-400">
            {t('codex.auth.statusOk')}
          </Badge>
        ) : (
          <Badge variant="destructive" className="text-xs">
            {t('codex.auth.statusInvalid')}
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <span className="flex gap-1">
          <TerminalOnlyButton label={t('codex.auth.switchAction')} />
          <TerminalOnlyButton label={t('codex.auth.removeAction')} />
        </span>
      </TableCell>
    </TableRow>
  );
}

// ── Main card ────────────────────────────────────────────────────────────────

export function CodexAuthProfilesCard() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useCodexAuthProfiles();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('codex.auth.loading')}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {t('codex.auth.loadError')}
      </div>
    );
  }

  // Empty registry — no profiles at all
  if (data.profiles.length === 0) {
    return (
      <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground space-y-1">
        <p>
          <Trans i18nKey="codex.auth.emptyRegistryRich" components={{ code: <InlineCode /> }} />
        </p>
        <p>
          <Trans i18nKey="codex.auth.legacyCodexHomeRich" components={{ code: <InlineCode /> }} />
        </p>
      </div>
    );
  }

  // Legacy mode — profiles exist but none active
  if (!data.active) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <Trans i18nKey="codex.auth.legacyModeRich" components={{ code: <InlineCode /> }} />
        </div>
        <ProfileTable data={data} />
      </div>
    );
  }

  // External CODEX_HOME with no registry match
  if (data.active.source === 'explicit-codex-home' && data.active.name === null) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <Trans
            i18nKey="codex.auth.externalCodexHomeRich"
            values={{ path: data.active.codexHome }}
            components={{ code: <InlineCode /> }}
          />
        </div>
        <ProfileTable data={data} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ActiveBanner name={data.active.name} source={data.active.source} profiles={data.profiles} />
      <ProfileTable data={data} />
    </div>
  );
}

// ── Active profile highlight banner ─────────────────────────────────────────

function ActiveBanner({
  name,
  source,
  profiles,
}: {
  name: string | null;
  source: 'default' | 'env' | 'explicit-codex-home';
  profiles: CodexAuthProfileEntry[];
}) {
  const { t } = useTranslation();
  const activeEntry = profiles.find((p) => p.name === name);

  return (
    <div className="rounded-md border bg-muted/20 px-4 py-3 text-sm space-y-1">
      <div className="flex items-center gap-2 font-medium">
        {t('codex.auth.activeProfile')}
        <span>{name ?? t('codex.auth.unknownProfile')}</span>
        <Badge variant="secondary" className="text-xs">
          {sourceLabel(source, t)}
        </Badge>
      </div>
      {activeEntry && (
        <div className="text-muted-foreground text-xs space-x-3">
          {activeEntry.email && <span>{activeEntry.email}</span>}
          {activeEntry.plan && (
            <span>
              {t('codex.auth.planLabel')} <strong>{activeEntry.plan}</strong>
            </span>
          )}
          {!activeEntry.authValid && (
            <span className="text-destructive">{t('codex.auth.statusInvalid')}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Profile table ────────────────────────────────────────────────────────────

function ProfileTable({
  data,
}: {
  data: {
    active: { name: string | null; source: 'default' | 'env' | 'explicit-codex-home' } | null;
    profiles: CodexAuthProfileEntry[];
  };
}) {
  const { t } = useTranslation();

  return (
    <div className="rounded-md border overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('codex.auth.col.name')}</TableHead>
            <TableHead>{t('codex.auth.col.email')}</TableHead>
            <TableHead>{t('codex.auth.col.plan')}</TableHead>
            <TableHead>{t('codex.auth.col.lastUsed')}</TableHead>
            <TableHead>{t('codex.auth.col.status')}</TableHead>
            <TableHead>{t('codex.auth.col.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.profiles.map((entry) => (
            <ProfileRow
              key={entry.name}
              entry={entry}
              isActive={data.active?.name === entry.name}
              activeSource={data.active?.name === entry.name ? data.active.source : undefined}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
