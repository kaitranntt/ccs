import { describe, expect, it } from 'bun:test';
import {
  buildReleaseIssueSet,
  extractIssueNumbers,
  extractPrNumbers,
  planIssueCleanup,
} from '../../../scripts/github/stable-release-issue-cleanup-lib.mjs';

describe('stable release issue cleanup', () => {
  it('extracts issue numbers from release action verbs', () => {
    const text = [
      'feat: promote dev to main (#1351), closes #1340 #1341',
      'fix: support aliases (#1197)',
      'Refs #760',
    ].join('\n');

    expect(extractIssueNumbers(text, { includeRefs: true })).toEqual([760, 1340, 1341]);
    expect(extractIssueNumbers(text, { includeRefs: false })).toEqual([1340, 1341]);
  });

  it('extracts PR numbers from merge and squash commit subjects', () => {
    const text = [
      'Merge pull request #1392 from kaitranntt/kai/fix/foo',
      'fix(analytics): tighten top-bar layout (#1391)',
    ].join('\n');

    expect(extractPrNumbers(text)).toEqual([1391, 1392]);
  });

  it('combines release body, commit text, and PR body issue references', () => {
    const result = buildReleaseIssueSet({
      releaseBody: 'closes #100',
      commitText: 'fix: thing (#10)',
      prText: 'Refs #200\nResolves #300',
    });

    expect(result.releaseIssues).toEqual([100, 200, 300]);
    expect(result.resolvedIssues).toEqual([100, 300]);
  });

  it('closes dev-released issues when promoted to stable even if the PR used refs', () => {
    const actions = planIssueCleanup({
      releaseIssues: [760],
      resolvedIssues: [],
      issueStates: new Map([[760, { state: 'OPEN', labels: ['released-dev'] }]]),
    });

    expect(actions[0]).toMatchObject({
      number: 760,
      addReleasedLabel: true,
      close: true,
      reason: 'promoted from dev to stable',
    });
  });

  it('does not close weak refs unless the issue was already marked released-dev', () => {
    const actions = planIssueCleanup({
      releaseIssues: [42],
      resolvedIssues: [],
      issueStates: new Map([[42, { state: 'OPEN', labels: ['enhancement'] }]]),
    });

    expect(actions[0]).toMatchObject({
      number: 42,
      addReleasedLabel: false,
      close: false,
    });
  });

  it('closes explicitly resolved issues without requiring a manual released label', () => {
    const actions = planIssueCleanup({
      releaseIssues: [1340],
      resolvedIssues: [1340],
      issueStates: new Map([[1340, { state: 'OPEN', labels: ['bug'] }]]),
    });

    expect(actions[0]).toMatchObject({
      number: 1340,
      addReleasedLabel: true,
      close: true,
      reason: 'resolved by stable release',
    });
  });
});
