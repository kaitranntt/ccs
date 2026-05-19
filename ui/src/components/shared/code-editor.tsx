/**
 * Code Editor Component
 * CodeMirror 6 backed JSON/YAML/TOML editor with native selection, copy, undo,
 * syntax highlighting, validation, and sensitive-value masking.
 */

import { useMemo, useState } from 'react';
import CodeMirror, { EditorView, type Extension } from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { StreamLanguage } from '@codemirror/language';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { createTheme } from '@uiw/codemirror-themes';
import { tags as t } from '@lezer/highlight';
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, type DecorationSet, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { parse as parseToml } from 'smol-toml';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';
import { isSensitiveKey } from '@/lib/sensitive-keys';
import { AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: 'json' | 'yaml' | 'toml';
  readonly?: boolean;
  /**
   * Retained for API compatibility. CodeMirror always preserves exact text,
   * so this flag is a no-op; callers can pass it without effect.
   */
  exactText?: boolean;
  className?: string;
  minHeight?: string;
  heightMode?: 'content' | 'fill-parent';
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  line?: number;
}

function validateJson(code: string): ValidationResult {
  if (!code.trim()) return { valid: true };
  try {
    JSON.parse(code);
    return { valid: true };
  } catch (e) {
    const message = (e as SyntaxError).message;
    const posMatch = message.match(/position (\d+)/);
    if (posMatch) {
      const pos = parseInt(posMatch[1], 10);
      const lines = code.substring(0, pos).split('\n');
      return { valid: false, error: message, line: lines.length };
    }
    return { valid: false, error: message };
  }
}

function validateToml(code: string): ValidationResult {
  if (!code.trim()) return { valid: true };
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

// Line-anchored key patterns for TOML/YAML. Each captures (indent, key). Keys
// may be bare, basic-string ("..."), or literal-string ('...'). JSON uses a
// dedicated state-aware scanner (`findJsonSensitiveRanges`) instead so that
// `"API_KEY":` substrings embedded inside escaped value strings are not
// mis-classified as keys.
const SENSITIVE_PATTERNS: Record<'yaml' | 'toml', RegExp> = {
  yaml: /^(\s*)("(?:[^"\\]|\\.)*"|'[^']*'|[A-Za-z0-9_.-]+)\s*:\s*/gm,
  toml: /^(\s*)("(?:[^"\\]|\\.)*"|'[^']*'|[A-Za-z0-9_.-]+)\s*=\s*/gm,
};

/**
 * Strip the surrounding quotes (and unescape minimally for basic strings) from
 * a key captured by the patterns above.
 */
function normalizeKey(raw: string): string {
  if (raw.length >= 2 && raw[0] === '"' && raw[raw.length - 1] === '"') {
    return raw.slice(1, -1).replace(/\\(.)/g, '$1');
  }
  if (raw.length >= 2 && raw[0] === "'" && raw[raw.length - 1] === "'") {
    return raw.slice(1, -1);
  }
  return raw;
}

/**
 * Advance past a TOML/JSON string starting at `start` (whose first char is the
 * opening quote). Basic strings (") honor backslash escapes; literal strings
 * (') do not.
 */
function skipString(text: string, start: number, quote: '"' | "'"): number {
  let i = start + 1;
  if (quote === "'") {
    const idx = text.indexOf("'", i);
    return idx >= 0 ? idx + 1 : text.length;
  }
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '"') return i + 1;
    i++;
  }
  return text.length;
}

/**
 * Advance past a TOML string starting at `start`. Detects triple-quoted
 * multi-line strings (""" … """ and ''' … ''') so a `]` or `#` inside the
 * string body cannot terminate an enclosing array or pretend to be a comment.
 */
function skipTomlString(text: string, start: number): number {
  const ch = text[start];
  if (ch !== '"' && ch !== "'") return start + 1;
  if (text.slice(start, start + 3) === ch + ch + ch) {
    const triple = ch + ch + ch;
    const closeIdx = text.indexOf(triple, start + 3);
    return closeIdx >= 0 ? closeIdx + 3 : text.length;
  }
  return skipString(text, start, ch);
}

/**
 * Locate the end offset of the value that begins at `valueStart`. Handles
 * multi-line TOML strings (""" … """, ''' … '''), arrays ([ … ]), YAML block
 * scalars (| / >), and JSON arrays/objects. Falls back to end-of-line.
 */
function findValueEnd(
  doc: EditorView['state']['doc'],
  valueStart: number,
  language: 'json' | 'yaml' | 'toml',
  keyIndent: number
): number {
  const docLen = doc.length;
  if (valueStart >= docLen) return valueStart;
  const lookahead = doc.sliceString(valueStart, Math.min(valueStart + 3, docLen));

  if (language === 'toml') {
    if (lookahead === '"""' || lookahead === "'''") {
      const delim = lookahead;
      const rest = doc.sliceString(valueStart + 3, docLen);
      const closeIdx = rest.indexOf(delim);
      return closeIdx >= 0 ? valueStart + 3 + closeIdx + 3 : docLen;
    }
    if (lookahead[0] === '[') {
      // Track bracket depth, skipping content inside strings and comments.
      // Use the backslash-aware skipper so `\"` inside basic strings does not
      // prematurely close the string scan, and skip `# ... \n` so a `]` that
      // appears inside a TOML comment cannot terminate the array early.
      const text = doc.toString();
      let depth = 0;
      let i = valueStart;
      while (i < docLen) {
        const ch = text[i];
        if (ch === '"' || ch === "'") {
          // TOML strings may be triple-quoted. Skip the whole literal as one
          // unit so its body cannot terminate the array.
          i = skipTomlString(text, i);
          continue;
        }
        if (ch === '#') {
          const nl = text.indexOf('\n', i);
          i = nl >= 0 ? nl + 1 : docLen;
          continue;
        }
        if (ch === '[') depth++;
        else if (ch === ']') {
          depth--;
          if (depth === 0) return i + 1;
        }
        i++;
      }
      return docLen;
    }
    return doc.lineAt(valueStart).to;
  }

  if (language === 'yaml') {
    if (lookahead[0] === '|' || lookahead[0] === '>') {
      // Block scalar: include subsequent lines indented deeper than the key.
      let line = doc.lineAt(valueStart);
      let end = line.to;
      while (line.number < doc.lines) {
        const next = doc.line(line.number + 1);
        const trimmed = next.text.replace(/\s+$/, '');
        if (trimmed === '') {
          end = next.to;
          line = next;
          continue;
        }
        const indent = next.text.search(/\S/);
        if (indent <= keyIndent) break;
        end = next.to;
        line = next;
      }
      return end;
    }
    return doc.lineAt(valueStart).to;
  }

  // JSON: walk balanced braces/brackets when the value starts with one.
  if (lookahead[0] === '[' || lookahead[0] === '{') {
    const openCh = lookahead[0];
    const closeCh = openCh === '[' ? ']' : '}';
    const text = doc.toString();
    let depth = 0;
    let i = valueStart;
    while (i < docLen) {
      const ch = text[i];
      if (ch === '"') {
        i = skipString(text, i, '"');
        continue;
      }
      if (ch === openCh) depth++;
      else if (ch === closeCh) {
        depth--;
        if (depth === 0) return i + 1;
      }
      i++;
    }
    return docLen;
  }
  return doc.lineAt(valueStart).to;
}

/**
 * JSON-specific scanner: walks the document character by character, only
 * registering a quoted string as a key when it sits at an object-key position
 * (preceded by `{` or `,`, ignoring whitespace) AND is followed by `:`. This
 * avoids the regex false-positive where a `"API_KEY":` substring inside an
 * escaped value string would be treated as a sensitive key.
 */
function findJsonSensitiveRanges(text: string): Array<{ valueStart: number; key: string }> {
  const hits: Array<{ valueStart: number; key: string }> = [];
  let i = 0;
  let prevSignificant: string | null = null; // last non-whitespace structural char
  while (i < text.length) {
    const ch = text[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }
    if (ch === '"') {
      const stringStart = i;
      const stringEnd = skipString(text, i, '"');
      // Skip whitespace to peek at the next significant character.
      let j = stringEnd;
      while (
        j < text.length &&
        (text[j] === ' ' || text[j] === '\t' || text[j] === '\n' || text[j] === '\r')
      ) {
        j++;
      }
      const isKeyPos =
        prevSignificant === '{' || prevSignificant === ',' || prevSignificant === null;
      if (isKeyPos && text[j] === ':') {
        const rawKey = text.slice(stringStart + 1, stringEnd - 1);
        const key = rawKey.replace(/\\(.)/g, '$1');
        // Advance past the colon and any whitespace to the value start.
        let valueStart = j + 1;
        while (
          valueStart < text.length &&
          (text[valueStart] === ' ' ||
            text[valueStart] === '\t' ||
            text[valueStart] === '\n' ||
            text[valueStart] === '\r')
        ) {
          valueStart++;
        }
        hits.push({ valueStart, key });
        prevSignificant = '"';
        i = j + 1;
        continue;
      }
      // Not a key position; treat the string as a value scalar.
      prevSignificant = '"';
      i = stringEnd;
      continue;
    }
    prevSignificant = ch;
    i++;
  }
  return hits;
}

function buildSensitiveDecorations(
  view: EditorView,
  language: 'json' | 'yaml' | 'toml'
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  // Scan the entire document (decoration ranges outside the viewport are
  // dropped automatically) so a multi-line value beginning above the viewport
  // still masks when its tail scrolls into view.
  const text = doc.toString();

  if (language === 'json') {
    for (const { valueStart, key } of findJsonSensitiveRanges(text)) {
      if (!isSensitiveKey(key)) continue;
      if (valueStart >= doc.length) continue;
      const valueEnd = findValueEnd(doc, valueStart, 'json', 0);
      const trimmedLen = doc.sliceString(valueStart, valueEnd).replace(/\s+$/, '').length;
      if (trimmedLen === 0) continue;
      builder.add(
        valueStart,
        valueStart + trimmedLen,
        Decoration.mark({ class: 'cm-sensitive-mask' })
      );
    }
    return builder.finish();
  }

  const pattern = new RegExp(SENSITIVE_PATTERNS[language].source, 'gm');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const key = normalizeKey(match[2]);
    const keyIndent = match[1].length;
    if (!isSensitiveKey(key)) continue;
    const valueStart = match.index + match[0].length;
    if (valueStart >= doc.length) continue;
    const valueEnd = findValueEnd(doc, valueStart, language, keyIndent);
    const trimmedLen = doc.sliceString(valueStart, valueEnd).replace(/\s+$/, '').length;
    if (trimmedLen === 0) continue;
    builder.add(
      valueStart,
      valueStart + trimmedLen,
      Decoration.mark({ class: 'cm-sensitive-mask' })
    );
  }
  return builder.finish();
}

function makeSensitivePlugin(language: 'json' | 'yaml' | 'toml'): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildSensitiveDecorations(view, language);
      }
      update(update: ViewUpdate) {
        // Decorations are derived from the whole document, not the viewport,
        // so a viewport-only change (scroll) does not require a rebuild.
        if (update.docChanged) {
          this.decorations = buildSensitiveDecorations(update.view, language);
        }
      }
    },
    { decorations: (v) => v.decorations }
  );
}

// Visual parity with the previous prism-react-renderer themes. Hex values are
// copied from prism-react-renderer/themes/nightOwl.js and themes/github.js so
// the dashboard appearance does not shift with the editor swap.
//
// Background is left transparent on both themes so the surrounding
// `bg-muted/30` container shows through, matching the old Editor which only
// painted token colors over a transparent textarea.
const prismGithubTheme = createTheme({
  theme: 'light',
  settings: {
    background: 'transparent',
    foreground: '#393A34',
    caret: '#393A34',
    selection: 'rgba(57, 58, 52, 0.18)',
    selectionMatch: 'rgba(57, 58, 52, 0.12)',
    lineHighlight: 'transparent',
    gutterBackground: 'transparent',
    gutterForeground: '#999988',
  },
  styles: [
    { tag: [t.comment, t.lineComment, t.blockComment], color: '#999988', fontStyle: 'italic' },
    { tag: [t.string, t.special(t.string), t.regexp], color: '#e3116c' },
    {
      tag: [t.number, t.bool, t.null, t.atom, t.variableName, t.propertyName, t.url],
      color: '#36acaa',
    },
    { tag: [t.keyword, t.attributeName, t.modifier, t.operatorKeyword], color: '#00a4db' },
    { tag: [t.function(t.variableName), t.labelName], color: '#6f42c1' },
    { tag: [t.tagName, t.heading], color: '#00009f', fontWeight: 'bold' },
    { tag: [t.deleted, t.invalid], color: '#d73a49' },
    { tag: [t.punctuation, t.operator, t.bracket, t.brace, t.separator], color: '#393A34' },
  ],
});

const prismNightOwlTheme = createTheme({
  theme: 'dark',
  settings: {
    background: 'transparent',
    foreground: '#d6deeb',
    caret: '#80a4c2',
    selection: 'rgba(29, 59, 83, 0.99)',
    selectionMatch: 'rgba(35, 77, 112, 0.6)',
    lineHighlight: 'transparent',
    gutterBackground: 'transparent',
    gutterForeground: '#4b6479',
  },
  styles: [
    { tag: [t.comment, t.lineComment, t.blockComment], color: '#637777', fontStyle: 'italic' },
    { tag: [t.string, t.special(t.string), t.url], color: 'rgb(173, 219, 103)' },
    { tag: t.number, color: 'rgb(247, 140, 108)' },
    { tag: [t.bool, t.null, t.atom], color: 'rgb(255, 88, 116)' },
    { tag: [t.keyword, t.modifier, t.operatorKeyword], color: 'rgb(127, 219, 202)' },
    { tag: [t.propertyName, t.attributeName], color: 'rgb(128, 203, 196)' },
    { tag: [t.variableName, t.labelName], color: 'rgb(214, 222, 235)' },
    { tag: t.function(t.variableName), color: 'rgb(130, 170, 255)' },
    { tag: [t.tagName, t.heading], color: 'rgb(127, 219, 202)' },
    {
      tag: [t.bracket, t.punctuation, t.operator, t.brace, t.separator],
      color: 'rgb(199, 146, 234)',
    },
    { tag: [t.className, t.special(t.string)], color: 'rgb(255, 203, 139)' },
    { tag: [t.deleted, t.invalid], color: 'rgba(239, 83, 80, 0.56)' },
  ],
});

const sensitiveMaskTheme = EditorView.baseTheme({
  '.cm-sensitive-mask': {
    filter: 'blur(3px)',
    opacity: '0.7',
    transition: 'filter 200ms ease, opacity 200ms ease',
  },
  // The reveal class is placed on the @uiw/react-codemirror wrapper rather
  // than directly on `.cm-editor`, so target the wrapper as the toggle root.
  '.cm-sensitive-revealed .cm-sensitive-mask': {
    filter: 'none',
    opacity: '1',
  },
});

export function CodeEditor({
  value,
  onChange,
  language = 'json',
  readonly = false,
  exactText: _exactText = false,
  className,
  minHeight = '300px',
  heightMode = 'content',
}: CodeEditorProps) {
  const { isDark } = useTheme();
  const { t } = useTranslation();
  const [isFocused, setIsFocused] = useState(false);
  const [isMasked, setIsMasked] = useState(true);
  const isFillParent = heightMode === 'fill-parent';

  const validation = useMemo<ValidationResult>(() => {
    if (language === 'json') return validateJson(value);
    if (language === 'toml') return validateToml(value);
    return { valid: true };
  }, [value, language]);

  const extensions = useMemo<Extension[]>(() => {
    const langExt =
      language === 'json' ? json() : language === 'yaml' ? yaml() : StreamLanguage.define(toml);
    return [
      langExt,
      EditorView.lineWrapping,
      sensitiveMaskTheme,
      makeSensitivePlugin(language),
      EditorView.theme({
        // Match the previous Prism overlay editor: 0.875rem mono, 1.625
        // line-height, 12px padding, transparent background so the parent
        // `bg-muted/30` shows through.
        '&': {
          fontSize: '0.875rem',
          backgroundColor: 'transparent',
        },
        '&.cm-focused': { outline: 'none' },
        '.cm-content': {
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          padding: '12px 0',
          caretColor: 'currentColor',
        },
        '.cm-line': {
          padding: '0 12px',
          lineHeight: '1.625',
        },
        '.cm-scroller': {
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          lineHeight: '1.625',
        },
        '.cm-gutters': { display: 'none' },
      }),
    ];
  }, [language]);

  return (
    <div
      className={cn('flex min-h-0 flex-col', isFillParent && 'h-full', className)}
      style={isFillParent ? { height: minHeight === 'auto' ? undefined : minHeight } : undefined}
      data-slot="code-editor-root"
    >
      <div
        className={cn(
          'relative rounded-md border overflow-hidden bg-muted/30',
          isFillParent && 'flex min-h-0 flex-1 flex-col',
          isFocused && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
          readonly && 'opacity-70',
          !validation.valid && 'border-destructive'
        )}
        data-slot="code-editor-surface"
      >
        <div
          className={cn(
            isFillParent ? 'scrollbar-editor min-h-0 flex-1 overflow-hidden' : undefined
          )}
          data-slot={isFillParent ? 'code-editor-viewport' : undefined}
        >
          <CodeMirror
            value={value}
            onChange={readonly ? undefined : onChange}
            readOnly={readonly}
            editable={!readonly}
            theme={isDark ? prismNightOwlTheme : prismGithubTheme}
            extensions={extensions}
            height={isFillParent ? '100%' : undefined}
            minHeight={isFillParent ? undefined : minHeight}
            basicSetup={{
              // Keep visual parity with the previous Prism overlay editor:
              // no gutter, no line numbers, no active-line tint.
              lineNumbers: false,
              foldGutter: false,
              highlightActiveLine: false,
              highlightActiveLineGutter: false,
              autocompletion: false,
              searchKeymap: true,
            }}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className={cn(
              'cm-editor-root',
              !isMasked && 'cm-sensitive-revealed',
              isFillParent && 'h-full'
            )}
            data-slot="code-editor-codemirror"
          />
        </div>

        <div className="absolute top-2 right-2 z-20 opacity-50 hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 bg-background/50 hover:bg-background border shadow-sm rounded-full"
            onClick={() => setIsMasked(!isMasked)}
            title={isMasked ? t('codeEditor.revealSensitive') : t('codeEditor.maskSensitive')}
          >
            {isMasked ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2 text-xs">
        {validation.valid ? (
          <span className="flex items-center gap-1 text-muted-foreground">
            <CheckCircle2 className="w-3 h-3 text-green-500" />
            {t('codeEditor.valid', { language: language.toUpperCase() })}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-destructive">
            <AlertCircle className="w-3 h-3" />
            {validation.error}
            {validation.line && ` (line ${validation.line})`}
          </span>
        )}
        {readonly && (
          <span className="ml-auto text-muted-foreground">{t('codeEditor.readOnly')}</span>
        )}
      </div>
    </div>
  );
}
