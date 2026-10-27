# 005 — Hosted MCP (Cloud Run) with scoped MCP tokens

- Release: **0.6.0** (renumbered 2026-10-27, was 0.5.0) · Target 2027-03-01 · Prefix `REM`
- ADRs: 0004 (hosting), **0006 (auth: scoped, revocable MCP tokens issued by AirysChat)**
- Depends on: 001, 002 (irreversible classification, CAT-08) · External: AirysChat lane "MCP tokens &
  OAuth" (to be opened in `AirysChat/AirysChat`), `airys-platform` Terraform

## Why

Claude.ai, ChatGPT, Muse and connector directories only accept **remote MCP URLs** with OAuth.
Hosted is how non-developers get AirysChat into their assistant. The owner chose to ship it only
with **scoped, revocable, audience-bound tokens** (ADR 0006): no third-party assistant ever holds a
user's full-permission AirysChat token.

## What

### In this repo

- `packages/server/src/http.ts`: Streamable HTTP, stateless, same tool registry as stdio.
- Resource server: `/.well-known/oauth-protected-resource`, token introspection against the
  instance's AirysChat (cache ≤ 60 s), audience/expiry/account/scope checks, `WWW-Authenticate`
  challenges per the MCP auth spec.
- Tool list filtered by token scopes (`mcp:read|write|irreversible`, `mcp:toolset:*`); hosted accepts
  **only MCP tokens**; stdio keeps accepting classic `api_access_token`.
- Instance mapping from an allowlist (anti-SSRF); request size limits, per-token rate limit, timeouts.
- Logging: structured, **no headers or bodies**, token fingerprint only.
- Container image (distroless Node 24) built by GitHub Actions via WIF into Artifact Registry.

### External

- **AirysChat** (owner's lane there): MCP token model, OAuth 2.1 AS (`authorize`, `token`, `revoke`,
  `introspect`, AS metadata, CIMD clients, PKCE, resource indicators), consent screen, settings UI
  for personal MCP tokens and revocation, scope enforcement on the API.
- **airys-platform** Terraform: Cloud Run service `mcp`, serverless NEG, host rules
  `mcp.airys.chat` / `mcp.staging.airys.chat`, Cloud Armor policy reuse.

## Acceptance

- Claude.ai custom connector completes OAuth against staging and lists only the scopes granted.
- Claude Code, Codex, Gemini CLI and Antigravity connect with a personal MCP token.
- A `mcp:read` token cannot call a write tool (refused by the MCP server **and** by AirysChat).
- Revoking a token in AirysChat blocks the next call within 60 s.
- A token whose audience is not the MCP URL, or a classic `api_access_token`, is rejected by hosted.
- Non-allowlisted instance → 400 without an outbound request.
- `safety-reviewer` + security review recorded; load test 50 rps with p95 < 800 ms excluding upstream.
