import { type ReactNode, useState } from 'react';
import { parse as parseToml } from 'smol-toml';
import { toast } from 'sonner';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileWarning,
  Folder,
  GripVertical,
  Info,
  Loader2,
  Route,
  ShieldCheck,
  TerminalSquare,
  XCircle,
} from 'lucide-react';
import { useCodex } from '@/hooks/use-codex';
import { isApiConflictError } from '@/lib/api-client';
import { RawConfigEditorPanel } from '@/components/compatible-cli/raw-json-settings-editor-panel';
import { UsageCommand } from '@/components/cliproxy/provider-editor/usage-command';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const DEFAULT_CODEX_DOC_LINKS = [
  {
    id: 'codex-config-basic',
    label: 'Codex Config Basics',
    url: 'https://developers.openai.com/codex/config-basic',
    description: 'Official user-layer setup, config location, and baseline configuration behavior.',
  },
  {
    id: 'codex-config-advanced',
    label: 'Codex Config Advanced',
    url: 'https://developers.openai.com/codex/config-advanced',
    description: 'Layering, trust, profiles, and advanced config behavior.',
  },
  {
    id: 'codex-config-reference',
    label: 'Codex Config Reference',
    url: 'https://developers.openai.com/codex/config-reference',
    description: 'Canonical upstream config surface for providers, MCP, features, and trust.',
  },
  {
    id: 'codex-releases',
    label: 'Codex GitHub Releases',
    url: 'https://github.com/openai/codex/releases',
    description: 'Track upstream release notes and fast-moving CLI changes.',
  },
];

const DEFAULT_PROVIDER_DOCS = [
  {
    provider: 'openai',
    label: 'OpenAI Responses API',
    apiFormat: 'Responses API',
    url: 'https://platform.openai.com/docs/api-reference/responses',
  },
];

function renderTextWithLinks(text: string): ReactNode[] {
  const urlPattern = /https?:\/\/[^\s)]+/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = urlPattern.exec(text)) !== null) {
    const [url] = match;
    const index = match.index;

    if (index > cursor) {
      nodes.push(text.slice(cursor, index));
    }

    nodes.push(
      <a
        key={`${url}-${index}`}
        href={url}
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-2 hover:text-foreground"
      >
        {url}
      </a>
    );
    cursor = index + url.length;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes.length > 0 ? nodes : [text];
}

function formatTimestamp(value: number | null | undefined): string {
  if (!value || !Number.isFinite(value)) return 'N/A';
  return new Date(value).toLocaleString();
}

function formatBytes(value: number | null | undefined): string {
  if (!value || value <= 0) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function parseTomlObjectText(
  text: string
): { valid: true; value: Record<string, unknown> } | { valid: false; error: string } {
  try {
    const parsed = text.trim() ? parseToml(text) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { valid: false, error: 'TOML root must be a table.' };
    }
    return { valid: true, value: parsed as Record<string, unknown> };
  } catch (error) {
    return { valid: false, error: (error as Error).message };
  }
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn('text-right break-all', mono && 'font-mono text-xs')}>{value}</span>
    </div>
  );
}

export function CodexPage() {
  const {
    diagnostics,
    diagnosticsLoading,
    diagnosticsError,
    refetchDiagnostics,
    rawConfig,
    rawConfigLoading,
    refetchRawConfig,
    saveRawConfigAsync,
    isSavingRawConfig,
  } = useCodex();

  const [rawDraftText, setRawDraftText] = useState<string | null>(null);
  const rawBaseText = rawConfig?.rawText ?? '';
  const rawEditorText = rawDraftText ?? rawBaseText;
  const rawConfigDirty = rawDraftText !== null && rawDraftText !== rawBaseText;
  const rawEditorParsed = parseTomlObjectText(rawEditorText);
  const rawEditorValidation = rawEditorParsed.valid
    ? { valid: true as const }
    : { valid: false as const, error: rawEditorParsed.error };

  const setRawEditorDraftText = (nextText: string) => {
    if (nextText === rawBaseText) {
      setRawDraftText(null);
      return;
    }
    setRawDraftText(nextText);
  };

  const refreshAll = async () => {
    await Promise.all([refetchDiagnostics(), refetchRawConfig()]);
  };

  const handleSaveRawConfig = async () => {
    if (!rawEditorValidation.valid) {
      toast.error('Fix TOML before saving.');
      return;
    }

    try {
      await saveRawConfigAsync({
        rawText: rawEditorText,
        expectedMtime: rawConfig?.exists ? rawConfig.mtime : undefined,
      });
      setRawDraftText(null);
      toast.success('Saved Codex config.toml.');
      await refetchDiagnostics();
    } catch (error) {
      if (isApiConflictError(error)) {
        toast.error('config.toml changed externally. Refresh and retry.');
      } else {
        toast.error((error as Error).message || 'Failed to save Codex config.toml.');
      }
    }
  };

  const renderOverview = () => {
    if (diagnosticsLoading) {
      return (
        <div className="flex h-full items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading Codex diagnostics...
        </div>
      );
    }

    if (diagnosticsError || !diagnostics) {
      return (
        <div className="flex h-full items-center justify-center px-6 text-center text-destructive">
          Failed to load Codex diagnostics.
        </div>
      );
    }

    const docsReference = diagnostics.docsReference ?? {
      notes: [],
      links: [],
      providerDocs: [],
      providerValues: [],
      settingsHierarchy: [],
    };
    const docsLinks =
      docsReference.links.length > 0 ? docsReference.links : DEFAULT_CODEX_DOC_LINKS;
    const providerDocs =
      docsReference.providerDocs.length > 0 ? docsReference.providerDocs : DEFAULT_PROVIDER_DOCS;
    const tabContentClassName = 'mt-0 h-full border-0 p-0 data-[state=inactive]:hidden';

    return (
      <Tabs defaultValue="overview" className="flex h-full flex-col">
        <div className="shrink-0 px-4 pt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="routing">Runtime &amp; Routing</TabsTrigger>
            <TabsTrigger value="docs">Docs</TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden px-4 pb-4 pt-3">
          <TabsContent value="overview" className={tabContentClassName}>
            <ScrollArea className="h-full">
              <div className="space-y-4 pr-1">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Info className="h-4 w-4" />
                      How Codex works in CCS
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p>
                      Codex is a first-class runtime target in CCS, but it stays runtime-only in v1.
                    </p>
                    <p>
                      Saved default targets for API profiles and variants still remain on Claude or
                      Droid.
                    </p>
                    <p>
                      CCS-backed Codex launches can apply transient <code>-c</code> overrides and
                      inject <code>CCS_CODEX_API_KEY</code>, so effective runtime values may not
                      match this file exactly.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <TerminalSquare className="h-4 w-4" />
                      Runtime install
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Status</span>
                      <Badge variant={diagnostics.binary.installed ? 'default' : 'secondary'}>
                        {diagnostics.binary.installed ? 'Detected' : 'Not found'}
                      </Badge>
                    </div>
                    <DetailRow label="Detection source" value={diagnostics.binary.source} mono />
                    <DetailRow
                      label="Binary path"
                      value={diagnostics.binary.path || 'Not found'}
                      mono
                    />
                    <DetailRow
                      label="Install directory"
                      value={diagnostics.binary.installDir || 'N/A'}
                      mono
                    />
                    <DetailRow
                      label="Version"
                      value={diagnostics.binary.version || 'Unknown'}
                      mono
                    />
                    <DetailRow label="Alias commands" value="ccs-codex, ccsx" mono />
                    <div className="flex items-center justify-between rounded-md border px-3 py-2">
                      <span className="text-sm text-muted-foreground">
                        --config override support
                      </span>
                      <Badge
                        variant={
                          diagnostics.binary.supportsConfigOverrides ? 'default' : 'secondary'
                        }
                      >
                        {diagnostics.binary.supportsConfigOverrides ? 'Available' : 'Missing'}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Folder className="h-4 w-4" />
                      Config file
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-md border p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm">User config</span>
                        {diagnostics.file.exists ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <DetailRow label="Path" value={diagnostics.file.path} mono />
                      <DetailRow label="Resolved" value={diagnostics.file.resolvedPath} mono />
                      <DetailRow label="Size" value={formatBytes(diagnostics.file.sizeBytes)} />
                      <DetailRow
                        label="Last modified"
                        value={formatTimestamp(diagnostics.file.mtimeMs)}
                      />
                      {diagnostics.file.parseError && (
                        <p className="text-xs text-amber-600">
                          TOML warning: {diagnostics.file.parseError}
                        </p>
                      )}
                      {diagnostics.file.readError && (
                        <p className="text-xs text-destructive">
                          Read warning: {diagnostics.file.readError}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ShieldCheck className="h-4 w-4" />
                      Current user-layer summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <DetailRow label="Model" value={diagnostics.config.model || 'Not set'} mono />
                    <DetailRow
                      label="Model provider"
                      value={diagnostics.config.modelProvider || 'Not set'}
                      mono
                    />
                    <DetailRow
                      label="Active profile"
                      value={diagnostics.config.activeProfile || 'Not set'}
                      mono
                    />
                    <DetailRow
                      label="Approval policy"
                      value={diagnostics.config.approvalPolicy || 'Not set'}
                      mono
                    />
                    <DetailRow
                      label="Sandbox mode"
                      value={diagnostics.config.sandboxMode || 'Not set'}
                      mono
                    />
                    <DetailRow
                      label="Web search"
                      value={diagnostics.config.webSearch || 'Not set'}
                      mono
                    />
                    <Separator />
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <Badge variant="outline" className="justify-center">
                        providers: {diagnostics.config.modelProviderCount}
                      </Badge>
                      <Badge variant="outline" className="justify-center">
                        profiles: {diagnostics.config.profileCount}
                      </Badge>
                      <Badge variant="outline" className="justify-center">
                        enabled features: {diagnostics.config.enabledFeatures.length}
                      </Badge>
                      <Badge variant="outline" className="justify-center">
                        MCP servers: {diagnostics.config.mcpServerCount}
                      </Badge>
                    </div>
                    {diagnostics.config.topLevelKeys.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          User-layer keys present
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {diagnostics.config.topLevelKeys.map((key) => (
                            <Badge key={key} variant="secondary" className="font-mono text-[10px]">
                              {key}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {diagnostics.warnings.length > 0 && (
                  <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        Warnings
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1.5">
                      {diagnostics.warnings.map((warning) => (
                        <p key={warning} className="text-sm text-amber-800 dark:text-amber-300">
                          - {warning}
                        </p>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="routing" className={tabContentClassName}>
            <ScrollArea className="h-full">
              <div className="space-y-4 pr-1">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Route className="h-4 w-4" />
                      Runtime vs provider
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-md border p-3 text-sm">
                      <p className="font-medium">Native Codex runtime</p>
                      <p className="mt-1 text-muted-foreground">
                        Use <code>ccs-codex</code>, <code>ccsx</code>, or{' '}
                        <code>--target codex</code>. CCS launches the local Codex CLI and depends on
                        native Codex capabilities such as <code>--config</code> overrides.
                      </p>
                    </div>
                    <div className="rounded-md border p-3 text-sm">
                      <p className="font-medium">Codex provider / bridge</p>
                      <p className="mt-1 text-muted-foreground">
                        CCS can route provider credentials transiently through CLIProxy. That is not
                        the same as editing local <code>config.toml</code>, and some routed values
                        may never persist here.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Supported flows</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Flow</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {diagnostics.supportMatrix.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell className="font-mono text-xs">{entry.label}</TableCell>
                            <TableCell>
                              <Badge variant={entry.supported ? 'default' : 'secondary'}>
                                {entry.supported ? 'Yes' : 'No'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {entry.notes}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Quick usage</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <UsageCommand label="Codex alias (explicit)" command="ccs-codex" />
                    <UsageCommand label="Codex alias (short)" command="ccsx" />
                    <UsageCommand
                      label="Run a profile on native Codex"
                      command='ccs codex --target codex "your prompt"'
                    />
                    <UsageCommand
                      label="Routed profile example"
                      command='ccs mycodex --target codex "your prompt"'
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FileWarning className="h-4 w-4" />
                      What this editor affects
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p>
                      Edits here affect native Codex sessions first because this is the user-layer{' '}
                      <code>config.toml</code>.
                    </p>
                    <p>
                      CCS-routed Codex launches may override provider-related keys transiently and
                      inject <code>CCS_CODEX_API_KEY</code>.
                    </p>
                    <p>
                      That means the file is not a complete source of truth for every routed Codex
                      launch you start from CCS.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="docs" className={tabContentClassName}>
            <ScrollArea className="h-full">
              <div className="space-y-4 pr-1">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ShieldCheck className="h-4 w-4" />
                      Upstream notes
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {docsReference.notes.map((note, index) => (
                      <p key={`${index}-${note}`} className="text-muted-foreground">
                        - {renderTextWithLinks(note)}
                      </p>
                    ))}
                    <Separator />
                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Codex docs
                      </p>
                      <div className="space-y-1.5">
                        {docsLinks.map((link) => (
                          <a
                            key={link.id}
                            href={link.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block rounded-md border px-2.5 py-2 transition-colors hover:bg-muted/50"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-medium">{link.label}</span>
                              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                            </div>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {link.description}
                            </p>
                            <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground/90 underline underline-offset-2">
                              {link.url}
                            </p>
                          </a>
                        ))}
                      </div>
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Provider / bridge reference
                      </p>
                      <div className="space-y-1.5">
                        {providerDocs.map((providerDoc) => (
                          <a
                            key={`${providerDoc.provider}-${providerDoc.url}`}
                            href={providerDoc.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block rounded-md border px-2.5 py-2 transition-colors hover:bg-muted/50"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-medium">{providerDoc.label}</span>
                              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                            </div>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              provider: {providerDoc.provider} | format: {providerDoc.apiFormat}
                            </p>
                            <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground/90 underline underline-offset-2">
                              {providerDoc.url}
                            </p>
                          </a>
                        ))}
                      </div>
                    </div>
                    {docsReference.providerValues.length > 0 && (
                      <>
                        <Separator />
                        <p className="text-xs text-muted-foreground">
                          Provider values: {docsReference.providerValues.join(', ')}
                        </p>
                      </>
                    )}
                    {docsReference.settingsHierarchy.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Settings hierarchy: {docsReference.settingsHierarchy.join(' -> ')}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </TabsContent>
        </div>
      </Tabs>
    );
  };

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <PanelGroup direction="horizontal" className="h-full">
        <Panel defaultSize={45} minSize={35}>
          <div className="h-full border-r bg-muted/20">{renderOverview()}</div>
        </Panel>
        <PanelResizeHandle className="group flex w-2 cursor-col-resize items-center justify-center bg-border transition-colors hover:bg-primary/20">
          <GripVertical className="h-3 w-3 text-muted-foreground group-hover:text-primary" />
        </PanelResizeHandle>
        <Panel defaultSize={55} minSize={35}>
          <RawConfigEditorPanel
            title="Codex config.toml"
            pathLabel={rawConfig?.path || diagnostics?.file.path || '$CODEX_HOME/config.toml'}
            loading={rawConfigLoading}
            parseWarning={
              rawEditorValidation.valid ? rawConfig?.parseError : rawEditorValidation.error
            }
            value={rawEditorText}
            dirty={rawConfigDirty}
            saving={isSavingRawConfig}
            saveDisabled={
              !rawConfigDirty || isSavingRawConfig || rawConfigLoading || !rawEditorValidation.valid
            }
            onChange={(next) => {
              setRawEditorDraftText(next);
            }}
            onSave={handleSaveRawConfig}
            onRefresh={refreshAll}
            language="toml"
            loadingLabel="Loading config.toml..."
            parseWarningLabel="TOML warning"
            ownershipNotice={
              <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
                <p className="font-medium">This file is upstream-owned by Codex CLI.</p>
                <p>
                  CCS does not keep <code>~/.codex/config.toml</code> in sync for you.
                </p>
                <p>
                  CCS-backed Codex launches may apply transient <code>-c</code> overrides and
                  <code> CCS_CODEX_API_KEY</code>; those effective values may not appear here.
                </p>
              </div>
            }
          />
        </Panel>
      </PanelGroup>
    </div>
  );
}
