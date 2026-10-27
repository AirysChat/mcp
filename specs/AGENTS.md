# Spec Kit guidance (this repository)

Extends the root `AGENTS.md` and `.agents/rules/specs-and-releases.md` for `specs/`.

- One lane per feature theme: `specs/0NN-<slug>/`. Allocate the next free number after scanning
  `main` and open branches (`git branch -a`, `gh pr list`).
- Files a lane may hold: `spec.md` (why/what), `plan.md` (how, when non-trivial), `tasks.md`
  (backlog with IDs), `verification.md` (dated evidence). Create only what the lane needs.
- Task IDs are `<LANE-PREFIX>-NN` and never reused. A task closes only with cited evidence
  (PR, commit, CI run, sanitized live readback). Use the shared status vocabulary for anything open.
- `tasks.md` tables use: `ID | P | Size | Task | Done when | Status`. P0 blocks the release; P1
  belongs in it; P2 can slip to the next minor with an explicit `DEFERRED` note.
- Keep production, WhatsApp-send and Meta-write gates explicit. Never mark them passed from green CI.
- Evidence is sanitized (`.agents/rules/secrets-and-evidence.md`).
- When a lane depends on AirysChat or airys-platform work, link the external lane/PR and mark the
  task `BLOCKED_EXTERNAL` until it lands.
