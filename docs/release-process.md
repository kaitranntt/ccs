# CCS Release Process

CCS has separate development, stable npm, and Docker promotion lanes. A branch
push starts the relevant workflow. Eligible `dev` pushes publish the next custom
development prerelease after their gates pass; `main` publishes only when
semantic-release finds release-worthy commits.

## Release lanes

| Source | Workflow | Result |
| --- | --- | --- |
| Push to `dev` | [`dev-release.yml`](../.github/workflows/dev-release.yml) | Custom development prerelease and npm `@dev` publication |
| Push to `main` | [`release.yml`](../.github/workflows/release.yml) | Semantic-release stable version, npm `@latest`, tag, and GitHub release when commits require a release |
| Published stable or `rc` GitHub release | [`docker-release.yml`](../.github/workflows/docker-release.yml) | Immutable integrated Docker version tag, signature, and smoke test |
| Manual stable promotion | [`promote-release.yml`](../.github/workflows/promote-release.yml) | Docker `:latest`, major, and minor aliases |
| Stable GitHub release | [`sync-dev-after-release.yml`](../.github/workflows/sync-dev-after-release.yml) | Merge released `main` state back into `dev` |

## Development prereleases

`Dev Release` runs on pushes to `dev` and can also be dispatched manually.
After build and validation gates, it calls
[`scripts/dev-release.sh`](../scripts/dev-release.sh). That script owns the
`<stable>-dev.<n>` version sequence and npm `@dev` publication. It is
intentionally separate from the production semantic-release configuration.

Generated `chore(release): ...` pushes are skipped by the workflow guard to
prevent release recursion.

## Stable npm and GitHub releases

`Release` runs on `main`. It builds the CLI and dashboard, runs the fast, slow,
and end-to-end gates, then invokes semantic-release with
[`.releaserc.cjs`](../.releaserc.cjs).

Semantic-release analyzes commits since the previous stable release:

- `feat` produces at least a minor release;
- `fix`, `hotfix`, `refactor`, and `style` produce patch releases under the
  repository rules;
- breaking-change notation produces the appropriate major release; and
- commits without a matching release rule may produce no release.

When a release is required, the lane updates `CHANGELOG.md` and `package.json`,
publishes npm `@latest`, creates the stable Git tag and GitHub release, and
pushes the generated release commit to `main`. Do not bump versions or create
release tags manually.

## Docker publication and promotion

The supported integrated image is `ghcr.io/kaitranntt/ccs`.

On a published stable `vX.Y.Z` or release-candidate `vX.Y.Z-rc.N` GitHub
release, `Publish Docker Image`:

1. validates the release tag;
2. checks out that tag;
3. builds the integrated image for `linux/amd64` and `linux/arm64`;
4. publishes only the matching immutable version tag;
5. signs the image digest with keyless cosign; and
6. smoke-tests the published image.

Mutable aliases are a separate operator decision. After verifying the immutable
image and allowing the desired soak period, dispatch `promote-release.yml`:

```bash
gh workflow run promote-release.yml --field tag=vX.Y.Z
```

The promotion workflow verifies that the stable GitHub release and immutable
image exist, then dispatches `docker-release.yml` with
`promote_to_latest=true`. The promotion job creates `:latest`, `:X`, and
`:X.Y` aliases from the immutable image digest.

The deprecated `ccs-dashboard` image has its own sunset compatibility job.
Do not use its tag behavior as the contract for the supported integrated image.

## Post-release development sync

A published, non-prerelease `vX.Y.Z` release targeting `main` triggers
`Sync Dev After Main Release`. The workflow merges `main` into `dev`, resolves
known generated version-file conflicts in favor of the released `main` state,
and pushes `dev`. That push intentionally triggers the normal `Push CI` and
development-release lanes.

## Verification

```bash
# npm channels
npm view @kaitranntt/ccs dist-tags

# immutable integrated image
docker buildx imagetools inspect ghcr.io/kaitranntt/ccs:X.Y.Z

# mutable alias after promotion
docker buildx imagetools inspect ghcr.io/kaitranntt/ccs:latest
```

Verify the GitHub Actions run and tag point to the expected commit before
announcing a release.

## Recovery

- **Bad npm release:** publish a corrected patch. Do not unpublish a version
  used by downstream consumers.
- **Bad immutable Docker image:** leave the immutable tag unchanged and publish
  a corrected version.
- **Bad mutable Docker promotion:** promote a known-good immutable digest back
  to the mutable aliases through the controlled workflow.
- **Failed `dev` sync:** repair the merge against current `main` and `dev`;
  never overwrite branch history.

## Branch and tag summary

| Branch | Package channel | npm dist-tag | Integrated Docker |
| --- | --- | --- | --- |
| `dev` | Development prerelease | `@dev` | None |
| `main` | Stable semantic release | `@latest` | Immutable tag on GitHub release; mutable aliases after manual promotion |
