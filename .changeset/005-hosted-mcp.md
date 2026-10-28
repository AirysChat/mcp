---
'@airyschat/mcp': minor
---

Add the stateless Streamable HTTP server (`airyschat-mcp-http` / `dist/http.js`) and OAuth 2.1 Resource Server for hosted MCP (`REM-01..REM-06`, `REM-09`, `REM-12`, `REM-13`, `REM-15`):

- **Per-request server factory (`src/server.ts`)**: shares toolset selection and registration between `src/index.ts` (stdio) and `src/http.ts` (Streamable HTTP) with zero process-global state in tool handlers.
- **OAuth 2.1 Resource Server (`src/auth.ts`)**: serves RFC 9728 Protected Resource Metadata (`/.well-known/oauth-protected-resource`), validates scoped AirysChat MCP tokens (`mcp_...`) via `/oauth/introspect` with a bounded SHA-256-keyed cache (TTL ≤ 60 s), enforces audience (`aud`), expiration (`exp`), and single-account (`account_id`) binding, rejects classic `api_access_token` keys on hosted HTTP, and emits `WWW-Authenticate` challenges.
- **Scope-based tool filtering & pre-call refusal (`src/config.ts`, `src/toolsets.ts`, `src/tools/raw.ts`)**: enforces `mcp:read` ⊂ `mcp:write` ⊂ `mcp:irreversible` and optional `mcp:toolset:<name>` restrictions across `tools/list`, tool execution, and the `airyschat_api` escape hatch (also available locally via `AIRYSCHAT_SCOPES`).
- **Anti-SSRF instance allowlist & managed-instance routing (`/<instance>/mcp`)**: maps `mcp.airys.chat`, `mcp.staging.airys.chat`, and allowlisted `/<instance>/mcp` routes (`AIRYSCHAT_ALLOWED_INSTANCES`), rejecting unknown instances with `400` before any outbound call; enforces 256 KiB request body limits, per-token sliding-window rate limiting (`429`), and secret-free structured JSON logging (`token_fp` only).
- **Containerization (`Dockerfile`, `.github/workflows/image.yml`)**: multi-stage distroless Node 24 container (`gcr.io/distroless/nodejs24-debian12:nonroot`) and Workload Identity Federation build/deploy workflow.
