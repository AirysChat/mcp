#!/usr/bin/env bash
# Sync docs/api/{inventory.csv,coverage.md,params.json} from AirysChat origin/develop (CAT-02).
#
# Usage:
#   pnpm inventory:sync                                       # sync from ~/AirysChat origin/develop
#   pnpm inventory:sync --pr                                  # also commit & open a PR if docs/api changed
#   pnpm inventory:sync --routes /tmp/routes.txt --swagger /tmp/swagger.json --source <sha> [--pr]
#
# Never modifies ~/AirysChat: reads swagger via `git show` and runs `rails routes` in a
# throwaway detached worktree under /tmp that is removed on exit.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
AIRYSCHAT_REPO="${AIRYSCHAT_REPO:-$HOME/AirysChat}"
ROUTES_FILE=""
SWAGGER_FILE=""
SOURCE_SHA=""
OPEN_PR=0

while [ $# -gt 0 ]; do
  case "$1" in
    --routes) ROUTES_FILE="$2"; shift 2 ;;
    --swagger) SWAGGER_FILE="$2"; shift 2 ;;
    --source) SOURCE_SHA="$2"; shift 2 ;;
    --pr) OPEN_PR=1; shift ;;
    *) echo "Unknown flag: $1" >&2; exit 2 ;;
  esac
done

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/airys-inv-sync.XXXXXX")"
WORKTREE_DIR=""
cleanup() {
  if [ -n "$WORKTREE_DIR" ] && [ -d "$WORKTREE_DIR" ]; then
    git -C "$AIRYSCHAT_REPO" worktree remove "$WORKTREE_DIR" --force >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

if [ -z "$SOURCE_SHA" ]; then
  if [ ! -d "$AIRYSCHAT_REPO/.git" ]; then
    echo "AirysChat checkout not found at $AIRYSCHAT_REPO (set AIRYSCHAT_REPO or pass --routes/--swagger/--source)." >&2
    exit 1
  fi
  git -C "$AIRYSCHAT_REPO" fetch origin develop --quiet
  SOURCE_SHA="$(git -C "$AIRYSCHAT_REPO" rev-parse --short=10 origin/develop)"
fi

if [ -z "$SWAGGER_FILE" ]; then
  SWAGGER_FILE="$TMP_DIR/application_swagger.json"
  git -C "$AIRYSCHAT_REPO" show "origin/develop:swagger/tag_groups/application_swagger.json" > "$SWAGGER_FILE"
fi

if [ -z "$ROUTES_FILE" ]; then
  WORKTREE_DIR="$TMP_DIR/worktree"
  git -C "$AIRYSCHAT_REPO" worktree add "$WORKTREE_DIR" origin/develop --detach --quiet
  ROUTES_FILE="$TMP_DIR/routes.txt"
  (
    cd "$WORKTREE_DIR"
    if command -v rbenv >/dev/null 2>&1; then eval "$(rbenv init - bash)"; fi
    DISABLE_SPRING=1 bundle exec rails routes > "$ROUTES_FILE"
  )
fi

cd "$ROOT"
node scripts/inventory/build-inventory.mjs --routes "$ROUTES_FILE" --source "AirysChat@${SOURCE_SHA#AirysChat@}"
node scripts/inventory/extract-swagger-params.mjs --swagger "$SWAGGER_FILE" --source "AirysChat@${SOURCE_SHA#AirysChat@}"
pnpm inventory:check
node scripts/inventory/build-catalog.mjs --stats

if git diff --quiet -- docs/api/; then
  echo "✓ No inventory drift relative to AirysChat@${SOURCE_SHA#AirysChat@}."
  exit 0
fi

echo "Inventory updated for AirysChat@${SOURCE_SHA#AirysChat@}:"
git status -s docs/api/

if [ "$OPEN_PR" -eq 1 ]; then
  BRANCH="chore/002-inventory-${SOURCE_SHA#AirysChat@}"
  git checkout -b "$BRANCH"
  git add docs/api/
  git commit -m "chore(inventory): sync with AirysChat@${SOURCE_SHA#AirysChat@}"
  git push -u origin "$BRANCH"
  gh pr create \
    --title "chore(inventory): sync with AirysChat@${SOURCE_SHA#AirysChat@}" \
    --body "Automated API inventory and Swagger parameter sync from \`AirysChat@${SOURCE_SHA#AirysChat@}\`."
fi
