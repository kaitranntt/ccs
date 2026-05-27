import {
  buildReleaseIssueSet,
  extractPrNumbers,
  getStableReleaseContext,
  planIssueCleanup,
  runCommand,
} from './stable-release-issue-cleanup-lib.mjs';

function gh(args, options) {
  return runCommand('gh', args, options);
}

function fetchPrText(repo, commitText) {
  let prText = '';
  for (const prNumber of extractPrNumbers(commitText)) {
    const details = gh(
      [
        'pr',
        'view',
        String(prNumber),
        '--repo',
        repo,
        '--json',
        'title,body',
        '--jq',
        '.title + "\n" + (.body // "")',
      ],
      { optional: true }
    );
    if (details) prText += `\n${details}`;
  }
  return prText;
}

function fetchIssueStates(repo, issueNumbers) {
  const states = new Map();
  for (const number of issueNumbers) {
    const raw = gh(
      [
        'issue',
        'view',
        String(number),
        '--repo',
        repo,
        '--json',
        'state,labels',
        '--jq',
        '{state:.state,labels:[.labels[].name]}',
      ],
      { optional: true }
    );
    if (!raw) continue;
    states.set(number, JSON.parse(raw));
  }
  return states;
}

function ensureReleasedLabel(repo) {
  gh(
    [
      'label',
      'create',
      'released',
      '--color',
      'ededed',
      '--description',
      'Fix available in stable npm channel',
      '--repo',
      repo,
    ],
    { optional: true }
  );
}

function applyAction(repo, action) {
  console.log(`Cleaning release state on issue #${action.number}`);
  for (const label of action.removeLabels) {
    gh(['issue', 'edit', String(action.number), '--remove-label', label, '--repo', repo], {
      optional: true,
    });
  }

  if (!action.close) return;

  gh(['issue', 'edit', String(action.number), '--add-label', 'released', '--repo', repo], {
    optional: true,
  });
  gh(
    [
      'issue',
      'close',
      String(action.number),
      '--comment',
      '[bot] Closing issue because this fix/feature is now in stable release (@latest).',
      '--repo',
      repo,
    ],
    { optional: true }
  );
  console.log(`Closed issue #${action.number}: ${action.reason}`);
}

export function main() {
  const context = getStableReleaseContext();
  console.log(`Checking stable release issue lifecycle for ${context.currentTag}`);
  console.log(`Checking commits in range: ${context.range}`);

  const prText = fetchPrText(context.repo, context.commitText);
  const { releaseIssues, resolvedIssues } = buildReleaseIssueSet({
    releaseBody: context.releaseBody,
    commitText: context.commitText,
    prText,
  });

  if (releaseIssues.length === 0) {
    console.log(`No release-scoped issues found for ${context.currentTag}`);
    return;
  }

  ensureReleasedLabel(context.repo);
  const issueStates = fetchIssueStates(context.repo, releaseIssues);
  for (const action of planIssueCleanup({ releaseIssues, resolvedIssues, issueStates })) {
    applyAction(context.repo, action);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
