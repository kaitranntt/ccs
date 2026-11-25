export interface MarkdownBlockHeading {
  type: 'heading';
  level: number;
  text: string;
}

export interface MarkdownBlockParagraph {
  type: 'paragraph';
  text: string;
}

export interface MarkdownBlockUnorderedList {
  type: 'unordered-list';
  items: string[];
}

export interface MarkdownBlockOrderedList {
  type: 'ordered-list';
  items: string[];
}

export interface MarkdownBlockCode {
  type: 'code';
  language: string;
  content: string;
}

export type MarkdownBlock =
  | MarkdownBlockHeading
  | MarkdownBlockParagraph
  | MarkdownBlockUnorderedList
  | MarkdownBlockOrderedList
  | MarkdownBlockCode;

export interface MarkdownFrontmatterEntry {
  key: string;
  value: string;
}

export interface ParsedMarkdownDocument {
  blocks: MarkdownBlock[];
  frontmatter: MarkdownFrontmatterEntry[];
}

export function formatFrontmatterLabel(key: string): string {
  return key.replace(/[-_]/g, ' ');
}

export function parseMarkdownDocument(content: string): ParsedMarkdownDocument {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return { blocks: [], frontmatter: [] };
  }

  let markdownBody = normalized;
  const frontmatter: MarkdownFrontmatterEntry[] = [];

  if (markdownBody.startsWith('---\n')) {
    const frontmatterEndIndex = markdownBody.indexOf('\n---\n', 4);
    if (frontmatterEndIndex !== -1) {
      const rawFrontmatter = markdownBody.slice(4, frontmatterEndIndex).trim();
      for (const line of rawFrontmatter.split('\n')) {
        const entryMatch = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.+)$/);
        if (!entryMatch) {
          continue;
        }

        frontmatter.push({
          key: entryMatch[1],
          value: entryMatch[2].trim().replace(/^['"]|['"]$/g, ''),
        });
      }

      markdownBody = markdownBody.slice(frontmatterEndIndex + 5).trim();
    }
  }

  return {
    blocks: parseMarkdownBlocks(markdownBody),
    frontmatter,
  };
}

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  if (!content.trim()) {
    return [];
  }

  const lines = content.split('\n');
  const blocks: MarkdownBlock[] = [];
  let paragraphLines: string[] = [];
  let unorderedItems: string[] = [];
  let orderedItems: string[] = [];
  let codeLanguage = '';
  let codeLines: string[] | null = null;

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }
    blocks.push({
      type: 'paragraph',
      text: paragraphLines.join(' '),
    });
    paragraphLines = [];
  };

  const flushUnorderedList = () => {
    if (unorderedItems.length === 0) {
      return;
    }
    blocks.push({
      type: 'unordered-list',
      items: unorderedItems,
    });
    unorderedItems = [];
  };

  const flushOrderedList = () => {
    if (orderedItems.length === 0) {
      return;
    }
    blocks.push({
      type: 'ordered-list',
      items: orderedItems,
    });
    orderedItems = [];
  };

  const flushCodeBlock = () => {
    if (!codeLines) {
      return;
    }
    blocks.push({
      type: 'code',
      language: codeLanguage,
      content: codeLines.join('\n'),
    });
    codeLanguage = '';
    codeLines = null;
  };

  for (const line of lines) {
    if (codeLines) {
      if (line.trim().startsWith('```')) {
        flushCodeBlock();
      } else {
        codeLines.push(line);
      }
      continue;
    }

    if (line.trim().startsWith('```')) {
      flushParagraph();
      flushUnorderedList();
      flushOrderedList();
      codeLanguage = line.trim().replace(/^```/, '').trim();
      codeLines = [];
      continue;
    }

    if (line.trim().length === 0) {
      flushParagraph();
      flushUnorderedList();
      flushOrderedList();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushUnorderedList();
      flushOrderedList();
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      continue;
    }

    const unorderedMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (unorderedMatch) {
      flushParagraph();
      flushOrderedList();
      unorderedItems.push(unorderedMatch[1].trim());
      continue;
    }

    const orderedMatch = line.match(/^\s*\d+\.\s+(.*)$/);
    if (orderedMatch) {
      flushParagraph();
      flushUnorderedList();
      orderedItems.push(orderedMatch[1].trim());
      continue;
    }

    flushUnorderedList();
    flushOrderedList();
    paragraphLines.push(line.trim());
  }

  flushParagraph();
  flushUnorderedList();
  flushOrderedList();
  flushCodeBlock();
  return blocks;
}
