import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ISSUE_REF_PATTERN = /#([0-9]+)/g;
const ACTION_VERB_PATTERN = /\b(fixes|closes|resolves|refs?)\b(.*)/gi;
const RESOLVE_VERB_PATTERN = /\b(fixes|closes|resolves)\b(.*)/gi;
const PR_REF_PATTERN = /(?:Merge pull request #|\(#)([0-9]+)/g;
const STABLE_TAG_PATTERN = /^v[0-9]+\.[0-9]+\.[0-9]+$/;

export function extractIssueNumbers(text, { includeRefs = true } = {}) {
  const pattern = includeRefs ? ACTION_VERB_PATTERN : RESOLVE_VERB_PATTERN;
  const issues = new Set();
  let actionMatch;

  pattern.lastIndex = 0;
  while ((actionMatch = pattern.exec(text || '')) !== null) {
    const tail = actionMatch[2] || '';
    let issueMatch;
    ISSUE_REF_PATTERN.lastIndex = 0;
    while ((issueMatch = ISSUE_REF_PATTERN.exec(tail)) !== null) {
      issues.add(Number(issueMatch[1]));
    }
  }

  return [...issues].sort((a, b) => a - b);
}

export function extractPrNumbers(text) {
  const prs = new Set();
  let match;

  PR_REF_PATTERN.lastIndex = 0;
  while ((match = PR_REF_PATTERN.exec(text || '')) !== null) {
    prs.add(Number(match[1]));
  }

  return [...prs].sort((a, b) => a - b);
}

export function planIssueCleanup({ releaseIssues, resolvedIssues, issueStates }) {
  const resolved = new Set(resolvedIssues);
  return releaseIssues.map((number) => {
    const state = issueStates.get(number) || { labels: [], state: 'UNKNOWN' };
    const labels = new Set(state.labels);
    const wasReleasedDev = labels.has('released-dev');
    const shouldClose = state.state === 'OPEN' && (wasReleasedDev || resolved.has(number));

    return {
      number,
      removeLabels: ['released-dev', 'pending-release'],
      addReleasedLabel: shouldClose,
      close: shouldClose,
      reason: wasReleasedDev ? 'promoted from dev to stable' : 'resolved by stable release',
    };
  });
}

export function getStableReleaseContext({ env = process.env, exec = runCommand } = {}) {
  const repo = env.GITHUB_REPOSITORY;
  if (!repo) throw new Error('GITHUB_REPOSITORY is required');

  const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const currentTag = `v${version}`;
  const releaseBody = exec('gh', [
    'release',
    'view',
    currentTag,
    '--repo',
    repo,
    '--json',
    'body',
    '--jq',
    '.body',
  ]);
  const tags = exec('git', ['tag', '-l', 'v[0-9]*.[0-9]*.[0-9]*', '--sort=-v:refname'])
    .split('\n')
    .map((tag) => tag.trim())
    .filter((tag) => STABLE_TAG_PATTERN.test(tag) && tag !== currentTag);
  const previousStableTag = tags[0] || '';
  const range = previousStableTag ? `${previousStableTag}..HEAD~1` : 'HEAD~50..HEAD~1';
  const commitText = exec('git', ['log', range, '--pretty=format:%s%n%b'], { optional: true });

  return { repo, version, currentTag, releaseBody, range, commitText };
}

export function buildReleaseIssueSet({ releaseBody, commitText, prText }) {
  const releaseIssues = new Set([
    ...extractIssueNumbers(releaseBody, { includeRefs: true }),
    ...extractIssueNumbers(commitText, { includeRefs: true }),
    ...extractIssueNumbers(prText, { includeRefs: true }),
  ]);
  const resolvedIssues = new Set([
    ...extractIssueNumbers(releaseBody, { includeRefs: false }),
    ...extractIssueNumbers(commitText, { includeRefs: false }),
    ...extractIssueNumbers(prText, { includeRefs: false }),
  ]);

  return {
    releaseIssues: [...releaseIssues].sort((a, b) => a - b),
    resolvedIssues: [...resolvedIssues].sort((a, b) => a - b),
  };
}

export function runCommand(command, args, { optional = false } = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    if (optional) return '';
    throw new Error(
      `${command} ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`
    );
  }
  return result.stdout.trim();
}
