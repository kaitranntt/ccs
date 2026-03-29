import { Route } from 'lucide-react';
import { CodexFeaturesCard } from '@/components/compatible-cli/codex-features-card';
import { CodexMcpServersCard } from '@/components/compatible-cli/codex-mcp-servers-card';
import { CodexModelProvidersCard } from '@/components/compatible-cli/codex-model-providers-card';
import { CodexProfilesCard } from '@/components/compatible-cli/codex-profiles-card';
import { CodexProjectTrustCard } from '@/components/compatible-cli/codex-project-trust-card';
import { CodexTopLevelControlsCard } from '@/components/compatible-cli/codex-top-level-controls-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import type {
  CodexConfigPatchInput,
  CodexProfilePatchValues,
  CodexTopLevelSettingsPatch,
} from '@/hooks/use-codex-types';
import type {
  CodexFeatureCatalogEntry,
  CodexMcpServerEntry,
  CodexModelProviderEntry,
  CodexProfileEntry,
  CodexProjectTrustEntry,
  CodexTopLevelSettingsView,
} from '@/lib/codex-config';

interface CodexControlCenterTabProps {
  workspacePath: string;
  activeProfile: string | null;
  topLevelSettings: CodexTopLevelSettingsView;
  projectTrustEntries: CodexProjectTrustEntry[];
  profileEntries: CodexProfileEntry[];
  modelProviderEntries: CodexModelProviderEntry[];
  mcpServerEntries: CodexMcpServerEntry[];
  featureCatalog: CodexFeatureCatalogEntry[];
  featureState: Record<string, boolean | null>;
  disabled: boolean;
  disabledReason: string | null;
  saving: boolean;
  onPatch: (patch: CodexConfigPatchInput, successMessage: string) => Promise<void>;
}

export function CodexControlCenterTab({
  workspacePath,
  activeProfile,
  topLevelSettings,
  projectTrustEntries,
  profileEntries,
  modelProviderEntries,
  mcpServerEntries,
  featureCatalog,
  featureState,
  disabled,
  disabledReason,
  saving,
  onPatch,
}: CodexControlCenterTabProps) {
  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 pr-1">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Route className="h-4 w-4" />
              Structured controls boundary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Guided controls write only the user-layer <code>config.toml</code>. They do not model
              the full effective Codex runtime once trusted repo layers and CCS transient{' '}
              <code>-c</code> overrides are involved.
            </p>
            <p>
              Structured saves normalize TOML formatting and strip comments. Use the raw editor on
              the right when exact layout matters.
            </p>
          </CardContent>
        </Card>

        <CodexTopLevelControlsCard
          values={topLevelSettings}
          providerNames={modelProviderEntries.map((entry) => entry.name)}
          disabled={disabled}
          disabledReason={disabledReason}
          saving={saving}
          onSave={(values: CodexTopLevelSettingsPatch) =>
            onPatch({ kind: 'top-level', values }, 'Saved top-level Codex settings.')
          }
        />

        <CodexProjectTrustCard
          workspacePath={workspacePath}
          entries={projectTrustEntries}
          disabled={disabled}
          disabledReason={disabledReason}
          saving={saving}
          onSave={(projectPath, trustLevel) =>
            onPatch(
              { kind: 'project-trust', path: projectPath, trustLevel },
              trustLevel ? 'Saved project trust entry.' : 'Removed project trust entry.'
            )
          }
        />

        <CodexProfilesCard
          activeProfile={activeProfile}
          entries={profileEntries}
          providerNames={modelProviderEntries.map((entry) => entry.name)}
          disabled={disabled}
          disabledReason={disabledReason}
          saving={saving}
          onSave={(name, values: CodexProfilePatchValues, setAsActive) =>
            onPatch(
              { kind: 'profile', action: 'upsert', name, values, setAsActive },
              'Saved profile.'
            )
          }
          onDelete={(name) =>
            onPatch({ kind: 'profile', action: 'delete', name }, 'Deleted profile.')
          }
          onSetActive={(name) =>
            onPatch({ kind: 'profile', action: 'set-active', name }, 'Set active profile.')
          }
        />

        <CodexModelProvidersCard
          entries={modelProviderEntries}
          disabled={disabled}
          disabledReason={disabledReason}
          saving={saving}
          onSave={(name, values) =>
            onPatch(
              { kind: 'model-provider', action: 'upsert', name, values },
              'Saved model provider.'
            )
          }
          onDelete={(name) =>
            onPatch({ kind: 'model-provider', action: 'delete', name }, 'Deleted model provider.')
          }
        />

        <CodexMcpServersCard
          entries={mcpServerEntries}
          disabled={disabled}
          disabledReason={disabledReason}
          saving={saving}
          onSave={(name, values) =>
            onPatch({ kind: 'mcp-server', action: 'upsert', name, values }, 'Saved MCP server.')
          }
          onDelete={(name) =>
            onPatch({ kind: 'mcp-server', action: 'delete', name }, 'Deleted MCP server.')
          }
        />

        <CodexFeaturesCard
          catalog={featureCatalog}
          state={featureState}
          disabled={disabled}
          disabledReason={disabledReason}
          onToggle={(feature, enabled) =>
            onPatch({ kind: 'feature', feature, enabled }, 'Saved feature toggle.')
          }
        />
      </div>
    </ScrollArea>
  );
}
