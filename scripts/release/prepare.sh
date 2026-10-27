#!/usr/bin/env bash
# Prepare a release PR from pending changesets — run locally (or by an agent) with gh CLI.
#
# Why local: the enterprise policy forbids GitHub Actions from opening pull requests, so the
# Changesets "Version Packages" bot PR cannot exist. This script does the same thing as the
# maintainer: version packages, sync plugin manifests, open the PR. Merging it lets
# .github/workflows/release.yml tag, publish (when enabled) and create the GitHub Release.
#
#   pnpm release:prepare            # opens "chore(release): vX.Y.Z"
#   pnpm release:prepare --dry-run  # shows the bump without committing
set -euo pipefail

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

[[ -z "$(git status --porcelain)" ]] || { echo "working tree not clean" >&2; exit 1; }
git fetch -q origin main
[[ "$(git rev-parse --abbrev-ref HEAD)" == "main" ]] || { echo "run from main" >&2; exit 1; }
[[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] || { echo "main is not up to date with origin" >&2; exit 1; }

pending=$(find .changeset -name '*.md' ! -name README.md | wc -l | tr -d ' ')
[[ "$pending" -gt 0 ]] || { echo "no pending changesets — nothing to release" >&2; exit 1; }

current=$(node -p "require('./packages/server/package.json').version")
pnpm -s changeset version
version=$(node -p "require('./packages/server/package.json').version")

# Plugin manifests ship in lockstep with the server (ADR 0003).
for manifest in plugins/*/.claude-plugin/plugin.json; do
  [[ -f "$manifest" ]] || continue
  # Replace only the version value so the manifest keeps its formatting.
  sed -i.bak -E "s/(\"version\"[[:space:]]*:[[:space:]]*\")[^\"]+(\")/\1$version\2/" "$manifest" && rm -f "$manifest.bak"
done
pnpm -s install --lockfile-only >/dev/null

echo "@airyschat/mcp $current → $version ($pending changeset(s))"
git --no-pager diff --stat

if [[ "$DRY_RUN" == 1 ]]; then
  git checkout -q -- . && git clean -qfd -- .changeset packages plugins
  echo "dry run: changes reverted"
  exit 0
fi

branch="release/v$version"
git checkout -q -b "$branch"
git add -A
git commit -qm "chore(release): v$version"
git push -q -u origin "$branch"

notes=$(awk -v v="## $version" '$0==v{f=1;next} /^## /{f=0} f' packages/server/CHANGELOG.md)
milestone="v$version"
gh api "repos/{owner}/{repo}/milestones?state=open&per_page=100" --jq '.[].title' | grep -qx "$milestone" || milestone=""
gh pr create --base main --head "$branch" --title "chore(release): v$version" \
  --label type:chore ${milestone:+--milestone "$milestone"} \
  --body "Release **@airyschat/mcp@$version** (from $current).

Merging tags \`@airyschat/mcp@$version\`, creates the GitHub Release and publishes when \`PUBLISH_ENABLED\` is set (see \`.agents/skills/release\`).

## Changelog
$notes"
git checkout -q main

