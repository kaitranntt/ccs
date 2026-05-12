import { type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { Copy, FileCode2, Loader2, RefreshCw, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CodeEditor } from '@/components/shared/code-editor';
import i18n from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface RawConfigEditorPanelProps {
  title: string;
  pathLabel: string;
  loading: boolean;
  parseWarning: string | null | undefined;
  readWarning?: string | null | undefined;
  value: string;
  dirty: boolean;
  readOnly?: boolean;
  saving: boolean;
  saveDisabled: boolean;
  onChange: (nextValue: string) => void;
  onSave: () => Promise<void> | void;
  onRefresh: () => Promise<void> | void;
  onDiscard?: () => void;
  language?: 'json' | 'yaml' | 'toml';
  exactText?: boolean;
  loadingLabel?: string;
  parseWarningLabel?: string;
  ownershipNotice?: ReactNode;
}

export function RawConfigEditorPanel({
  title,
  pathLabel,
  loading,
  parseWarning,
  readWarning,
  value,
  dirty,
  readOnly = false,
  saving,
  saveDisabled,
  onChange,
  onSave,
  onRefresh,
  onDiscard,
  language = 'json',
  exactText = false,
  loadingLabel = 'Loading settings.json...',
  parseWarningLabel = 'Parse warning',
  ownershipNotice,
}: RawConfigEditorPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success(i18n.t('commonToast.settingsCopied'));
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b bg-background flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold flex items-center gap-2">
            <FileCode2 className="h-4 w-4 text-primary" />
            {title}
            {dirty && (
              <Badge variant="secondary" className="text-[10px]">
                {/* TODO i18n: missing key rawJsonSettingsEditor.unsaved */}
                Unsaved
              </Badge>
            )}
          </h2>
          <p className="text-xs text-muted-foreground font-mono truncate">{pathLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={onSave} disabled={saveDisabled}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            {/* TODO i18n: missing key rawJsonSettingsEditor.save */}
            Save
          </Button>
          {onDiscard ? (
            <Button variant="outline" size="sm" onClick={onDiscard} disabled={!dirty || loading}>
              {/* TODO i18n: missing key rawJsonSettingsEditor.discard */}
              Discard
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={handleCopy} disabled={!value}>
            <Copy className="h-4 w-4 mr-1" />
            {/* TODO i18n: missing keys rawJsonSettingsEditor.copied / rawJsonSettingsEditor.copy */}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button variant="outline" size="sm" onClick={onRefresh} aria-label="Refresh raw config">
            <RefreshCw className={cn('h-4 w-4', loading ? 'animate-spin' : '')} />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            {loadingLabel}
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            {ownershipNotice && <div className="mx-4 mt-4">{ownershipNotice}</div>}
            {parseWarning && (
              <div className="mx-4 mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
                {parseWarningLabel}: {parseWarning}
              </div>
            )}
            {readWarning && (
              <div className="mx-4 mt-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {/* TODO i18n: missing key rawJsonSettingsEditor.readOnly */}
                Read-only: {readWarning}
              </div>
            )}
            <div className="min-h-0 flex-1 p-4 pt-3">
              <div className="h-full rounded-md border overflow-hidden bg-background">
                <CodeEditor
                  value={value}
                  onChange={onChange}
                  language={language}
                  readonly={readOnly}
                  exactText={exactText}
                  minHeight="100%"
                  heightMode="fill-parent"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const RawJsonSettingsEditorPanel = RawConfigEditorPanel;
