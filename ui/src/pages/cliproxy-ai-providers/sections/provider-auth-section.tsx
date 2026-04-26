/**
 * Provider Auth / Connection Section — API key, connector name, base URL, proxy URL, prefix.
 */

import { Input } from '@/components/ui/input';
import { KeyRound } from 'lucide-react';
import type {
  AiProviderEntryView,
  AiProviderFamilyState,
} from '../../../../../src/cliproxy/ai-providers';
import type { EntryEditorDraft } from '../lib/ai-provider-utils';
import { STORED_SECRET_PLACEHOLDER, getBaseUrlPlaceholder } from '../lib/ai-provider-utils';
import { EntryEditorField, EntryEditorTextArea } from './provider-entry-primitives';

interface ProviderAuthSectionProps {
  family: AiProviderFamilyState;
  entry: AiProviderEntryView;
  draft: EntryEditorDraft;
  updateDraft: (updater: (current: EntryEditorDraft) => EntryEditorDraft) => void;
}

export function ProviderAuthSection({
  family,
  entry,
  draft,
  updateDraft,
}: ProviderAuthSectionProps) {
  const isConnector = family.id === 'openai-compatibility';

  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="mb-4 flex items-center gap-2 text-sm font-medium">
        <KeyRound className="h-4 w-4 text-primary" />
        Connection
      </div>

      <div className="grid gap-4 2xl:grid-cols-2">
        {/* Connector name (openai-compatibility only) vs API Key (all others) */}
        {isConnector ? (
          <EntryEditorField
            label="Connector Name"
            helper="This is the saved connector label shown in the entry switcher."
          >
            <Input
              value={draft.name}
              onChange={(e) => updateDraft((c) => ({ ...c, name: e.target.value }))}
              placeholder="openrouter"
            />
          </EntryEditorField>
        ) : (
          <EntryEditorField
            label={`${family.displayName} API Key`}
            helper={
              entry.secretConfigured
                ? 'Leave blank to keep the stored secret. Enter a new value only to rotate it.'
                : 'Required before this route can authenticate.'
            }
          >
            <Input
              type="password"
              value={draft.apiKey}
              onChange={(e) => updateDraft((c) => ({ ...c, apiKey: e.target.value }))}
              placeholder={
                entry.secretConfigured
                  ? (entry.apiKeyMasked ?? STORED_SECRET_PLACEHOLDER)
                  : 'Paste provider API key'
              }
            />
          </EntryEditorField>
        )}

        {/* Multi-key textarea (openai-compatibility only) */}
        {isConnector ? (
          <EntryEditorField
            label="API Keys"
            helper={
              entry.secretConfigured
                ? 'One key per line. Leave empty to preserve the stored connector keys.'
                : 'Add one key per line. A connector needs at least one key.'
            }
          >
            <EntryEditorTextArea
              value={draft.apiKeysText}
              onChange={(value) => updateDraft((c) => ({ ...c, apiKeysText: value }))}
              placeholder="sk-..."
              rows={4}
            />
          </EntryEditorField>
        ) : null}

        {/* Base URL — all families */}
        <EntryEditorField
          label="Base URL"
          helper={
            isConnector
              ? 'Required for connectors. This is the upstream OpenAI-style endpoint.'
              : 'Leave blank unless this route should target another upstream host.'
          }
        >
          <Input
            value={draft.baseUrl}
            onChange={(e) => updateDraft((c) => ({ ...c, baseUrl: e.target.value }))}
            placeholder={getBaseUrlPlaceholder(family.id)}
          />
        </EntryEditorField>

        {/* Proxy URL — non-connector families only */}
        {!isConnector ? (
          <EntryEditorField
            label="Proxy URL"
            helper="Optional intermediary endpoint. Leave blank for direct routing."
          >
            <Input
              value={draft.proxyUrl}
              onChange={(e) => updateDraft((c) => ({ ...c, proxyUrl: e.target.value }))}
              placeholder="https://proxy.example.com/v1"
            />
          </EntryEditorField>
        ) : null}

        {/* Prefix — non-connector families only */}
        {!isConnector ? (
          <EntryEditorField
            label="Prefix"
            helper="Optional model prefix rewrite for advanced routing only."
          >
            <Input
              value={draft.prefix}
              onChange={(e) => updateDraft((c) => ({ ...c, prefix: e.target.value }))}
              placeholder="provider/"
            />
          </EntryEditorField>
        ) : null}
      </div>
    </div>
  );
}
