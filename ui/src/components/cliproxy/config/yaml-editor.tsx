/**
 * YAML Editor Component
 * Right panel YAML editor backed by lazy-loaded CodeEditor with validation status bar
 */

import { lazy, Suspense } from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const CodeEditor = lazy(() =>
  import('@/components/shared/code-editor').then((m) => ({ default: m.CodeEditor }))
);

interface YamlEditorProps {
  value: string;
  onChange: (value: string) => void;
  readonly?: boolean;
  errorLine?: number;
  className?: string;
}

export function YamlEditor({
  value,
  onChange,
  readonly = false,
  errorLine,
  className,
}: YamlEditorProps) {
  return (
    <Suspense
      fallback={
        <div className={cn('flex h-full min-h-[200px] items-center justify-center', className)}>
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <CodeEditor
        value={value}
        onChange={onChange}
        language="yaml"
        readonly={readonly}
        heightMode="fill-parent"
        minHeight="100%"
        className={cn(
          errorLine !== undefined && 'ring-1 ring-destructive/40 rounded-md',
          className
        )}
      />
    </Suspense>
  );
}

interface EditorStatusBarProps {
  validation: { valid: boolean; error?: string; line?: number };
  isDirty: boolean;
  cursorLine?: number;
  cursorCol?: number;
}

export function EditorStatusBar({
  validation,
  isDirty,
  cursorLine,
  cursorCol,
}: EditorStatusBarProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-t bg-muted/30 text-xs">
      <div className="flex items-center gap-4">
        {validation.valid ? (
          <span className="flex items-center gap-1 text-muted-foreground">
            <CheckCircle2 className="w-3 h-3 text-green-500" />
            Valid YAML
          </span>
        ) : (
          <span className="flex items-center gap-1 text-destructive">
            <AlertCircle className="w-3 h-3" />
            {validation.error}
            {validation.line && ` (line ${validation.line})`}
          </span>
        )}

        {isDirty && <span className="text-amber-500">{t('cliproxyConfig.unsavedChanges')}</span>}
      </div>

      {cursorLine && cursorCol && (
        <span className="text-muted-foreground">
          Ln {cursorLine}, Col {cursorCol}
        </span>
      )}
    </div>
  );
}
