# Changesets

Every PR that changes what a user of `@airyschat/mcp` sees — a tool added, removed or renamed, a
description that changes model behaviour, a config variable, a default — carries a changeset:

```bash
pnpm changeset
```

Pick the bump by the user-visible effect, not the size of the diff:

| Bump | When |
|---|---|
| `patch` | Bug fix, description clarification, internal refactor with identical tool surface |
| `minor` | New tool or toolset, new optional argument, a tool promoted from `beta` to `stable` |
| `major` | Removed/renamed tool or argument, changed default, a write gate loosened (after 1.0) |

Before 1.0, breaking changes go in `minor` and are called out in the changeset text.

PRs that only touch specs, docs, CI or `.agents/` need no changeset.
See `.agents/skills/release/SKILL.md` for the full release procedure.
