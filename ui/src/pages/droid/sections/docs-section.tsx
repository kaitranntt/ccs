/**
 * Droid docs section — Notes + Factory docs links + Provider docs links.
 * Maps to the former "Docs" tab in the droid monolith.
 */

import type { ReactNode } from 'react';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { FormSection } from '@/components/config-layout';
import type { DroidDashboardDiagnostics } from '@/hooks/use-droid';

// ---- Static fallbacks (verbatim from monolith) ------------------------------

const DEFAULT_DROID_FACTORY_DOC_LINKS = [
  {
    id: 'droid-cli-overview',
    label: 'Droid CLI Overview',
    url: 'https://docs.factory.ai/cli/',
    description: 'Primary entry docs for setup, auth, and core CLI usage.',
  },
  {
    id: 'droid-byok-overview',
    label: 'BYOK Overview',
    url: 'https://docs.factory.ai/cli/byok/overview/',
    description: 'BYOK model/provider shape, provider values, and migration notes.',
  },
  {
    id: 'droid-settings-reference',
    label: 'settings.json Reference',
    url: 'https://docs.factory.ai/cli/configuration/settings/',
    description: 'Supported settings keys, defaults, and allowed values.',
  },
];

const DEFAULT_DROID_PROVIDER_DOC_LINKS = [
  {
    provider: 'anthropic',
    label: 'Anthropic Messages API',
    apiFormat: 'Messages API',
    url: 'https://docs.anthropic.com/en/api/messages',
  },
  {
    provider: 'openai',
    label: 'OpenAI Responses API',
    apiFormat: 'Responses API',
    url: 'https://platform.openai.com/docs/api-reference/responses',
  },
  {
    provider: 'generic-chat-completion-api',
    label: 'OpenAI Chat Completions Spec',
    apiFormat: 'Chat Completions API',
    url: 'https://platform.openai.com/docs/api-reference/chat',
  },
];

// ---- renderTextWithLinks (verbatim from monolith) ---------------------------

function renderTextWithLinks(text: string): ReactNode[] {
  const urlPattern = /https?:\/\/[^\s)]+/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = urlPattern.exec(text)) !== null) {
    const [url] = match;
    const index = match.index;
    if (index > cursor) nodes.push(text.slice(cursor, index));
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

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes.length > 0 ? nodes : [text];
}

// ---- Props ------------------------------------------------------------------

interface DocsSectionProps {
  diagnostics: DroidDashboardDiagnostics | null | undefined;
}

// ---- Component --------------------------------------------------------------

export function DocsSection({ diagnostics }: DocsSectionProps) {
  const { t } = useTranslation();

  const docsReference = diagnostics?.docsReference ?? {
    notes: [],
    links: [],
    providerDocs: [],
    providerValues: [],
    settingsHierarchy: [],
  };

  const docsNotes = docsReference.notes ?? [];
  const docsLinksRaw = docsReference.links ?? [];
  const providerDocsRaw = docsReference.providerDocs ?? [];
  const docsLinks = docsLinksRaw.length > 0 ? docsLinksRaw : DEFAULT_DROID_FACTORY_DOC_LINKS;
  const providerDocs =
    providerDocsRaw.length > 0 ? providerDocsRaw : DEFAULT_DROID_PROVIDER_DOC_LINKS;
  const providerValues = docsReference.providerValues ?? [];
  const settingsHierarchy = docsReference.settingsHierarchy ?? [];

  return (
    <FormSection id="docs" title={t('droidPage.docs')}>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            {t('droidPage.docsAlignedNotes')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {docsNotes.map((note, index) => (
            <p key={`${index}-${note}`} className="text-muted-foreground">
              - {renderTextWithLinks(note)}
            </p>
          ))}

          <Separator />

          {/* Factory docs links */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              {t('droidPage.factoryDocs')}
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
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{link.description}</p>
                  <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground/90 underline underline-offset-2">
                    {link.url}
                  </p>
                </a>
              ))}
            </div>
          </div>

          <Separator />

          {/* Provider fact-check docs */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              {t('droidPage.providerFactCheckDocs')}
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

          <Separator />

          <p className="text-xs text-muted-foreground">
            {t('droidPage.providerValues', { value: providerValues.join(', ') })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('droidPage.settingsHierarchy', { value: settingsHierarchy.join(' -> ') })}
          </p>
        </CardContent>
      </Card>
    </FormSection>
  );
}
