---
trigger: model_decision
description: Apply when planning, starting, finishing or releasing a feature; when touching specs/, .changeset/ or CHANGELOG; or when the user asks about the roadmap.
---

# Specs, features and releases

## Flow

```
idea ─▶ lane (specs/0NN-*) ─▶ tasks.md item ─▶ branch ─▶ PR (+changeset) ─▶ main ─▶ release PR ─▶ tag + npm
```

1. **Every feature belongs to a lane.** Find it in `specs/README.md`. No lane → create one with
   `.agents/skills/spec-lane` before writing code.
2. **One task = one branch = one PR.** Branch `type/<lane>-<slug>` (e.g. `feat/003-crm-deals-read`).
   PR title is a Conventional Commit; body links the lane task ID (e.g. `CRM-04`).
3. **Changeset** when the tool surface or config changes (see `.changeset/README.md`).
4. **Close a task only with evidence**: code + test for behaviour; live readback for promotion to
   `stable`. Update `tasks.md` and `verification.md` in the same PR.
5. **Releases** are cut by the Changesets release PR on `main` (`.agents/skills/release`). A release
   is published only when every lane task targeted at it is closed or explicitly deferred.

## Feature control

- Toolsets are the unit users enable (`AIRYSCHAT_TOOLSETS`).
- Each tool has a stability: `experimental` → `beta` → `stable`. Non-stable tools are hidden unless
  `AIRYSCHAT_FEATURES` opts in (lane 001 implements this; see ADR 0003).
- `deprecated` tools keep working for one minor release, then are removed with a changeset.

## Status vocabulary (shared with AirysChat)

`VERIFIED_OPEN`, `IMPLEMENTED_BUT_DOC_STALE`, `MERGED_AWAITING_RELEASE_EVIDENCE`, `DEFERRED_POST_MVP`,
`DUPLICATE`, `OBSOLETE`, `BLOCKED_EXTERNAL`, `NEEDS_PRODUCT_DECISION`, `NEEDS_SECURITY_REVIEW`.
