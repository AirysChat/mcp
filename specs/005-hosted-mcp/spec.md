# 005 — Hosted MCP (Cloud Run)

- Release: **0.5.0** · Target 2027-01-11 · Prefix `REM` · ADR 0004
- Depends on: 001 (stateless-ready SDK), 003/004 recommended · External: `airys-platform` Terraform

## Why

Claude.ai, ChatGPT, Muse and connector directories only accept **remote MCP URLs**. Hosted is how
non-developers get AirysChat into their assistant. MCP 2026-07-28 is stateless, so the service can
scale to zero behind the existing load balancer.

## What

- `packages/server/src/http.ts`: Streamable HTTP, stateless, same tool registry as stdio.
- Per-request config from headers (phase 1): `Authorization: Bearer <AirysChat token>`,
  `X-AirysChat-Account`, `X-AirysChat-Instance` (must match allowlist), `X-AirysChat-Toolsets`,
  `X-AirysChat-Features`, `X-AirysChat-Read-Only`.
- Instance allowlist (anti-SSRF), request size limits, per-token rate limit, timeouts.
- Logging: structured, **no headers or bodies**, token fingerprint only.
- Container image (distroless Node 24), built and pushed by GitHub Actions via WIF to Artifact
  Registry in `airys-platform-*`.
- Terraform (PR in `airys-platform/infra`): Cloud Run service `mcp`, serverless NEG, host rule
  `mcp.airys.chat` / `mcp.staging.airys.chat`, Cloud Armor policy reuse, secrets none (stateless).
- `/.well-known/oauth-protected-resource` stub ready for phase 2.

### 005b — OAuth (phase 2, can slip to 1.0)

OAuth 2.1 + PKCE with Client ID Metadata Documents; option chosen by the owner (see ADR 0004).

## Acceptance

- Claude Code, Codex, Gemini CLI and Antigravity connect to `mcp.staging.airys.chat` with headers
  and list/call tools against staging account 6.
- Non-allowlisted instance header → 400 without outbound request (test).
- `safety-reviewer` + security review recorded; load test 50 rps with p95 < 800 ms excluding
  upstream.
