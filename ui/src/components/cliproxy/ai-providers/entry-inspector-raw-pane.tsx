import { lazy, Suspense } from 'react';
import { Code2, FileJson2, RefreshCw } from 'lucide-react';
import type {
  AiProviderEntryView,
  AiProvidersSourceSummary,
} from '../../../../../src/cliproxy/ai-providers';
import { GlobalEnvIndicator } from '@/components/shared/global-env-indicator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { STORED_SECRET_PLACEHOLDER } from './entry-editor-utils';

const CodeEditor = lazy(() =>
  import('@/components/shared/code-editor').then((m) => ({ default: m.CodeEditor }))
);

export function EntryInspectorRawPane({
  jsonTab,
  onJsonTabChange,
  entry,
  source,
  rawJsonError,
  rawJsonContent,
  onRawJsonChange,
  settingsPreviewContent,
  settingsPreviewEnv,
}: {
  jsonTab: string;
  onJsonTabChange: (tab: string) => void;
  entry: AiProviderEntryView;
  source: AiProvidersSourceSummary;
  rawJsonError: string | null;
  rawJsonContent: string;
  onRawJsonChange: (value: string) => void;
  settingsPreviewContent: string;
  settingsPreviewEnv: Record<string, string>;
}) {
  return (
    <div className="min-h-0 overflow-hidden">
      <Tabs value={jsonTab} onValueChange={onJsonTabChange} className="flex h-full flex-col">
        <div className="border-b bg-background px-4 pt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-medium">Raw configuration</div>
            <div className="text-xs text-muted-foreground">
              Target <span className="font-mono">{source.target}</span>
            </div>
          </div>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="raw" className="gap-2 text-xs">
              <Code2 className="h-3.5 w-3.5" />
              Raw Entry Config
            </TabsTrigger>
            <TabsTrigger value="preview" className="gap-2 text-xs">
              <FileJson2 className="h-3.5 w-3.5" />
              settings.json Preview
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="raw"
          className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          <div className="flex h-full flex-col">
            <div className="border-b bg-muted/10 px-6 py-3 text-sm text-muted-foreground">
              {entry.secretConfigured
                ? `Stored secrets are shown as ${STORED_SECRET_PLACEHOLDER}. Replace the placeholder only when you want to rotate the secret.`
                : 'Add secrets directly in the JSON or use the form on the left.'}
            </div>
            {rawJsonError ? (
              <div className="mx-6 mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {rawJsonError}
              </div>
            ) : null}
            <div className="min-h-0 flex-1 px-6 pb-4 pt-4">
              <div className="h-full overflow-hidden rounded-md border bg-background">
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <RefreshCw className="h-5 w-5 animate-spin" />
                    </div>
                  }
                >
                  <CodeEditor
                    value={rawJsonContent}
                    onChange={onRawJsonChange}
                    language="json"
                    minHeight="100%"
                    heightMode="fill-parent"
                  />
                </Suspense>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent
          value="preview"
          className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          <div className="flex h-full flex-col">
            <div className="border-b bg-muted/10 px-6 py-3 text-sm text-muted-foreground">
              Derived preview for a CCS profile that points to this CLIProxy route. The route stays
              local; the upstream key remains managed here.
            </div>
            <div className="min-h-0 flex-1 px-6 pb-4 pt-4">
              <div className="h-full overflow-hidden rounded-md border bg-background">
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <RefreshCw className="h-5 w-5 animate-spin" />
                    </div>
                  }
                >
                  <CodeEditor
                    value={settingsPreviewContent}
                    onChange={() => {}}
                    language="json"
                    readonly
                    minHeight="100%"
                    heightMode="fill-parent"
                  />
                </Suspense>
              </div>
            </div>
            <div className="mx-6 mb-4 overflow-hidden rounded-md border">
              <GlobalEnvIndicator profileEnv={settingsPreviewEnv} />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
