# Contributing

Solo-maintained for now; the process is deliberately light but strict about safety and evidence.
Coding agents: start at [AGENTS.md](AGENTS.md).

## Flow

```
lane (specs/0NN-*) → task (e.g. CRM-04) → issue → branch → PR + changeset → main → release PR → tag
```

1. **Find the lane** in [specs/README.md](specs/README.md). No lane? Create one first
   (`.agents/skills/spec-lane`).
2. **Branch** `type/<lane>-<slug>` from `main` — e.g. `feat/003-crm-deals-read`.
3. **Commit** with [Conventional Commits](https://www.conventionalcommits.org):
   `feat(crm): add crm_deals_search`. Types: feat, fix, docs, refactor, test, chore, ci, perf.
   Scopes: toolset names, `server`, `catalog`, `plugins`, `specs`, `ci`, `deps`.
4. **Changeset** if users see a difference: `pnpm changeset`.
5. **PR** title = Conventional Commit; body links the task and `Closes #NN`. Fill the template's
   safety checklist. `pnpm check` must pass; CI is required.
6. **Squash merge** to `main`. Releases are cut by the Changesets "Version Packages" PR.

## Feature control

Tools belong to toolsets (`AIRYSCHAT_TOOLSETS`) and carry a stability
(`experimental` → `beta` → `stable`, plus `deprecated`). New tools ship `beta`; promotion needs live
evidence on staging. See [ADR 0003](docs/adr/0003-feature-control-and-releases.md).

## Labels

`type:*` (feat, bug, docs, chore, ci, security) · `area:<toolset>` · `lane:0NN` · `P0`/`P1`/`P2` ·
status labels mirroring the spec vocabulary (`blocked-external`, `needs-decision`,
`needs-security-review`).

## Never

- Commit secrets, tokens, customer data or real phone numbers/emails — including in fixtures,
  evidence and PR text.
- Run writes against production or customer instances without explicit owner approval.
