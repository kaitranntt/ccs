import { describe, expect, test } from 'bun:test';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  classifyThrows,
  countConsoleErrors,
  hasCreateLogger,
  countLoc,
  collectMaintainabilityMetrics,
} = require('../../../scripts/maintainability-metrics.js');

describe('maintainability-metrics.classifyThrows', () => {
  test('counts plain Error, typed, and other throws; ignores re-throws', () => {
    const source = [
      'throw new Error("plain");',
      'throw new ConfigError("typed-a");',
      'throw new AuthError("typed-b");',
      'throw new FoobarError("other");',
      'throw rethrownErr;', // not `throw new`, ignored
    ].join('\n');

    const result = classifyThrows(source);
    expect(result.total).toBe(4);
    expect(result.plain).toBe(1);
    expect(result.typed).toBe(2);
    expect(result.other).toBe(1);
  });

  test('ignores throws inside comments and string/template literals', () => {
    const source = [
      '// throw new Error("commented")',
      'const s = "throw new Error(\\"in string\\")";',
      'const t = `throw new Error("in template")`;',
      '/* throw new Error("block") */',
      'throw new NetworkError("real");',
    ].join('\n');

    const result = classifyThrows(source);
    expect(result.total).toBe(1);
    expect(result.typed).toBe(1);
  });
});

describe('maintainability-metrics.countConsoleErrors', () => {
  test('counts console.error and console.warn, ignores log/info/debug', () => {
    const source = [
      'console.error("a");',
      'console . warn("b");', // tolerate whitespace
      'console.log("c");',
      'console.info("d");',
      'console.debug("e");',
      '// console.error("commented")',
    ].join('\n');

    expect(countConsoleErrors(source)).toBe(2);
  });
});

describe('maintainability-metrics.hasCreateLogger', () => {
  test('detects createLogger adoption and ignores comments', () => {
    expect(hasCreateLogger("const logger = createLogger('foo:bar');")).toBe(true);
    expect(hasCreateLogger('console.log("no logger here");')).toBe(false);
    expect(hasCreateLogger('// const logger = createLogger("commented");')).toBe(false);
  });
});

describe('maintainability-metrics.countLoc', () => {
  test('counts raw lines with wc -l semantics', () => {
    expect(countLoc('a\nb\nc')).toBe(3);
    expect(countLoc('a\nb\nc\n')).toBe(3); // trailing newline -> still 3
    expect(countLoc('')).toBe(0);
  });
});

describe('maintainability-metrics.collectMaintainabilityMetrics (fixtures tree)', () => {
  test('aggregates throws, console errors, logger coverage, and LOC over a tree', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mtep-fix-'));

    // src/auth/a.ts: 1 typed throw, 1 hotpath console.error, no createLogger
    fs.mkdirSync(path.join(root, 'src', 'auth'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'src', 'auth', 'a.ts'),
      [
        "import { AuthError } from '../../errors/error-types';",
        "throw new AuthError('typed');",
        "console.error('hotpath diagnostic');",
      ].join('\n')
    );

    // src/commands/b.ts: 1 plain throw, 1 console.error (CLI-UX exempt), no createLogger
    fs.mkdirSync(path.join(root, 'src', 'commands'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'src', 'commands', 'b.ts'),
      ['console.error(\'cli print\');', "throw new Error('plain');"].join('\n')
    );

    // src/cliproxy/quota/q.ts: createLogger present, 1 plain throw, 0 console.error
    fs.mkdirSync(path.join(root, 'src', 'cliproxy', 'quota'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'src', 'cliproxy', 'quota', 'q.ts'),
      ["import { createLogger } from '../../../services/logging';", 'const logger = createLogger();', "throw new Error('quota plain');"].join('\n')
    );

    // non-source file is ignored
    fs.writeFileSync(path.join(root, 'src', 'auth', 'README.md'), '# not source\n');

    // test file is ignored (would otherwise inflate console.error)
    fs.mkdirSync(path.join(root, 'src', 'auth', '__tests__'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'src', 'auth', '__tests__', 'a.test.ts'),
      "console.error('test noise');\n"
    );

    const metrics = collectMaintainabilityMetrics(root);

    // throws: typed 1 (AuthError), plain 2 (Error x2), other 0
    expect(metrics.typedErrors.totalThrows).toBe(3);
    expect(metrics.typedErrors.typedThrows).toBe(1);
    expect(metrics.typedErrors.plainThrows).toBe(2);

    // console errors: total 2 non-test (auth + commands); exempt 1 (commands); hotpath 1 (auth)
    expect(metrics.hotpathConsoleErrors.totalOccurrences).toBe(2);
    expect(metrics.hotpathConsoleErrors.exemptOccurrences).toBe(1);
    expect(metrics.hotpathConsoleErrors.hotpathOccurrences).toBe(1);
    expect(metrics.hotpathConsoleErrors.filesAffected).toBe(1);

    // logger coverage: 3 source files, 1 with createLogger (cliproxy/quota)
    expect(metrics.loggerCoverage.totalSourceFiles).toBe(3);
    expect(metrics.loggerCoverage.filesWithCreateLogger).toBe(1);
    expect(metrics.loggerCoverage.subdomainsWithZeroCreateLogger).toContain('auth');

    // P4 LOCKED denominator: auth (1 typed / 1 total) + cliproxy/quota (0 typed / 1 total)
    // -> numerator 1, denominator 2
    expect(metrics.typedErrorAdoption.subdomains).toEqual([
      'cliproxy/quota',
      'cliproxy/auth',
      'web-server/routes',
      'auth',
    ]);
    expect(metrics.typedErrorAdoption.numerator).toBe(1);
    expect(metrics.typedErrorAdoption.denominator).toBe(2);

    fs.rmSync(root, { recursive: true, force: true });
  });
});
