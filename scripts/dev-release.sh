#!/bin/bash
# Dev Release Script
# Calculates version based on current stable, not semantic-release's predicted next version.
# Pattern: {stable}-dev.{N} where N increments for each dev release.
#
# Example:
#   main at v6.7.1 → dev releases: 6.7.1-dev.1, 6.7.1-dev.2, ...
#   main releases v6.7.2 → dev releases: 6.7.2-dev.1, 6.7.2-dev.2, ...

set -euo pipefail

# Colors for output (respects NO_COLOR)
if [[ -z "${NO_COLOR:-}" ]] && [[ -t 1 ]]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  NC='\033[0m'
else
  RED=''
  GREEN=''
  YELLOW=''
  NC=''
fi

log_info() { echo -e "${GREEN}[i]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[!]${NC} $1"; }
log_error() { echo -e "${RED}[X]${NC} $1"; }

# Ensure we have the latest tags and branch refs
git fetch --tags origin main dev

# Get latest stable tag from main (exclude prereleases like -dev, -beta, -rc)
# Match only clean semver tags: vX.Y.Z
STABLE_TAG=$(git tag -l "v[0-9]*.[0-9]*.[0-9]" --merged origin/main --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1 || echo "")

if [ -z "$STABLE_TAG" ]; then
  log_warn "No stable tags found on main, defaulting to v0.0.0"
  STABLE_TAG="v0.0.0"
fi

STABLE=${STABLE_TAG#v}
CURRENT_VERSION=$(jq -r '.version' package.json)
HEAD_SUBJECT=$(git log -1 --pretty=%s 2>/dev/null || echo "")
DEV_VERSION_REGEX="^${STABLE//./\\.}-dev\\.[0-9]+$"
CURRENT_RELEASE_SUBJECT="chore(release): ${CURRENT_VERSION}"
LEGACY_CURRENT_RELEASE_SUBJECT="${CURRENT_RELEASE_SUBJECT} [skip ci]"
PREVIOUS_DEV_TAG=""
RECOVERY_MODE=false

log_info "Current stable version: ${STABLE}"

if [[ "$CURRENT_VERSION" =~ $DEV_VERSION_REGEX ]] && { [[ "$HEAD_SUBJECT" == "$CURRENT_RELEASE_SUBJECT" ]] || [[ "$HEAD_SUBJECT" == "$LEGACY_CURRENT_RELEASE_SUBJECT" ]]; }; then
  VERSION="$CURRENT_VERSION"
  CURRENT_TAG="v${VERSION}"
  PREVIOUS_DEV_TAG=$(git tag -l "v${STABLE}-dev.*" --sort=-v:refname | grep -vx "$CURRENT_TAG" | head -1 || echo "")
  RECOVERY_MODE=true
  log_warn "Recovery mode for ${VERSION}"

  if git rev-parse "${CURRENT_TAG}" >/dev/null 2>&1; then
    TAG_COMMIT=$(git rev-parse "${CURRENT_TAG}^{commit}")
    HEAD_COMMIT=$(git rev-parse HEAD)
    if [[ "$TAG_COMMIT" != "$HEAD_COMMIT" ]]; then
      log_error "Tag ${CURRENT_TAG} exists but does not point to HEAD"
      exit 1
    fi
    log_info "Reusing existing tag ${CURRENT_TAG}"
  else
    git tag "${CURRENT_TAG}"
    log_warn "Recreated missing tag ${CURRENT_TAG} on release commit"
  fi
else
  # Find latest dev tag for this stable version
  LATEST_DEV=$(git tag -l "v${STABLE}-dev.*" --sort=-v:refname | head -1 || echo "")
  PREVIOUS_DEV_TAG="$LATEST_DEV"

  # Calculate next dev number
  if [ -z "$LATEST_DEV" ]; then
    DEV_NUM=1
    log_info "No existing dev tags for ${STABLE}, starting at dev.1"
  else
    DEV_NUM=$(echo "$LATEST_DEV" | sed 's/.*dev\.\([0-9]*\)/\1/')
    DEV_NUM=$((DEV_NUM + 1))
    log_info "Latest dev tag: ${LATEST_DEV}, incrementing to dev.${DEV_NUM}"
  fi

  VERSION="${STABLE}-dev.${DEV_NUM}"
  CURRENT_TAG="v${VERSION}"
  log_info "New version: ${VERSION}"

  # Check if tag already exists (safety check)
  if git rev-parse "${CURRENT_TAG}" >/dev/null 2>&1; then
    log_error "Tag ${CURRENT_TAG} already exists!"
    exit 1
  fi

  # Update package.json
  npm version "$VERSION" --no-git-tag-version
  log_info "Updated package.json to ${VERSION}"

  # Configure git for GitHub Actions
  git config user.name "github-actions[bot]"
  git config user.email "github-actions[bot]@users.noreply.github.com"

  # Commit version change
  git add package.json
  git commit -m "chore(release): ${VERSION}"
  log_info "Created release commit"

  # Create tag
  git tag "${CURRENT_TAG}"
  log_info "Created tag ${CURRENT_TAG}"
fi

PACKAGE_NAME=$(jq -r '.name' package.json)
if npm view "${PACKAGE_NAME}@${VERSION}" version >/dev/null 2>&1; then
  log_info "npm already has ${PACKAGE_NAME}@${VERSION}, skipping publish"
else
  npm publish --tag dev
  log_info "Published to npm with @dev tag"
fi

if git merge-base --is-ancestor HEAD origin/dev >/dev/null 2>&1; then
  log_info "origin/dev already contains release commit"
else
  git push origin HEAD:dev
  log_info "Pushed release commit to origin/dev"
fi

if git ls-remote --exit-code --tags origin "refs/tags/${CURRENT_TAG}" >/dev/null 2>&1; then
  log_info "Remote tag ${CURRENT_TAG} already exists"
else
  git push origin "${CURRENT_TAG}"
  log_info "Pushed tag ${CURRENT_TAG}"
fi

# Generate release notes from commits since last tag
PREV_TAG="${PREVIOUS_DEV_TAG:-$STABLE_TAG}"
if [ -n "$PREV_TAG" ]; then
  # Get commits between previous tag and the one before our release commit
  NOTES=$(git log --pretty=format:"- %s" "${PREV_TAG}..HEAD~1" 2>/dev/null | grep -v "chore(release):" | head -15 || echo "- Dev release")
else
  NOTES="- Dev release based on ${STABLE}"
fi

# Create GitHub prerelease
if gh release view "${CURRENT_TAG}" >/dev/null 2>&1; then
  log_info "GitHub prerelease ${CURRENT_TAG} already exists"
else
  gh release create "${CURRENT_TAG}" \
    --title "${CURRENT_TAG}" \
    --notes "${NOTES}" \
    --prerelease

  log_info "Created GitHub prerelease"
fi

# Save release info for Discord notification
# This file is read by send-discord-release.cjs for dev releases
cat > .dev-release-info.json << EOF
{
  "version": "${VERSION}",
  "notes": $(echo "$NOTES" | jq -Rs .)
}
EOF
log_info "Saved release info for Discord notification"

# Output for GitHub Actions
{
  echo "current_tag=${CURRENT_TAG}"
  echo "previous_dev_tag=${PREVIOUS_DEV_TAG}"
  echo "recovery_mode=${RECOVERY_MODE}"
  echo "released=true"
  echo "stable_tag=${STABLE_TAG}"
  echo "version=${VERSION}"
} >> "${GITHUB_OUTPUT:-/dev/null}"

log_info "Dev release ${VERSION} complete!"
