/**
 * Table Rendering
 *
 * Styled table output with cli-table3
 * @module utils/ui/tables
 */

import type { TableOptions } from '../../types/utils';
import { color } from './colors';

// cli-table3 is CommonJS; lazy-load on first table() render to keep CLI startup lean.
let TableConstructor:
  | (new (config: Record<string, unknown>) => {
      push: (row: string[]) => void;
      toString: () => string;
    })
  | null = null;

function getTableConstructor() {
  if (!TableConstructor) {
    const loaded = require('cli-table3') as NonNullable<typeof TableConstructor>;
    TableConstructor = loaded;
    return loaded;
  }
  return TableConstructor;
}

/**
 * Create styled table
 */
export function table(rows: string[][], options: TableOptions = {}): string {
  const style = options.style ?? 'ascii';
  // Build table configuration
  const tableConfig: Record<string, unknown> = {
    wordWrap: options.wordWrap ?? true,
    chars:
      style === 'unicode'
        ? {
            top: '─',
            'top-mid': '┬',
            'top-left': '┌',
            'top-right': '┐',
            bottom: '─',
            'bottom-mid': '┴',
            'bottom-left': '└',
            'bottom-right': '┘',
            left: '│',
            'left-mid': '├',
            mid: '─',
            'mid-mid': '┼',
            right: '│',
            'right-mid': '┤',
            middle: '│',
          }
        : {
            top: '-',
            'top-mid': '+',
            'top-left': '+',
            'top-right': '+',
            bottom: '-',
            'bottom-mid': '+',
            'bottom-left': '+',
            'bottom-right': '+',
            left: '|',
            'left-mid': '+',
            mid: '-',
            'mid-mid': '+',
            right: '|',
            'right-mid': '+',
            middle: '|',
          },
  };

  // Only add head if provided (cli-table3 requires head length to match rows)
  if (options.head && options.head.length > 0) {
    tableConfig.head = options.head.map((h: string) => color(h, 'primary'));
  }

  // Only add colWidths if provided
  if (options.colWidths) {
    tableConfig.colWidths = options.colWidths;
  }

  const Table = getTableConstructor();
  const tableInstance = new Table(tableConfig);

  rows.forEach((row) => tableInstance.push(row));
  return tableInstance.toString();
}
