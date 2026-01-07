/**
 * CLIProxy Header Component
 * Fixed header with OAuth login buttons, status indicator, and refresh
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
import { useCliproxyAuth } from '@/hooks/use-cliproxy';
import { useCliproxyAuthFlow } from '@/hooks/use-cliproxy-auth-flow';
import { cn } from '@/lib/utils';

interface VersionInfo {
  currentVersion: string;
  isStable: boolean;
  stabilityMessage?: string;
}

interface LoginButtonProps {
  provider: string;
  displayName: string;
  isAuthenticated: boolean;
  accountCount: number;
  isAuthenticating: boolean;
  onLogin: () => void;
}

function LoginButton({
  displayName,
  isAuthenticated,
  accountCount,
  isAuthenticating,
  onLogin,
}: LoginButtonProps) {
  if (isAuthenticating) {
    return (
      <Button variant="outline" size="sm" disabled className="gap-2">
        <Loader2 className="w-3 h-3 animate-spin" />
        {displayName}
      </Button>
    );
  }

  if (isAuthenticated) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-2 border-green-500/30 text-green-600 dark:text-green-400"
      >
        <span className="w-2 h-2 rounded-full bg-green-500" />
        {displayName}
        {accountCount > 1 && (
          <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
            {accountCount}
          </Badge>
        )}
      </Button>
    );
  }

  return (
    <Button variant="default" size="sm" className="gap-2" onClick={onLogin}>
      + {displayName}
    </Button>
  );
}

// Helper to format relative time
function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1m ago';
  return `${minutes}m ago`;
}

// Hook for relative time display that updates periodically
function useRelativeTime(date: Date | undefined): string | null {
  const [text, setText] = useState<string | null>(() => (date ? formatRelativeTime(date) : null));

  useEffect(() => {
    if (!date) return;

    // Update every 30 seconds via interval only
    const interval = setInterval(() => {
      setText(formatRelativeTime(date));
    }, 30000);

    return () => clearInterval(interval);
  }, [date]);

  // Compute current value on each render if date changes
  // This is the pure computation part
  const currentText = date ? formatRelativeTime(date) : null;

  // Return the more recent of computed or state-based value
  // State value will be updated by interval
  return date ? currentText : text;
}

interface CliproxyHeaderProps {
  onRefresh: () => void;
  isRefreshing: boolean;
  lastUpdated?: Date;
  isRunning?: boolean;
}

export function CliproxyHeader({
  onRefresh,
  isRefreshing,
  lastUpdated,
  isRunning = true,
}: CliproxyHeaderProps) {
  const { data: authData } = useCliproxyAuth();
  const { provider: authProvider, isAuthenticating, startAuth } = useCliproxyAuthFlow();
  const lastUpdatedText = useRelativeTime(lastUpdated);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);

  useEffect(() => {
    fetch('/api/cliproxy/update-check')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setVersionInfo({
            currentVersion: data.currentVersion,
            isStable: data.isStable,
            stabilityMessage: data.stabilityMessage,
          });
        }
      })
      .catch(() => {}); // Silently fail
  }, []);

  const providers = [
    { id: 'claude', displayName: 'Claude' },
    { id: 'gemini', displayName: 'Gemini' },
    { id: 'codex', displayName: 'Codex' },
    { id: 'agy', displayName: 'Agy' },
    { id: 'qwen', displayName: 'Qwen' },
    { id: 'iflow', displayName: 'iFlow' },
    { id: 'kiro', displayName: 'Kiro' },
    { id: 'ghcp', displayName: 'GitHub Copilot' },
  ];

  const getProviderStatus = (providerId: string) => {
    const status = authData?.authStatus.find((s) => s.provider === providerId);
    return {
      isAuthenticated: status?.authenticated ?? false,
      accountCount: status?.accounts?.length ?? 0,
    };
  };

  return (
    <div className="flex flex-col gap-4 pb-4 border-b">
      {/* Top row: Title and Login Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">CLIProxy Plus</h1>
          <p className="text-sm text-muted-foreground mt-1">CCS-level account management</p>
        </div>

        {/* Login Buttons - Wrap on mobile */}
        <div className="flex flex-wrap items-center gap-2">
          {providers.map((p) => {
            const status = getProviderStatus(p.id);
            return (
              <LoginButton
                key={p.id}
                provider={p.id}
                displayName={p.displayName}
                isAuthenticated={status.isAuthenticated}
                accountCount={status.accountCount}
                isAuthenticating={authProvider === p.id && isAuthenticating}
                onLogin={() => startAuth(p.id)}
              />
            );
          })}
        </div>
      </div>

      {/* Bottom row: Status and Refresh */}
      <div className="flex items-center gap-3">
        <Badge variant={isRunning ? 'default' : 'secondary'} className="gap-1.5">
          <span
            className={cn(
              'w-2 h-2 rounded-full',
              isRunning ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'
            )}
          />
          {isRunning ? 'Running' : 'Offline'}
        </Badge>

        {versionInfo && (
          <Badge
            variant={versionInfo.isStable ? 'secondary' : 'destructive'}
            className={cn(
              'gap-1.5',
              !versionInfo.isStable &&
                'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30'
            )}
            title={versionInfo.stabilityMessage}
          >
            {!versionInfo.isStable && <AlertTriangle className="w-3 h-3" />}v
            {versionInfo.currentVersion}
          </Badge>
        )}

        {lastUpdatedText && (
          <span className="text-xs text-muted-foreground">{lastUpdatedText}</span>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
        </Button>
      </div>
    </div>
  );
}
