# 001 — Foundation · tasks

| ID | P | Size | Task | Done when | Status |
|---|---|---|---|---|---|
| FND-01 | P0 | M | Monorepo: move server to `packages/server`, pnpm workspace, root scripts | `pnpm typecheck` + `pnpm smoke` green from root | Done (2026-10-26, see verification) |
| FND-02 | P0 | S | GitHub repo `AirysChat/mcp` private; labels, milestones v0.2.0…v1.0.0, CODEOWNERS, templates, ruleset on `main` | Repo exists, PR template renders, ruleset blocks direct push (or plan limitation documented) | Done (2026-10-26: private repo, `scripts/github/bootstrap.sh` → 48 labels + 9 milestones, ruleset `main` active (PR + `check` + squash + linear), secret scanning + push protection, Dependabot alerts) |
| FND-03 | P0 | S | CI workflow: install, typecheck, smoke, unit tests, `inventory:check`, `pnpm audit --prod` | Required check green on the foundation PR | In progress |
| FND-04 | P0 | S | Changesets + `release.yml` (Version Packages PR; publish step gated on FND-11) | Release PR opens automatically after a changeset lands on `main` | In progress |
| FND-05 | P1 | S | Import `~/airyschat-claude-plugin` with history into `plugins/claude/`; root `.claude-plugin/marketplace.json` | `claude plugin marketplace add AirysChat/mcp` lists `airyschat`; history visible with `git log --follow` | Done (2026-10-26, subtree of `704fc8d`; `claude plugin validate --strict` passes for plugin and marketplace) |
| FND-06 | P0 | M | Upgrade `@modelcontextprotocol/server` 2.0→2.4.x, zod 4.6.x, TS; adapt to 2026-07-28 (cacheable `tools/list`, no logging capability) | `pnpm check` green, Inspector 2.12 connects | Planned |
| FND-07 | P0 | M | Stability tiers: `stability` in `ToolMetadata`, `AIRYSCHAT_FEATURES` filter, description prefix for non-stable, v0.1 tools classified per ADR 0003 | Smoke asserts default list = stable only; `beta` opt-in shows all | Planned |
| FND-08 | P0 | M | Unit tests (node:test or vitest): client error mapping, `untrustedJson`, `requireConfirmation`, toolset/feature filters, raw allowlist | `pnpm test` in CI, ≥ 80% lines on `src/*.ts` (excl. tools) | Planned |
| FND-09 | P1 | M | `outputSchema` + `structuredContent` for read tools (keep text fallback) | Inspector shows structured output for `me`, `inboxes_list`, `conversations_list` | Planned |
| FND-10 | P0 | M | Live-verify v0.1 (GET-only) on `staging.airys.app` account 6 via `.agents/skills/live-verify` | Every read tool has sanitized readback in `verification.md`; quirks filed as tasks | Planned |
| FND-11 | P1 | S | Distribution: publish to GitHub Packages; install docs for Claude Code, Claude Desktop, Codex, Gemini CLI, Antigravity, Cursor | `npx @airyschat/mcp@0.2.0` works with an `.npmrc` scoped to GitHub Packages | Planned |
| FND-12 | P2 | S | Spike: elicitation (form mode) / MRTR as an alternative to the `confirm` argument; write ADR | ADR 0005 accepted or rejected with client-support matrix | Planned |
| FND-13 | P0 | XS | Remove references to nonexistent `swagger/tag_groups/airyschat_swagger.json`; point to `application_swagger.json` + controllers | `grep -r airyschat_swagger` empty | Planned |
| FND-14 | P1 | XS | Read server `VERSION` from `package.json` (no hard-coded string) | Smoke asserts `serverInfo.version` = package version | Planned |
| FND-15 | P1 | S | Agent tooling: `.agents/skills`, `.agents/agents`, `.claude/{agents,skills}` symlinks, rules | Files committed; skills load in Antigravity and Claude Code | In progress |
| FND-16 | P2 | XS | Update `packages/server/README.md` (stale roadmap, links to root docs) | README links to `specs/README.md` | Done (2026-10-26, foundation PR) |
