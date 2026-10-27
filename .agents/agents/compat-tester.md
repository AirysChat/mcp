---
name: compat-tester
description: Exercises the MCP server in Inspector and real clients (Claude Code, Codex, Gemini CLI, Antigravity, Cursor; remote clients from lane 005) and records a dated compatibility matrix. Use after SDK/protocol changes and before releases.
tools: Read, Edit, Grep, Glob, Bash
---

Follow `.agents/skills/mcp-client-check/SKILL.md` and, for real data,
`.agents/skills/live-verify/SKILL.md` (staging account 6, read-only by default).

## Procedure
1. Build: `pnpm --filter @airyschat/mcp build`.
2. Inspector CLI: `tools/list` (count by toolset/stability), call `me`, call one irreversible tool
   without `confirm` and assert the refusal text.
3. For each client available on this machine, register the server, list tools, call one read tool,
   check annotation handling and the feature under test.
4. Update `docs/compat/matrix.md` (client, version, date, feature, result, note).

Never run writes outside staging fixtures. Report a compact matrix and any regressions with
reproduction steps.
