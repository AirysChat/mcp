# ADR 0004 — Hosted MCP on Cloud Run

- Status: Accepted (2026-10-26); auth amended by [ADR 0006](0006-hosted-auth-scoped-mcp-tokens.md) (2026-10-27)
- Supersedes: the v0.1 README note that hosted MCP "belongs in the Rails app"

## Context

Customers on Claude.ai, ChatGPT, Muse and other hosted clients cannot spawn a local `npx` process;
they add a **remote MCP URL with OAuth**. HubSpot and Intercom ship exactly that. The MCP
2026-07-28 revision made the protocol stateless (no `initialize` handshake, no session id), so a
remote server can sit behind a plain load balancer.

Airys already runs GCP infrastructure in `airys-platform-{staging,prod}` (Cloud Run,
`southamerica-east1`, Terraform, WIF CI, global LB with Cloud Armor in front of `api.airys.chat`).

The v0.1 plan put HTTP inside Rails to reuse Pundit. In practice the server never re-implements
authorization: every call goes to the AirysChat API **with the user's own token**, so Pundit already
applies. A separate service keeps the Rails app free of MCP SDK churn and reuses this package's code.

## Decision

- **Same codebase, second entry point**: `packages/server` gains `src/http.ts` (Streamable HTTP,
  stateless) next to `src/index.ts` (stdio). Tool definitions are shared.
- **Runs on Cloud Run** in the `airys-platform-*` projects as service `mcp`, behind the existing
  edge at **`mcp.airys.chat`** (prod) — new host on the same LB/certificate, DNS-only in Cloudflare.
  Image built from this repo; Terraform for the service lives in `airys-platform/infra` (its rule 7:
  infra goes through Terraform there).
- **Neutrality**: the Airys API rule "no AirysChat-specific code path" is preserved — `mcp` is its
  own service and does not share code, cookies or sessions with `api`.
- **Instance allowlist**: the hosted service only talks to Airys-operated AirysChat hosts
  (`airys.chat`, `staging.airys.app`, managed customer instances) from a config list. No arbitrary
  base URL — that would be an SSRF primitive.
- **No server-side state** beyond OAuth artefacts; per-request config comes from the token.

### Auth, in phases

> **Superseded by [ADR 0006](0006-hosted-auth-scoped-mcp-tokens.md) (2026-10-27).** The owner chose
> option (c): AirysChat issues scoped, revocable, audience-bound MCP tokens; hosted accepts only
> those, and there is no interim phase forwarding full user tokens. The table below is kept for
> history.

| Phase | Mechanism | Clients |
|---|---|---|
| **1** (lane 005) | `Authorization: Bearer <AirysChat access token>` + `X-AirysChat-Account` header; host chosen from allowlist by header | Claude Code, Codex, Gemini CLI, Antigravity, Muse Code (custom headers) |
| **2** (lane 005b) | OAuth 2.1 + PKCE with **Client ID Metadata Documents** (DCR is deprecated). The `mcp` service is the authorization server; the login step is delegated to AirysChat | Claude.ai, ChatGPT, Muse and any connector directory |

Phase 2 needs an AirysChat endpoint that, after the user signs in, issues (or reveals) a scoped
token for the MCP service. AirysChat has `devise_token_auth` and no OAuth provider today. Options to
decide in lane 005: (a) add Doorkeeper to AirysChat as the AS; (b) `mcp` as AS + a small AirysChat
"authorize MCP" consent page that returns the user's access token over a back channel;
(c) per-user tokens minted for MCP with scopes and revocation (preferred long-term, needs AirysChat
work). Recorded as `NEEDS_PRODUCT_DECISION`.

## Consequences

- One more Cloud Run service (scale-to-zero; cost driven by traffic).
- Tokens transit the service: logs must never include headers or bodies (airys-platform rule 8).
- The npm package and the hosted service release together; the hosted service pins a package version.
