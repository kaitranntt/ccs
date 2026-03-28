/**
 * Code Editor Component
 * Lightweight JSON/TOML editor with syntax highlighting, line numbers, and validation
 * Uses react-simple-code-editor + prism-react-renderer for minimal bundle size (~18KB)
 */

import { useState, useCallback, useMemo } from 'react';
import Editor from 'react-simple-code-editor';
import { Highlight, themes } from 'prism-react-renderer';
import Prism from 'prismjs';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-toml';
import { parse as parseToml } from 'smol-toml';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';
import { isSensitiveKey } from '@/lib/sensitive-keys';
import { AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: 'json' | 'yaml' | 'toml';
  readonly?: boolean;
  className?: string;
  minHeight?: string;
  heightMode?: 'content' | 'fill-parent';
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  line?: number;
}

/**
 * Validate JSON and extract error location
 */
function validateJson(code: string): ValidationResult {
  if (!code.trim()) {
    return { valid: true };
  }

  try {
    JSON.parse(code);
    return { valid: true };
  } catch (e) {
    const error = e as SyntaxError;
    const message = error.message;

    // Try to extract line number from error message
    // Format: "... at position X" or "... at line Y column Z"
    const posMatch = message.match(/position (\d+)/);
    if (posMatch) {
      const pos = parseInt(posMatch[1], 10);
      const lines = code.substring(0, pos).split('\n');
      return {
        valid: false,
        error: message,
        line: lines.length,
      };
    }

    return {
      valid: false,
      error: message,
    };
  }
}

function validateToml(code: string): ValidationResult {
  if (!code.trim()) {
    return { valid: true };
  }

  try {
    parseToml(code);
    return { valid: true };
  } catch (error) {
    const message = (error as Error).message;
    const lineMatch = message.match(/line\s+(\d+)/i);

    return {
      valid: false,
      error: message,
      line: lineMatch ? Number.parseInt(lineMatch[1], 10) : undefined,
    };
  }
}

export function CodeEditor({
  value,
  onChange,
  language = 'json',
  readonly = false,
  className,
  minHeight = '300px',
  heightMode = 'content',
}: CodeEditorProps) {
  const { isDark } = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const [isMasked, setIsMasked] = useState(true);
  const isFillParent = heightMode === 'fill-parent';

  // Validate on every change for JSON
  const validation = useMemo(() => {
    if (language === 'json') {
      return validateJson(value);
    }
    if (language === 'toml') {
      return validateToml(value);
    }
    return { valid: true };
  }, [value, language]);

  // Highlight function using prism-react-renderer
  // Note: Line numbers removed - they break textarea/pre alignment in react-simple-code-editor
  const highlightCode = useCallback(
    (code: string) => (
      <Highlight
        prism={Prism}
        theme={isDark ? themes.nightOwl : themes.github}
        code={code}
        language={language}
      >
        {({ tokens, getLineProps, getTokenProps }) => {
          let nextValueIsSensitive = false;

          return (
            <>
              {tokens.map((line, i) => (
                <div
                  key={i}
                  {...getLineProps({ line })}
                  className={cn(validation.line === i + 1 && 'bg-destructive/20')}
                >
                  {line.map((token, key) => {
                    let isSensitive = false;

                    // Check for sensitive keys
                    if (token.types.includes('property')) {
                      const content = token.content.replace(/['"]/g, '');
                      // Use shared sensitive key detection utility
                      if (isSensitiveKey(content)) {
                        nextValueIsSensitive = true;
                      } else {
                        nextValueIsSensitive = false;
                      }
                    }
                    // Apply masking to values following sensitive keys
                    else if (
                      (token.types.includes('string') ||
                        token.types.includes('number') ||
                        token.types.includes('boolean')) &&
                      nextValueIsSensitive
                    ) {
                      isSensitive = true;
                      // Consumes the flag for this value
                      nextValueIsSensitive = false;
                    }
                    // Reset flag on commas or new keys (handled by property check),
                    // but persist through colons and whitespace
                    else if (token.types.includes('punctuation')) {
                      if (token.content !== ':' && token.content !== '[' && token.content !== '{') {
                        nextValueIsSensitive = false;
                      }
                    }

                    const tokenProps = getTokenProps({ token });

                    if (isSensitive && isMasked) {
                      tokenProps.className = cn(
                        tokenProps.className,
                        'blur-[3px] select-none opacity-70 transition-all duration-200'
                      );
                    }

                    return <span key={key} {...tokenProps} />;
                  })}
                </div>
              ))}
            </>
          );
        }}
      </Highlight>
    ),
    [isDark, language, validation.line, isMasked]
  );

  return (
    <div
      className={cn('flex min-h-0 flex-col', isFillParent && 'h-full', className)}
      style={isFillParent ? { height: minHeight === 'auto' ? undefined : minHeight } : undefined}
    >
      {/* Editor container */}
      <div
        className={cn(
          'relative rounded-md border overflow-hidden',
          'bg-muted/30',
          isFillParent && 'flex min-h-0 flex-1 flex-col',
          isFocused && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
          readonly && 'opacity-70 cursor-not-allowed',
          !validation.valid && 'border-destructive'
        )}
        data-slot="code-editor-surface"
      >
        <div
          className={cn(isFillParent && 'scrollbar-editor min-h-0 flex-1 overflow-auto')}
          data-slot={isFillParent ? 'code-editor-viewport' : undefined}
        >
          <Editor
            value={value}
            onValueChange={readonly ? () => {} : onChange}
            highlight={highlightCode}
            key={isDark ? 'dark-editor' : 'light-editor'}
            padding={12}
            disabled={readonly}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            textareaClassName={cn(
              'focus:outline-none font-mono text-sm',
              readonly && 'cursor-not-allowed'
            )}
            preClassName="font-mono text-sm"
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: '0.875rem',
              minHeight,
            }}
          />
        </div>

        {/* Secrets Toggle Overlay */}
        <div className="absolute top-2 right-2 z-10 opacity-50 hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 bg-background/50 hover:bg-background border shadow-sm rounded-full"
            onClick={() => setIsMasked(!isMasked)}
            title={isMasked ? 'Reveal sensitive values' : 'Mask sensitive values'}
          >
            {isMasked ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          </Button>
        </div>
      </div>

      {/* Validation status */}
      <div className="flex items-center gap-2 mt-2 text-xs">
        {validation.valid ? (
          <span className="flex items-center gap-1 text-muted-foreground">
            <CheckCircle2 className="w-3 h-3 text-green-500" />
            Valid {language.toUpperCase()}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-destructive">
            <AlertCircle className="w-3 h-3" />
            {validation.error}
            {validation.line && ` (line ${validation.line})`}
          </span>
        )}
        {readonly && <span className="ml-auto text-muted-foreground">(Read-only)</span>}
      </div>
    </div>
  );
}
