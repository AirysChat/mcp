---
name: sync-api-inventory
description: Refresh docs/api/inventory.csv and coverage.md from the current AirysChat routes (origin/develop). Use when AirysChat shipped new endpoints, when inventory:check fails, or before planning a coverage lane.
---

# Sync the API inventory

The inventory is the backlog for "every AirysChat action" (ADR 0002). It is regenerated from a
`bin/rails routes` dump; the dump itself is never committed.

## Steps

1. **Get a clean read of develop without touching the working checkout.** Use a throwaway worktree:

   ```bash
   cd ~/AirysChat && git fetch origin develop
   git worktree add /tmp/airyschat-routes origin/develop --detach
   cd /tmp/airyschat-routes && eval "$(rbenv init - zsh)" && bundle install --quiet
   bundle exec rails routes > /tmp/airys_routes.txt
   SHA=$(git rev-parse --short=10 HEAD)
   ```

   If booting Rails needs services that are not running, reuse the main checkout **only if it is
   clean and on develop** (`git -C ~/AirysChat status --short` empty). Never stash or switch
   branches in the owner's checkout.

2. **Merge** into the inventory:

   ```bash
   cd ~/airyschat-mcp
   pnpm inventory -- --routes /tmp/airys_routes.txt --source "$SHA"
   ```

3. **Review the diff** of `docs/api/inventory.csv`:
   - New domains land with defaults from `scripts/inventory/domains.json`. If a domain is new, add
     it there with `[toolset, release]` (or to `exclude` with a reason) and re-run.
   - Rows with `coverage=removed` mean AirysChat dropped an endpoint. If a curated tool used it,
     open a task in the owning lane (`IMPLEMENTED_BUT_DOC_STALE` or a fix).
4. **Check**: `pnpm inventory:check`.
5. **Commit** on a branch `chore/002-inventory-<sha>`: `chore(inventory): sync with AirysChat@<sha>`.
6. Clean up: `git -C ~/AirysChat worktree remove /tmp/airyschat-routes --force`.

## Notes

- macOS has no `timeout`; long boots are fine (~5 s with spring off).
- In zsh, quote `"${BRANCH}:${PATH}"` in `git show` — `$B:s` is a zsh modifier.
- Only method, path and controller#action are stored. No tenant data ever.
