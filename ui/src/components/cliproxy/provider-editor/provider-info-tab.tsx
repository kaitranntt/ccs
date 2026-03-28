/**
 * Provider Info Tab
 * Displays provider information and quick usage commands
 */

import { Badge } from '@/components/ui/badge';
import { CopyButton } from '@/components/ui/copy-button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Info, Shield } from 'lucide-react';
import { UsageCommand } from './usage-command';
import type { SettingsResponse } from './types';
import type { AuthStatus, CliTarget } from '@/lib/api-client';

interface ProviderInfoTabProps {
  provider: string;
  displayName: string;
  defaultTarget?: CliTarget;
  data?: SettingsResponse;
  authStatus: AuthStatus;
}

export function ProviderInfoTab({
  provider,
  displayName,
  defaultTarget,
  data,
  authStatus,
}: ProviderInfoTabProps) {
  const resolvedTarget = defaultTarget || 'claude';
  const isDroidTarget = resolvedTarget === 'droid';
  const isCodexProvider = provider === 'codex';

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6">
        {/* Provider Information */}
        <div>
          <h3 className="text-sm font-medium flex items-center gap-2 mb-3">
            <Info className="w-4 h-4" />
            Provider Information
          </h3>
          <div className="space-y-3 bg-card rounded-lg border p-4 shadow-sm">
            <div className="grid grid-cols-[100px_1fr] gap-2 text-sm items-center">
              <span className="font-medium text-muted-foreground">Provider</span>
              <span className="font-mono">{displayName}</span>
            </div>
            {data && (
              <>
                <div className="grid grid-cols-[100px_1fr] gap-2 text-sm items-center">
                  <span className="font-medium text-muted-foreground">File Path</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <code className="bg-muted px-1.5 py-0.5 rounded text-xs break-all">
                      {data.path}
                    </code>
                    <CopyButton value={data.path} size="icon" className="h-5 w-5" />
                  </div>
                </div>
                <div className="grid grid-cols-[100px_1fr] gap-2 text-sm items-center">
                  <span className="font-medium text-muted-foreground">Last Modified</span>
                  <span className="text-xs">{new Date(data.mtime).toLocaleString()}</span>
                </div>
              </>
            )}
            <div className="grid grid-cols-[100px_1fr] gap-2 text-sm items-center">
              <span className="font-medium text-muted-foreground">Status</span>
              {authStatus.authenticated ? (
                <Badge
                  variant="outline"
                  className="w-fit text-green-600 border-green-200 bg-green-50"
                >
                  <Shield className="w-3 h-3 mr-1" />
                  Authenticated
                </Badge>
              ) : (
                <Badge variant="outline" className="w-fit text-muted-foreground">
                  Not connected
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-2 text-sm items-center">
              <span className="font-medium text-muted-foreground">Default Target</span>
              <span className="font-mono">{resolvedTarget}</span>
            </div>
          </div>
        </div>

        {/* Quick Usage */}
        <div>
          <h3 className="text-sm font-medium mb-3">Quick Usage</h3>
          <div className="space-y-3 bg-card rounded-lg border p-4 shadow-sm">
            <UsageCommand label="Run with prompt" command={`ccs ${provider} "your prompt"`} />
            {isCodexProvider && (
              <>
                <UsageCommand
                  label="Run on native Codex (--target)"
                  command={`ccs ${provider} --target codex "your prompt"`}
                />
                <UsageCommand
                  label="Codex alias (explicit)"
                  command={`ccs-codex ${provider} "your prompt"`}
                />
                <UsageCommand
                  label="Codex alias (short)"
                  command={`ccsx ${provider} "your prompt"`}
                />
              </>
            )}
            <UsageCommand
              label={isDroidTarget ? 'Droid alias (explicit)' : 'Run on Droid'}
              command={`ccs-droid ${provider} "your prompt"`}
            />
            <UsageCommand
              label={isDroidTarget ? 'Override to Claude' : 'Run on Droid (--target)'}
              command={`ccs ${provider} --target ${isDroidTarget ? 'claude' : 'droid'} "your prompt"`}
            />
            <UsageCommand label="Change model" command={`ccs ${provider} --config`} />
            <UsageCommand label="Add account" command={`ccs ${provider} --add`} />
            <UsageCommand label="List accounts" command={`ccs ${provider} --accounts`} />
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
