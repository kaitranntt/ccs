import { describe, expect, test } from 'bun:test';

const rule = require('../../../eslint-rules/no-new-throw-error.js');

/**
 * P7 rule test: no-new-throw-error flags NEW throw new Error(...) sites not in
 * the baseline allowlist, while grandfathered sites, typed throws, and
 * re-throws pass.
 *
 * Exercises the rule's create() directly with a mock context and AST node so
 * the test does not depend on the ESLint runtime under bun. The live
 * `bun run lint` already proves the ESLint integration end-to-end (0 violations
 * against the generated baseline).
 */
describe('ccs/no-new-throw-error rule logic', () => {
  const FILENAME = 'src/sample/fixture.ts';

  function node(argument: unknown, line: number) {
    return {
      type: 'ThrowStatement',
      loc: { start: { line, column: 0 } },
      argument,
    };
  }

  function runRule(throwNode: unknown, allowlist: string[]): Array<{ messageId: string }> {
    const reports: Array<{ messageId: string }> = [];
    const context = {
      options: [{ allowlist }],
      getFilename: () => FILENAME,
      report: (r: { messageId: string }) => reports.push(r),
    };
    const visitors = rule.create(context);
    visitors.ThrowStatement(throwNode);
    return reports;
  }

  const newErrorArg = { type: 'NewExpression', callee: { type: 'Identifier', name: 'Error' } };
  const newTypedArg = { type: 'NewExpression', callee: { type: 'Identifier', name: 'ConfigError' } };
  const rethrowArg = { type: 'Identifier', name: 'err' };

  test('flags a throw new Error off the allowlist', () => {
    expect(runRule(node(newErrorArg, 1), []).some((r) => r.messageId === 'unexpected')).toBe(true);
  });

  test('passes a throw new Error that is on the allowlist (file:line match)', () => {
    expect(runRule(node(newErrorArg, 1), [`${FILENAME}:1`]).some((r) => r.messageId === 'unexpected')).toBe(
      false
    );
  });

  test('flags when the throw line differs from the allowlisted line', () => {
    expect(runRule(node(newErrorArg, 2), [`${FILENAME}:1`]).some((r) => r.messageId === 'unexpected')).toBe(
      true
    );
  });

  test('passes typed throws (ConfigError / AuthError)', () => {
    const typed = { type: 'NewExpression', callee: { type: 'Identifier', name: 'AuthError' } };
    expect(runRule(node(typed, 1), []).some((r) => r.messageId === 'unexpected')).toBe(false);
    expect(runRule(node(newTypedArg, 1), []).some((r) => r.messageId === 'unexpected')).toBe(false);
  });

  test('passes re-throws and non-NewExpression throws', () => {
    expect(runRule(node(rethrowArg, 1), []).some((r) => r.messageId === 'unexpected')).toBe(false);
  });
});
