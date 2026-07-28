#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "${CCS_SKIP_PREPUSH_GATE:-}" == "1" ]]; then
  echo "[i] Skipping pre-push CI parity gate (CCS_SKIP_PREPUSH_GATE=1)."
  exit 0
fi

if [[ ! -f AGENTS.md ]]; then
  echo "[X] Missing AGENTS.md in this worktree."
  echo "    Ensure you are in a valid CCS repository/worktree before pushing."
  exit 1
fi

TRACKED_PLANS="$(git ls-files -- plans)"
if [[ -n "$TRACKED_PLANS" ]]; then
  echo "[X] Tracked files found under plans/."
  echo "    plans/ is workspace-only and must stay ignored."
  while IFS= read -r tracked_path; do
    echo "    $tracked_path"
  done <<< "$TRACKED_PLANS"
  echo "    Remove them from the index with: git rm -r --cached plans"
  exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ -z "$CURRENT_BRANCH" || "$CURRENT_BRANCH" == "HEAD" ]]; then
  echo "[i] Detached HEAD detected. Skipping pre-push CI parity gate."
  exit 0
fi

BASE_BRANCH="${CCS_PR_BASE:-}"
if [[ -z "$BASE_BRANCH" ]]; then
  if [[ "$CURRENT_BRANCH" == "main" || "$CURRENT_BRANCH" =~ ^hotfix/ || "$CURRENT_BRANCH" =~ ^kai/hotfix- ]]; then
    BASE_BRANCH="main"
  else
    BASE_BRANCH="dev"
  fi
fi

echo "[i] Pre-push CI parity gate"
echo "    branch: $CURRENT_BRANCH"
echo "    base:   $BASE_BRANCH"

if git ls-remote --exit-code --heads origin "$BASE_BRANCH" >/dev/null 2>&1; then
  git fetch origin "$BASE_BRANCH" --quiet
fi
if git show-ref --verify --quiet "refs/remotes/origin/$BASE_BRANCH"; then
  if ! git merge-base --is-ancestor "origin/$BASE_BRANCH" HEAD; then
    echo "[X] Branch '$CURRENT_BRANCH' is behind origin/$BASE_BRANCH."
    echo "    Rebase or merge before pushing:"
    echo "    git pull --rebase origin $BASE_BRANCH"
    exit 1
  fi
fi

# Age does not prove that generated metrics match the checked-out source tree.
# Compare both inventory artifacts byte-for-byte before expensive parity checks.
node scripts/hardening-inventory.js --check

echo "[i] Running CI-parity local checks..."
# `set -euo pipefail` above makes every step fail fast. Keep these commands
# explicit so parity drift is visible when CI changes.
bun run typecheck
bun run lint
bun run format:check
bun run build:all
bun run test:all
CCS_E2E_SKIP_BUILD=1 bun run test:e2e

echo "[OK] CI parity gate passed."
