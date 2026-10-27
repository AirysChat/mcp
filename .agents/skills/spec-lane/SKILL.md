---
name: spec-lane
description: Create or update a Spec Kit lane (specs/0NN-*) — spec, tasks, verification — and keep the release train in specs/README.md consistent. Use when starting a feature with no lane, re-scoping a release, or closing tasks.
---

# Spec lane workflow

Follow `specs/AGENTS.md` and `.agents/rules/specs-and-releases.md`.

## Create a lane

1. Allocate the number: highest `specs/0NN-*` on `main` **and** open branches
   (`git branch -a`, `gh pr list --state open`) + 1.
2. Pick a 2–4 letter task prefix not used by other lanes (FND, CAT, CRM, AIA, REM, WAR, APP, ADM,
   PLT, GA are taken).
3. Write `spec.md` with: header (release, target, prefix, toolsets, dependencies), **Why**, **What**,
   **Out of scope**, **Acceptance**. English, concise, no tenant data.
4. Write `tasks.md` with the table `ID | P | Size | Task | Done when | Status`.
   - P0 blocks the release, P1 belongs in it, P2 may slip with `DEFERRED`.
   - Size XS/S/M/L. Anything L should usually split.
   - "Done when" is observable (test name, CI job, staging readback), never "implemented".
5. Add `verification.md` only when evidence exists.
6. Add the lane to `specs/README.md` (release table, gantt, lanes table) and, if it changes a
   decision, an ADR under `docs/adr/`.
7. GitHub: create the milestone if the release is new, a label `lane:0NN`, and issues for P0/P1
   tasks (`gh issue create --title "CRM-04: ..." --label lane:003,type:feat --milestone v0.3.0`).

## Close a task

- Cite evidence in the Status cell: `Done (2026-11-12, #42, CI run 123)`.
- Live evidence goes to `verification.md`, sanitized.
- Never mark production/WhatsApp-send/Meta-write gates passed from green CI alone.
- Close the GitHub issue from the PR (`Closes #NN`).

## Re-scope

Moving a task to another release: change its row, add `DEFERRED → v0.X.0` with a one-line reason,
move the issue's milestone. The lane scope is the contract; dates are targets.
