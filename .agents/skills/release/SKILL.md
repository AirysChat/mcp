---
name: release
description: Cut a release of @airyschat/mcp (and plugin versions) with Changesets — readiness check, release PR via gh CLI, tag, publish, GitHub Release, release evidence. Use when the owner asks to release, or a milestone's tasks are all closed.
---

# Release

ADR 0003 defines the model. Releases ship when every P0/P1 task targeted at the version is closed
or explicitly `DEFERRED`.

## 1. Readiness

```bash
gh issue list --milestone vX.Y.Z --state open      # must be empty or all deferred
pnpm install --frozen-lockfile && pnpm check
ls .changeset/*.md                                  # pending changesets exist
```

Cross-check each lane `tasks.md` for the release. Anything open → ask the owner: defer or wait.

## 2. Release PR (gh CLI)

The enterprise policy forbids GitHub Actions from opening PRs, so the release PR is opened from a
local checkout (by the owner or an agent) with gh CLI:

```bash
git checkout main && git pull
pnpm release:prepare --dry-run   # preview the bump
pnpm release:prepare             # changeset version + plugin manifests + PR "chore(release): vX.Y.Z"
```

Review it: version bump matches intent (pre-1.0: breaking = minor, with a callout), CHANGELOG reads
well for users, plugin manifests (`plugins/*/.claude-plugin/plugin.json`) carry the same version.
Squash-merge after CI is green.

## 3. Tag, publish, GitHub Release

Merging the release PR runs `release.yml` on `main`: it sees no pending changesets, a CHANGELOG
entry for the new version and no existing tag, then:
- runs `pnpm check`;
- publishes when the repository variable `PUBLISH_ENABLED=true` —
  **pre-1.0** GitHub Packages (`npm.pkg.github.com`, enabled by FND-11);
  **1.0+** public npm with provenance + MCP Registry `server.json` (lane 010);
- pushes tag `@airyschat/mcp@X.Y.Z` and creates the GitHub Release (pre-release while `0.x`).

Re-run with `gh workflow run release.yml` if a step failed after the merge.

## 4. Hosted service (from 0.6.0)

Deploy the image for the tag to `mcp.staging.airys.chat`, run `compat-tester`, then prod
**only with explicit owner approval** in the conversation.

## 5. Evidence

Append to the relevant lane `verification.md`: version, tag, publish URL, CI run, date. Close the
milestone (`gh api -X PATCH repos/AirysChat/mcp/milestones/<n> -f state=closed`).

## Never

- Publish from a laptop. Releases come from CI.
- Release with failing `inventory:check` or open `NEEDS_SECURITY_REVIEW` tasks in the milestone.
