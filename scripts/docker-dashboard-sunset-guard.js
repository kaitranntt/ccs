#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

function parseStableVersion(value) {
  const match = String(value || '').match(/^v?([0-9]+)\.([0-9]+)\.([0-9]+)$/);
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    raw: `v${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`,
  };
}

function compareVersions(left, right) {
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) {
      return left[key] - right[key];
    }
  }
  return 0;
}

function stableVersionKey(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    const key = arg.slice(2);
    if (key === 'tags-stdin') {
      args.tagsStdin = true;
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

function readStableTagsFromGit() {
  const output = execFileSync('git', ['tag', '--list', 'v*'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return output.split(/\r?\n/).filter(Boolean);
}

function parseStableTags(tags) {
  const byKey = new Map();
  for (const tag of tags) {
    const version = parseStableVersion(tag.trim());
    if (version) {
      byKey.set(stableVersionKey(version), version);
    }
  }
  return Array.from(byKey.values()).sort(compareVersions);
}

function evaluateDashboardSunset({ targetTag, baselineVersion, releaseWindow, stableTags }) {
  const target = parseStableVersion(targetTag);
  if (!target) {
    throw new Error(`Target tag must be stable semver like v1.2.3, got: ${targetTag}`);
  }

  const baseline = parseStableVersion(baselineVersion);
  if (!baseline) {
    throw new Error(`DEPRECATION_BASELINE_VERSION must be stable semver, got: ${baselineVersion}`);
  }

  if (!Number.isInteger(releaseWindow) || releaseWindow < 1) {
    throw new Error(`STABLE_RELEASE_WINDOW must be a positive integer, got: ${releaseWindow}`);
  }

  if (compareVersions(target, baseline) < 0) {
    return {
      publish: true,
      elapsed: 0,
      reason: `${target.raw} is before dashboard deprecation baseline ${baseline.raw}`,
    };
  }

  const versions = parseStableTags(stableTags);
  const hasBaseline = versions.some((version) => compareVersions(version, baseline) === 0);
  if (compareVersions(target, baseline) > 0 && !hasBaseline) {
    return {
      publish: false,
      elapsed: releaseWindow,
      reason: `legacy dashboard sunset baseline ${baseline.raw} is missing from git tags; skipping deprecated image publish`,
    };
  }

  if (!versions.some((version) => compareVersions(version, target) === 0)) {
    versions.push(target);
    versions.sort(compareVersions);
  }

  const elapsed = versions.filter(
    (version) => compareVersions(version, baseline) > 0 && compareVersions(version, target) <= 0,
  ).length;
  const publish = elapsed < releaseWindow;
  const reason = publish
    ? `legacy dashboard publish is still inside sunset window (${elapsed}/${releaseWindow} stable releases elapsed since ${baseline.raw})`
    : `legacy dashboard sunset reached (${elapsed}/${releaseWindow} stable releases elapsed since ${baseline.raw})`;

  return { publish, elapsed, reason };
}

function appendGithubOutput(values) {
  if (!process.env.GITHUB_OUTPUT) {
    return;
  }
  const lines = Object.entries(values).map(([key, value]) => `${key}=${String(value)}`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetTag = args.target || process.env.TARGET_TAG;
  const baselineVersion = args.baseline || process.env.DEPRECATION_BASELINE_VERSION;
  const windowValue = args.window || process.env.STABLE_RELEASE_WINDOW || '2';
  const releaseWindow = Number(windowValue);
  const stableTags = args.tagsStdin
    ? fs.readFileSync(0, 'utf8').split(/\r?\n/).filter(Boolean)
    : readStableTagsFromGit();

  const result = evaluateDashboardSunset({
    targetTag,
    baselineVersion,
    releaseWindow,
    stableTags,
  });

  appendGithubOutput({
    publish: result.publish ? 'true' : 'false',
    elapsed: result.elapsed,
    reason: result.reason,
  });

  const status = result.publish ? '[OK]' : '[i]';
  console.log(`${status} ${result.reason}`);
  if (!result.publish) {
    console.log('[i] Skipping ghcr.io/kaitranntt/ccs-dashboard publish; use ghcr.io/kaitranntt/ccs.');
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[X] ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  evaluateDashboardSunset,
  parseStableVersion,
};
