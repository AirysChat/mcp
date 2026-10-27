---
trigger: glob
globs: packages/**
description: MCP protocol targets and tool-design conventions for the server packages.
---

# MCP protocol conventions

## Targets (verified 2026-10-26)

- Protocol revision **2026-07-28** (stateless core, MRTR, cacheable lists, extensions framework).
- SDK: `@modelcontextprotocol/server` 2.x (latest 2.4.0). Upgrade within the major freely; read the
  SDK changelog for anything touching `registerTool`, transports or results.
- Transports: **stdio** for the npm package; **Streamable HTTP, stateless** for the hosted service
  (lane 005). Never implement HTTP+SSE.

## Do not adopt (deprecated in 2026-07-28)

Roots, Sampling, Logging (log to stderr / OpenTelemetry), `includeContext: thisServer|allServers`,
OAuth Dynamic Client Registration (use Client ID Metadata Documents), HTTP+SSE transport.

## Planned adoption

| Feature | Lane | Replaces |
|---|---|---|
| Elicitation via MRTR (`input_required`) | 001 spike → 007 | `confirm: true` speed bump, kept as fallback |
| `outputSchema` + `structuredContent` | 001 | text-only JSON for list/get tools |
| List caching hints (`ttlMs`, `cacheScope`) | 005 | — |
| Tasks extension | 007 | polling loops for evals / imports / exports |
| MCP Apps (`ui://`, `_meta.ui`) | 007 | text-only CRM board, preflight report |

## Tool design

- Name: `<domain>_<verb>` or `<domain>_<noun>_<verb>`, snake_case, ≤ 40 chars; WhatsApp tools keep `wa_`.
- Collapse verb families into one tool when arguments are shared (see `conversation_update`); don't
  mirror every endpoint. The long tail stays behind `airyschat_api` until it earns a tool.
- Input schemas are Zod; describe every non-obvious field; IDs are `z.number().int()`.
- List tools expose pagination explicitly and say whether the result is complete.
- Keep the default tool list small: a toolset should stay under ~25 tools.
