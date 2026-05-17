# CCS Release Process

CCS uses a decoupled release model: every merge to `main` immediately publishes
a stable npm `@latest` release and an immutable Docker `:<ver>` tag. Docker
mutable tags (`:latest`, `:<MAJOR>`, `:<MINOR>`) require a separate manual
promote step after an operator-verified soak window. This decouples the npm
ecosystem from the Docker stability gate.

## Phase 1 — Automatic stable release (on every merge to `main`)

1. A PR is merged into `main` with a conventional commit (`feat:`, `fix:`, etc.).
2. `release.yml` triggers semantic-release, which reads `.releaserc.cjs`.
3. Because `main` is a stable channel, semantic-release cuts a GitHub release
   tagged `vX.Y.Z` and publishes the npm package to the `@latest` dist-tag
   immediately. No rc channel, no soak delay on npm.
4. `docker-release.yml` triggers on the `release: published` event and:
   - Validates the tag as stable semver (`vX.Y.Z`).
   - Builds the integrated image for `linux/amd64` and `linux/arm64`.
   - Pushes **only the immutable** `ghcr.io/kaitranntt/ccs:X.Y.Z` tag.
   - Signs the image with cosign (keyless OIDC).
   - Runs smoke tests (`smoke-test` job).
   - Mutable tags (`:latest`, `:<MAJOR>`, `:<MINOR>`) are **not** added at
     this stage — `promote-mutable-tags` only runs on explicit
     `workflow_dispatch` with `promote_to_latest=true`.

## Phase 2 — Manual promotion to Docker mutable tags (rc.1 soak window)

After the immutable `:<ver>` Docker image has soaked (typically 24 h with no
reported issues), the operator promotes mutable tags:

1. Verify the immutable image is healthy:

   ```bash
   docker pull ghcr.io/kaitranntt/ccs:X.Y.Z
   docker run --rm -p 3000:3000 -p 8317:8317 ghcr.io/kaitranntt/ccs:X.Y.Z
   # check http://localhost:3000 and http://localhost:8317
   ```

2. Optionally verify the cosign signature:

   ```bash
   cosign verify \
     --certificate-identity-regexp "https://github.com/kaitranntt/ccs/.github/workflows/docker-release.yml" \
     --certificate-oidc-issuer https://token.actions.githubusercontent.com \
     ghcr.io/kaitranntt/ccs:X.Y.Z
   ```

3. Run the `promote-release` workflow via GitHub Actions UI or CLI:

   ```bash
   gh workflow run promote-release.yml \
     --field tag=vX.Y.Z
   ```

   This dispatches `docker-release.yml` with `promote_to_latest=true`, which
   triggers the `promote-mutable-tags` job to add `:latest`, `:<MAJOR>`, and
   `:<MINOR>` via `docker buildx imagetools create`.

   Alternatively, dispatch `docker-release.yml` directly:

   ```bash
   gh workflow run "Publish Docker Image" \
     --field tag=vX.Y.Z \
     --field promote_to_latest=true
   ```

## Why npm and Docker have different soak windows

- **npm `@latest`**: Published immediately on every `main` merge. npm users who
  pin a version are unaffected; users who run `npm install -g @kaitranntt/ccs`
  get the latest immediately. Rollback is `npm install -g @kaitranntt/ccs@X.Y.Z`.
- **Docker `:latest`**: Promoted only after operator confirmation. Users who
  pull `:latest` or run `docker pull` without a pinned tag are shielded from
  a bad image. The immutable `:<ver>` tag is always available for pinned usage
  from the moment of release.

## Verifying the promotion

```bash
# Confirm :latest points to the promoted digest
docker buildx imagetools inspect ghcr.io/kaitranntt/ccs:latest

# Confirm npm @latest updated (happens automatically at Phase 1)
npm view @kaitranntt/ccs dist-tags
```

## Rollback

If a promoted release is found to be bad:

```bash
# Repoint :latest to the previous known-good immutable tag
docker buildx imagetools create \
  --tag ghcr.io/kaitranntt/ccs:latest \
  ghcr.io/kaitranntt/ccs:PREVIOUS.VERSION

# For npm, publish a fix as a new patch release (do not unpublish)
# Unpublishing npm packages causes downstream breakage for pinned consumers.
```

## Branch / tag taxonomy

| Branch | Semantic-release channel | npm dist-tag | Docker tag (on release event) | Docker mutable (on promote) |
|--------|--------------------------|--------------|-------------------------------|------------------------------|
| `main` | stable | `@latest` | `:<ver>` (immutable, immediate) | `:latest`, `:<MAJOR>`, `:<MINOR>` (after soak) |
| `dev` | `dev` prerelease | `@dev` | not published | not published |
