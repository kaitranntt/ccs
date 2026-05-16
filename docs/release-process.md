# CCS Release Process

CCS uses a two-phase release model: every merge to `main` auto-cuts a
pre-release rc build, and a separate manual promotion step flips it to stable.
This gives a soak window before `:latest` Docker tags and npm `@latest` reach
end users.

## Phase 1 — Automatic rc cut (on every merge to `main`)

1. A PR is merged into `main` with a conventional commit (`feat:`, `fix:`, etc.).
2. `release.yml` triggers semantic-release, which reads `.releaserc.cjs`.
3. Because `main` is configured as `{ name: 'main', prerelease: 'rc' }`,
   semantic-release cuts a GitHub pre-release tagged `vX.Y.Z-rc.N`.
4. The npm package is published to the `rc` dist-tag
   (`npm install @kaitranntt/ccs@rc`).
5. `docker-release.yml` triggers on the `release: published` event and:
   - Builds the integrated image for `linux/amd64` and `linux/arm64`.
   - Pushes **only the immutable** `ghcr.io/kaitranntt/ccs:X.Y.Z-rc.N` tag.
   - Signs the image with cosign (keyless OIDC).
   - Runs smoke tests (`smoke-test` job).
   - Mutable tags (`:latest`, `:<MAJOR>`, `:<MINOR>`) are **not** added at
     this stage — `promote-mutable-tags` is gated on `!github.event.release.prerelease`.

## Phase 2 — Manual promotion to stable

After the rc image has soaked (typically 24–48 h with no reported issues):

1. Verify the rc image is healthy:

   ```bash
   docker pull ghcr.io/kaitranntt/ccs:X.Y.Z-rc.N
   docker run --rm -p 3000:3000 -p 8317:8317 ghcr.io/kaitranntt/ccs:X.Y.Z-rc.N
   # check http://localhost:3000 and http://localhost:8317
   ```

2. Optionally verify the cosign signature:

   ```bash
   cosign verify \
     --certificate-identity-regexp "https://github.com/kaitranntt/ccs/.github/workflows/docker-release.yml" \
     --certificate-oidc-issuer https://token.actions.githubusercontent.com \
     ghcr.io/kaitranntt/ccs:X.Y.Z-rc.N
   ```

3. Run the `promote-release` workflow via GitHub Actions UI or CLI:

   ```bash
   gh workflow run promote-release.yml \
     --field rc_tag=vX.Y.Z-rc.N
   ```

4. The workflow calls `gh release edit vX.Y.Z-rc.N --prerelease=false --latest`,
   which fires a new `release: published` event with `prerelease=false`.

5. `docker-release.yml` picks up the stable event and the `promote-mutable-tags`
   job runs, adding `:latest`, `:<MAJOR>`, `:<MINOR>` via
   `docker buildx imagetools create`.

6. npm `@latest` is already set by semantic-release during the rc phase for the
   stable semver portion — no separate npm step is needed.

## Verifying the promotion

```bash
# Confirm :latest points to the promoted digest
docker buildx imagetools inspect ghcr.io/kaitranntt/ccs:latest

# Confirm npm @latest updated
npm view @kaitranntt/ccs dist-tags
```

## Rollback

If a promoted release is found to be bad:

```bash
# Re-mark as prerelease on GitHub (stops new users from pulling :latest via UI)
gh release edit vX.Y.Z-rc.N --prerelease=true --latest=false

# Repoint :latest to the previous known-good version
docker buildx imagetools create \
  --tag ghcr.io/kaitranntt/ccs:latest \
  ghcr.io/kaitranntt/ccs:PREVIOUS.VERSION
```

## Branch / tag taxonomy

| Branch | Semantic-release channel | npm dist-tag | Docker tag |
|--------|--------------------------|--------------|------------|
| `main` | `rc` prerelease | `@rc` | `:<ver>-rc.N` (immutable only) |
| `main` (after promote) | stable | `@latest` | `:latest`, `:<MAJOR>`, `:<MINOR>`, `:<ver>` |
| `dev` | `dev` prerelease | `@dev` | not published |
