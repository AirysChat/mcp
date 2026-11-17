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
pnpm ci:local                                       # full local CI + audit + history scan + distroless Docker smoke
ls .changeset/*.md                                  # pending changesets exist
```

Cross-check each lane `tasks.md` for the release. Anything open → ask the owner: defer or wait.

## 2. Release PR (gh CLI)

```bash
git checkout main && git pull
pnpm release:prepare --dry-run   # preview the bump
pnpm release:prepare             # changeset version + plugin manifests + PR "chore(release): vX.Y.Z"
```

Review it: version bump matches intent (pre-1.0: breaking = minor, with a callout), CHANGELOG reads
well for users, plugin manifests (`plugins/*`) and `server.json` carry the same version.
Run `pnpm ci:local` locally on the release branch and squash-merge into `main`.

## 3. Tag, publish, GitHub Release

Automatic GitHub Actions triggers are disabled (`workflow_dispatch` only). After merging the release PR
into `main`, choose either path:

- **Local zero-Actions publish** (works even if GitHub Actions runners are unavailable):
  ```bash
  git checkout main && git pull
  pnpm release:publish --dry-run
  pnpm release:publish
  ```
- **On-demand GitHub OIDC Trusted Publishing** (for SLSA provenance on `npmjs.org`):
  ```bash
  gh workflow run release.yml
  ```

## 4. Hosted service (`mcp.staging.airys.chat` / `mcp.airys.chat`)

Deploy locally by immutable Artifact Registry digest (`scripts/deploy/cloud-run.sh`), staging first,
then prod **only with explicit owner approval** in the conversation:

```bash
pnpm deploy:staging --dry-run
pnpm deploy:staging
# After staging verification + explicit owner approval:
pnpm deploy:prod <commit_sha>
```

## 5. Evidence

Append to the relevant lane `verification.md`: version, tag, publish URL, local CI / deploy digest,
date. Close the milestone (`gh api -X PATCH repos/AirysChat/mcp/milestones/<n> -f state=closed`).

## Never

- Release with failing `pnpm ci:local` (`inventory:check`, `docs:check`, `security:scan`, or Docker smoke)
  or open `NEEDS_SECURITY_REVIEW` tasks in the milestone.
