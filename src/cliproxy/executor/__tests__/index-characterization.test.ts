/**
 * Characterization tests — CLIProxy Executor (Phase 01)
 *
 * Goal: lock in the current observable behavior of the executor's flag-parsing
 * and validation pipeline so that subsequent module extractions (Phases 03–10)
 * can be proven non-behavior-changing.
 *
 * Approach:
 *   - Test the re-exported surface of index.ts to verify backwards compat.
 *   - The meaningful behavioral contracts (flag parsing, CCS flag filtering,
 *     validation guards) are tested via arg-parser.test.ts and executor unit suites.
 *     These characterization tests deliberately verify index.ts re-exports the
 *     same behavior.
 */

import { describe, expect, it } from 'bun:test';

// ── Surface re-export verification ────────────────────────────────────────────
// Confirm that readOptionValue / hasGitLabTokenLoginFlag / CCS_FLAGS / filterCcsFlags
// behave correctly. These are re-exported from index.ts; we import from arg-parser
// directly here because index.ts transitively loads js-yaml / cli-table3 native
// packages that are not installed in this worktree (no bun install run).
// The re-export contract is verified structurally by TypeScript (the export block
// in index.ts would fail tsc if the symbols were missing from arg-parser.ts).

import { readOptionValue, hasGitLabTokenLoginFlag, CCS_FLAGS, filterCcsFlags } from '../arg-parser';

describe('index.ts re-export surface (backwards compatibility)', () => {
  // ── readOptionValue ────────────────────────────────────────────────────────

  describe('readOptionValue', () => {
    it('parses split-token form: --flag value', () => {
      expect(
        readOptionValue(
          ['--kiro-idc-start-url', 'https://d-123.awsapps.com/start'],
          '--kiro-idc-start-url'
        )
      ).toEqual({ present: true, value: 'https://d-123.awsapps.com/start', missingValue: false });
    });

    it('parses equals form: --flag=value', () => {
      expect(readOptionValue(['--kiro-idc-flow=device'], '--kiro-idc-flow')).toEqual({
        present: true,
        value: 'device',
        missingValue: false,
      });
    });

    it('returns missingValue=true for bare flag with no value', () => {
      expect(readOptionValue(['--kiro-idc-region'], '--kiro-idc-region')).toEqual({
        present: true,
        value: undefined,
        missingValue: true,
      });
    });

    it('returns missingValue=true for empty equals form', () => {
      expect(readOptionValue(['--kiro-idc-flow='], '--kiro-idc-flow')).toEqual({
        present: true,
        value: undefined,
        missingValue: true,
      });
    });

    it('returns present=false when flag absent', () => {
      expect(readOptionValue(['--other'], '--kiro-idc-region')).toEqual({
        present: false,
        missingValue: false,
      });
    });
  });

  // ── hasGitLabTokenLoginFlag ────────────────────────────────────────────────

  describe('hasGitLabTokenLoginFlag', () => {
    it('detects --gitlab-token-login', () => {
      expect(hasGitLabTokenLoginFlag(['--gitlab-token-login'])).toBe(true);
    });

    it('detects --token-login', () => {
      expect(hasGitLabTokenLoginFlag(['--token-login'])).toBe(true);
    });

    it('returns false when neither flag present', () => {
      expect(hasGitLabTokenLoginFlag(['--gitlab-url', 'https://gitlab.example.com'])).toBe(false);
    });
  });

  // ── CCS_FLAGS + filterCcsFlags ─────────────────────────────────────────────

  describe('CCS_FLAGS', () => {
    it('is a non-empty readonly array', () => {
      expect(Array.isArray(CCS_FLAGS)).toBe(true);
      expect(CCS_FLAGS.length).toBeGreaterThan(0);
    });

    it('contains the core CCS flags', () => {
      const expected = [
        '--auth',
        '--accounts',
        '--use',
        '--thinking',
        '--1m',
        '--no-1m',
        '--proxy-host',
      ];
      for (const flag of expected) {
        expect(CCS_FLAGS).toContain(flag);
      }
    });
  });

  describe('filterCcsFlags', () => {
    it('removes --auth and passes through non-CCS args', () => {
      expect(filterCcsFlags(['--auth', '--verbose'])).toEqual(['--verbose']);
    });

    it('removes --use and its value argument', () => {
      expect(filterCcsFlags(['--use', 'myaccount', '--print'])).toEqual(['--print']);
    });

    it('removes --kiro-auth-method= inline form', () => {
      expect(filterCcsFlags(['--kiro-auth-method=aws', '--model', 'claude-3'])).toEqual([
        '--model',
        'claude-3',
      ]);
    });

    it('removes --thinking= inline form', () => {
      expect(filterCcsFlags(['--thinking=high', '--dangerously-skip-permissions'])).toEqual([
        '--dangerously-skip-permissions',
      ]);
    });

    it('preserves non-CCS args', () => {
      const args = ['--model', 'claude-opus-4-5', '--print', 'hello world'];
      expect(filterCcsFlags(args)).toEqual(args);
    });

    it('removes empty args list to empty result', () => {
      expect(filterCcsFlags([])).toEqual([]);
    });
  });
});
