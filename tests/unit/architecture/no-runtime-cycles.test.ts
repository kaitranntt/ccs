import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

const REPO_ROOT = path.resolve(import.meta.dir, '../../..');
const SRC_ROOT = path.join(REPO_ROOT, 'src');

function collectRuntimeSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') {
        continue;
      }
      collectRuntimeSourceFiles(fullPath, out);
      continue;
    }

    if (
      entry.isFile() &&
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.d.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.spec.ts')
    ) {
      out.push(fullPath);
    }
  }

  return out;
}

function resolveRelativeModule(
  fromFile: string,
  specifier: string,
  fileSet: ReadonlySet<string>
): string | null {
  if (!specifier.startsWith('.')) {
    return null;
  }

  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    base,
  ];

  for (const candidate of candidates) {
    if (fileSet.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

function extractRuntimeStaticImports(
  filePath: string,
  fileSet: ReadonlySet<string>
): Set<string> {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const targets = new Set<string>();

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      if (clause?.isTypeOnly) {
        return;
      }
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        const elements = clause.namedBindings.elements;
        if (elements.length > 0 && elements.every((element) => element.isTypeOnly) && !clause.name) {
          return;
        }
      }
      if (ts.isStringLiteral(node.moduleSpecifier)) {
        const target = resolveRelativeModule(filePath, node.moduleSpecifier.text, fileSet);
        if (target && target !== filePath) {
          targets.add(target);
        }
      }
      return;
    }

    if (ts.isExportDeclaration(node)) {
      if (node.isTypeOnly) {
        return;
      }
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        const elements = node.exportClause.elements;
        if (elements.length > 0 && elements.every((element) => element.isTypeOnly)) {
          return;
        }
      }
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const target = resolveRelativeModule(filePath, node.moduleSpecifier.text, fileSet);
        if (target && target !== filePath) {
          targets.add(target);
        }
      }
      return;
    }

    if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if (isDynamicImport || isRequire) {
        const firstArg = node.arguments[0];
        if (firstArg && ts.isStringLiteral(firstArg)) {
          const target = resolveRelativeModule(filePath, firstArg.text, fileSet);
          if (target && target !== filePath) {
            targets.add(target);
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return targets;
}

function findCircularSccs(adjacency: ReadonlyMap<string, ReadonlySet<string>>): string[][] {
  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];

  function strongConnect(vertex: string): void {
    indices.set(vertex, index);
    lowlink.set(vertex, index);
    index += 1;
    stack.push(vertex);
    onStack.add(vertex);

    for (const neighbor of adjacency.get(vertex) ?? []) {
      if (!indices.has(neighbor)) {
        strongConnect(neighbor);
        lowlink.set(vertex, Math.min(lowlink.get(vertex)!, lowlink.get(neighbor)!));
      } else if (onStack.has(neighbor)) {
        lowlink.set(vertex, Math.min(lowlink.get(vertex)!, indices.get(neighbor)!));
      }
    }

    if (lowlink.get(vertex) === indices.get(vertex)) {
      const component: string[] = [];
      while (true) {
        const member = stack.pop()!;
        onStack.delete(member);
        component.push(member);
        if (member === vertex) {
          break;
        }
      }
      if (component.length > 1) {
        sccs.push(component.map((file) => path.relative(SRC_ROOT, file)).sort());
      }
    }
  }

  for (const vertex of adjacency.keys()) {
    if (!indices.has(vertex)) {
      strongConnect(vertex);
    }
  }

  return sccs;
}

describe('architecture: runtime dependency graph', () => {
  it('has zero runtime circular strongly connected components in src/', () => {
    const files = collectRuntimeSourceFiles(SRC_ROOT);
    const fileSet = new Set(files);
    const adjacency = new Map<string, Set<string>>();

    for (const file of files) {
      adjacency.set(file, extractRuntimeStaticImports(file, fileSet));
    }

    const circularSccs = findCircularSccs(adjacency);
    expect(circularSccs).toEqual([]);
  });
});
