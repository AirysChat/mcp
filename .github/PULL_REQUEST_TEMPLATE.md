## What

<!-- One task per PR. Title is a Conventional Commit: type(scope): subject -->

Lane task: <!-- e.g. CRM-04 --> · Closes #

## Why

## How verified

- [ ] `pnpm check` (typecheck, smoke, inventory:check)
- [ ] Live readback on staging account 6 (if promoting or changing behaviour) — evidence in `specs/<lane>/verification.md`

## Safety (tools, transport, auth)

- [ ] Customer content returns through `untrustedJson`
- [ ] Writes set `write: true`; irreversible ones use `requireConfirmation` with an exact preview
- [ ] No secrets or tenant data in code, fixtures, docs or this PR
- [ ] `scripts/inventory/curated.json` updated for new/changed tools
- [ ] Changeset added (`pnpm changeset`) if the tool surface or config changed
