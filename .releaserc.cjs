/**
 * Semantic Release Configuration
 *
 * Branch-aware config:
 * - dev branch: Uses dev release configuration (prerelease)
 * - main branch: Uses production release configuration
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
// Every merge to main auto-cuts as vX.Y.Z-rc.N (prerelease channel "rc").
// A separate promote-release.yml workflow_dispatch promotes a specific rc tag
// to stable by flipping the GitHub release to non-prerelease, which triggers
// docker-release.yml to add the mutable :latest/:MAJOR/:MINOR Docker tags.
// See docs/release-process.md for the full soak + promote procedure.
const productionConfig = {
  branches: [
    {
      name: 'main',
      prerelease: 'rc',
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
        // rc releases are prerelease — use a minimal comment; stable promotion
        // gets the full resolution comment via the promote-release workflow.
        successComment:
          'This issue is included in pre-release version ${nextRelease.version}. A stable release will follow after the rc soak period.',
        releasedLabels: ['pending-release'],
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
