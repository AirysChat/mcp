---
name: release
description: Cut a release of @airyschat/mcp (and plugin versions) with Changesets — readiness check, Version Packages PR, tag, publish, GitHub Release, release evidence. Use when the owner asks to release, or a milestone's tasks are all closed.
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

## 2. Version Packages PR

The `release.yml` workflow opens/updates **"Version Packages"** on `main` from pending changesets.
Review it: version bump matches intent (pre-1.0: breaking = minor, with a callout), CHANGELOG reads
well for users, plugin manifests (`plugins/*/.claude-plugin/plugin.json`, etc.) bumped to the same
version.

## 3. Publish

Merging the Version Packages PR runs `changeset publish`:
- **Pre-1.0**: GitHub Packages (`npm.pkg.github.com`), only after FND-11 enables the publish step.
- **1.0+**: public npm with provenance + MCP Registry `server.json` publish (lane 010).

Tags follow `@airyschat/mcp@X.Y.Z`. Create the GitHub Release from the tag with the CHANGELOG
section if the action did not.

## 4. Hosted service (from 0.5.0)

Deploy the image for the tag to `mcp.staging.airys.chat`, run `compat-tester`, then prod
**only with explicit owner approval** in the conversation.

## 5. Evidence

Append to the relevant lane `verification.md`: version, tag, publish URL, CI run, date. Close the
milestone (`gh api -X PATCH repos/AirysChat/mcp/milestones/<n> -f state=closed`).

## Never

- Publish from a laptop. Releases come from CI.
- Release with failing `inventory:check` or open `NEEDS_SECURITY_REVIEW` tasks in the milestone.
