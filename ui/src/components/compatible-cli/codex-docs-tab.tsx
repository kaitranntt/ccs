import { type ReactNode } from 'react';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import type {
  CompatibleCliProviderDocLink,
  CodexDashboardDiagnostics,
} from '@/hooks/use-codex-types';

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

const DEFAULT_PROVIDER_DOCS: CompatibleCliProviderDocLink[] = [
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

interface CodexDocsTabProps {
  diagnostics: CodexDashboardDiagnostics;
}

export function CodexDocsTab({ diagnostics }: CodexDocsTabProps) {
  const docsReference = diagnostics.docsReference ?? {
    notes: [],
    links: [],
    providerDocs: [],
    providerValues: [],
    settingsHierarchy: [],
  };
  const docsLinks = docsReference.links.length > 0 ? docsReference.links : DEFAULT_CODEX_DOC_LINKS;
  const providerDocs =
    docsReference.providerDocs.length > 0 ? docsReference.providerDocs : DEFAULT_PROVIDER_DOCS;

  return (
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
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Codex docs</p>
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
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{link.description}</p>
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
  );
}
