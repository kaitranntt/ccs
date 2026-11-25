import { type ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatFrontmatterLabel, parseMarkdownDocument } from './markdown-parser';

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const inlinePattern = /(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\))/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let tokenIndex = 0;

  for (const match of text.matchAll(inlinePattern)) {
    const fullMatch = match[0];
    const offset = match.index ?? 0;

    if (offset > cursor) {
      nodes.push(text.slice(cursor, offset));
    }

    if (match[2]) {
      nodes.push(
        <strong key={`${keyPrefix}-strong-${tokenIndex}`} className="font-semibold">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      nodes.push(
        <code
          key={`${keyPrefix}-code-${tokenIndex}`}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.82em]"
        >
          {match[3]}
        </code>
      );
    } else if (match[4]) {
      nodes.push(
        <em key={`${keyPrefix}-em-${tokenIndex}`} className="italic">
          {match[4]}
        </em>
      );
    } else if (match[5] && match[6]) {
      const href = match[6].trim();
      if (/^(https?:\/\/|mailto:)/i.test(href)) {
        nodes.push(
          <a
            key={`${keyPrefix}-link-${tokenIndex}`}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2 hover:opacity-90"
          >
            {match[5]}
          </a>
        );
      } else {
        nodes.push(match[5]);
      }
    } else {
      nodes.push(fullMatch);
    }

    cursor = offset + fullMatch.length;
    tokenIndex += 1;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  if (nodes.length === 0) {
    return [text];
  }

  return nodes;
}

export function MarkdownViewer({ content }: { content: string }) {
  const { t } = useTranslation();
  const parsedDocument = useMemo(() => parseMarkdownDocument(content), [content]);

  if (parsedDocument.blocks.length === 0 && parsedDocument.frontmatter.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('sharedPage.noMarkdown')}</p>;
  }

  return (
    <div className="space-y-5">
      {parsedDocument.frontmatter.length > 0 ? (
        <div className="rounded-md border bg-muted/35 p-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {parsedDocument.frontmatter.map((entry) => (
              <div key={`${entry.key}:${entry.value}`} className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {formatFrontmatterLabel(entry.key)}
                </p>
                <p className="text-xs mt-1 break-words">{entry.value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {parsedDocument.blocks.map((block, index) => {
        if (block.type === 'heading') {
          const headingClass =
            block.level <= 1
              ? 'text-xl font-semibold'
              : block.level === 2
                ? 'text-lg font-semibold'
                : 'text-base font-semibold';

          return (
            <h3 key={`heading-${index}`} className={headingClass}>
              {renderInlineMarkdown(block.text, `heading-${index}`)}
            </h3>
          );
        }

        if (block.type === 'paragraph') {
          return (
            <p key={`paragraph-${index}`} className="text-sm leading-6 whitespace-pre-wrap">
              {renderInlineMarkdown(block.text, `paragraph-${index}`)}
            </p>
          );
        }

        if (block.type === 'unordered-list') {
          return (
            <ul key={`ul-${index}`} className="list-disc pl-5 space-y-1 text-sm leading-6">
              {block.items.map((item, itemIndex) => (
                <li key={`ul-item-${index}-${itemIndex}`}>
                  {renderInlineMarkdown(item, `ul-item-${index}-${itemIndex}`)}
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === 'ordered-list') {
          return (
            <ol key={`ol-${index}`} className="list-decimal pl-5 space-y-1 text-sm leading-6">
              {block.items.map((item, itemIndex) => (
                <li key={`ol-item-${index}-${itemIndex}`}>
                  {renderInlineMarkdown(item, `ol-item-${index}-${itemIndex}`)}
                </li>
              ))}
            </ol>
          );
        }

        return (
          <div
            key={`code-${index}`}
            className="rounded-md border bg-muted/60 p-3 font-mono text-xs leading-5 overflow-x-auto"
          >
            {block.language && (
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
                {block.language}
              </div>
            )}
            <pre className="whitespace-pre-wrap break-words m-0">{block.content}</pre>
          </div>
        );
      })}
    </div>
  );
}
