/**
 * Semantic Release Configuration
 *
 * Branch-aware config:
 * - dev branch: Uses dev release configuration (prerelease)
 * - main branch: Uses production release configuration (stable, npm @latest)
 *
 * RC soak window for Docker mutable tags is handled entirely in docker-release.yml:
 * every release event publishes the immutable :<ver> Docker tag immediately;
 * mutable :latest/:MAJOR/:MINOR tags require an explicit operator action via
 * `gh workflow run promote-release.yml -f tag=vX.Y.Z` (workflow_dispatch).
 * npm @latest is always set immediately on stable release — no rc soak needed.
 */

const currentBranch =
  process.env.GITHUB_REF_NAME ||
  process.env.GIT_BRANCH ||
  (process.env.GITHUB_REF && process.env.GITHUB_REF.replace('refs/heads/', '')) ||
  require('child_process').execSync('git rev-parse --abbrev-ref HEAD').toString().trim();

console.error(`[semantic-release config] Branch: ${currentBranch}`);

// Shared plugin config
const commitAnalyzer = [
  '@semantic-release/commit-analyzer',
  {
    preset: 'conventionalcommits',
    releaseRules: [
      { type: 'hotfix', release: 'patch' },
      { type: 'docs', scope: 'README', release: 'patch' },
      { type: 'refactor', release: 'patch' },
      { type: 'style', release: 'patch' },
    ],
  },
];

const releaseNotesGenerator = [
  '@semantic-release/release-notes-generator',
  {
    preset: 'conventionalcommits',
    presetConfig: {
      types: [
        { type: 'feat', section: 'Features' },
        { type: 'fix', section: 'Bug Fixes' },
        { type: 'hotfix', section: 'Hotfixes' },
        // Breaking changes (feat! / fix!) surface under Features/Bug Fixes
        // with a BREAKING CHANGE footer note — no separate section needed.
        { type: 'revert', section: 'Reverts' },
        { type: 'docs', section: 'Documentation' },
        { type: 'style', section: 'Styles' },
        { type: 'refactor', section: 'Code Refactoring' },
        { type: 'perf', section: 'Performance Improvements' },
        { type: 'test', section: 'Tests' },
        { type: 'build', section: 'Build System' },
        { type: 'ci', section: 'CI' },
        // chore commits are intentionally hidden from release notes (no section).
        // "### Removed" sections come from feat!/fix! BREAKING CHANGE footers,
        // not from a separate commit type.
      ],
    },
  },
];

// Dev release configuration
const devConfig = {
  branches: [
    'main', // Required even in dev config
    {
      name: 'dev',
      prerelease: 'dev',
    },
  ],
  plugins: [
    commitAnalyzer,
    releaseNotesGenerator,
    [
      '@semantic-release/changelog',
      {
        changelogFile: 'CHANGELOG.md',
      },
    ],
    '@semantic-release/npm',
    [
      '@semantic-release/github',
      {
        prerelease: true,
        // Disable automatic success comment - custom step in dev-release.yml handles this
        successComment: false,
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', 'package.json'],
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
  ],
};

// Production release configuration
// Every merge to main publishes a stable vX.Y.Z release immediately to npm @latest.
// Docker immutable :<ver> tag is pushed by docker-release.yml on the release: published event.
// Docker mutable :latest/:MAJOR/:MINOR tags require a separate manual promote step — see
// docs/release-process.md and promote-release.yml for the soak + promote procedure.
const productionConfig = {
  branches: ['main'],
  plugins: [
    commitAnalyzer,
    releaseNotesGenerator,
    [
      '@semantic-release/changelog',
      {
        changelogFile: 'CHANGELOG.md',
      },
    ],
    '@semantic-release/npm',
    [
      '@semantic-release/github',
      {
        successComment:
          ':tada: This issue has been resolved in version ${nextRelease.version} :tada:\n\nThe release is available on:\n- [npm package (@latest)](https://www.npmjs.com/package/@kaitranntt/ccs)\n- [GitHub release](${releases[0].url})',
        releasedLabels: ['released'],
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', 'package.json'],
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
  ],
};

const config = currentBranch === 'dev' ? devConfig : productionConfig;

console.error(`[semantic-release config] Using ${currentBranch === 'dev' ? 'DEV' : 'PRODUCTION'} config`);

module.exports = config;
