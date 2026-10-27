# ADR 0006 — Hosted MCP auth: scoped, revocable MCP tokens issued by AirysChat

- Status: Accepted (2026-10-27, owner decision on issue "Decision: OAuth design for hosted MCP")
- Amends: ADR 0004 § "Auth, in phases"
- Rejected: (a) Doorkeeper-only AS reusing full user tokens; (b) `mcp` as AS returning the user's
  existing access token over a back channel

## Context

ADR 0004 left the hosted auth design open. AirysChat today has `devise_token_auth` and a single
long-lived `api_access_token` per user with the user's full permissions, and no OAuth provider.
Handing that token to third-party assistants (Claude.ai, ChatGPT, Muse) means a leak equals full
account takeover, with no way to limit it to "read only" or "no sends", and no per-client revocation.
The MCP authorization spec (2026-07-28) expects OAuth 2.1 + PKCE, Client ID Metadata Documents
(CIMD) and audience-bound tokens (RFC 8707). The SDK advisory fixed in 2.3.0 ("bearer authentication
accepted tokens issued for another service") is exactly the failure mode audience binding prevents.

## Decision

**AirysChat becomes the authorization server and issues MCP tokens: scoped, expiring, revocable,
audience-bound. The hosted `mcp` service is only a resource server.** We skip the interim
"forward the user's full token" phase; hosted ships when this exists.

### Token model (AirysChat)

| Property | Value |
|---|---|
| Subject | user × account (one token never spans accounts) |
| Audience | the MCP resource URL (e.g. `https://mcp.airys.chat`); rejected anywhere else |
| Access scopes | `mcp:read` ⊂ `mcp:write` ⊂ `mcp:irreversible` (sends, Meta writes, deletes, merges, deal won) |
| Toolset scopes | optional `mcp:toolset:<name>` restriction (e.g. only `crm`, `reports`) |
| Ceiling | never exceeds the user's Pundit permissions |
| Lifetime | access token 1 h; rotating refresh token 30 d (OAuth); personal MCP tokens up to 90 d |
| Revocation | per token/client, from the user's profile and by account admins; immediate |
| Audit | client name, created, last used, scopes, IP of last use |

**Enforcement is in AirysChat**, not only in the MCP server: requests authenticated with an MCP
token are checked against scope (GET → `read`; non-GET → `write`; endpoints classified irreversible
in the shared catalog → `irreversible`). The MCP server additionally hides tools the token cannot use.

### Flows

1. **OAuth 2.1 + PKCE** (Claude.ai, ChatGPT, Muse, connector directories): AirysChat exposes
   `/.well-known/oauth-authorization-server`, `/oauth/authorize` (login + consent screen listing
   scopes and the client identity from its CIMD), `/oauth/token`, `/oauth/revoke`,
   `/oauth/introspect`. Resource indicators bind the token to the MCP URL.
2. **Personal MCP tokens** (Claude Code, Codex, Gemini CLI, Antigravity, Cursor with headers): the
   user creates a scoped token in AirysChat settings and sends `Authorization: Bearer`. Same token
   type, same enforcement.
3. **stdio (local npm package)** keeps accepting the classic `api_access_token` for backward
   compatibility, and accepts MCP tokens too. **The hosted service accepts only MCP tokens.**

### Resource server (`mcp` on Cloud Run)

- Publishes `/.well-known/oauth-protected-resource` pointing at the instance's AirysChat AS.
- Validates via introspection (cached ≤ 60 s, so revocation lands within a minute); checks audience,
  expiry, account and scopes; never logs tokens (fingerprint only).
- Instance selection: `mcp.airys.chat` → `airys.chat`; `mcp.staging.airys.chat` →
  `staging.airys.app`; managed instances via an allowlisted path prefix (`/<instance>/mcp`).
  Open question for lane 005.

## Consequences

- Needs a lane **in AirysChat** (token model, OAuth endpoints, consent UI, scope enforcement,
  settings UI). Lane 005 tasks that depend on it are `BLOCKED_EXTERNAL`.
- Hosted MCP moves after WhatsApp & reports in the release train (release renumbering on
  2026-10-27: hosted is now **0.6.0**).
- Customers get a safe story for third-party assistants: read-only connectors by default,
  irreversible scope opt-in, one-click revocation.
- The irreversible classification (lane 002, CAT-08) becomes security-relevant and is shared with
  AirysChat.
