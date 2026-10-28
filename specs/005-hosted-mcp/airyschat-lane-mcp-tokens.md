# AirysChat Lane Draft: `025-mcp-tokens-and-oauth` (REM-09)

Ready-to-open Spec Kit lane for `AirysChat/AirysChat` (`specs/025-mcp-tokens-and-oauth/`),
derived from [ADR 0006](../../docs/adr/0006-hosted-auth-scoped-mcp-tokens.md) and verified against
`origin/develop` of `~/AirysChat` (`app/controllers/concerns/access_token_auth_helper.rb`,
`app/controllers/api/base_controller.rb`, `app/models/access_token.rb`).

---

## 1. `specs/025-mcp-tokens-and-oauth/spec.md`

### Context

Today AirysChat authenticates API calls via `AccessTokenAuthHelper` (`api_access_token` header →
`AccessToken` polymorphic record on `User` or `AgentBot`). Each user has a single long-lived
`api_access_token` with the user's full Pundit permissions and no scopes, audience restriction,
expiration, or per-client revocation.

Hosted MCP (`https://mcp.airys.chat` / `https://mcp.staging.airys.chat`) connects third-party
assistants (Claude.ai, ChatGPT, Meta Muse, Claude Code, Codex, Gemini CLI, Antigravity). Per
`AirysChat/mcp` ADR 0006, AirysChat acts as the OAuth 2.1 Authorization Server and issues
**scoped, expiring, revocable, audience-bound MCP tokens** (`mcp_...`). The hosted MCP service is
a stateless Resource Server that validates tokens via `/oauth/introspect`.

### Goal

1. Users can connect Claude.ai, ChatGPT, or Muse via **OAuth 2.1 + PKCE (`S256`)** with a consent
   screen that displays the client identity (from its Client ID Metadata Document, CIMD), selects
   the target AirysChat `Account`, and lets the user choose access scopes (`mcp:read`, `mcp:write`,
   `mcp:irreversible`) and optional toolset restrictions (`mcp:toolset:<name>`).
2. Users can mint and revoke **Personal MCP Tokens** (`mcp_pat_...`, up to 90 days) in Profile
   Settings for CLI / IDE clients (Claude Code, Codex, Gemini CLI, Antigravity).
3. AirysChat API controllers enforce MCP token scopes in `AccessTokenAuthHelper` so a `mcp:read`
   token can never perform a non-GET request and a `mcp:write` token can never call an endpoint
   classified as `irreversible` in the shared MCP catalog — even if someone calls the AirysChat API
   directly without going through the MCP server.

### Data Model (`mcp_tokens` & `mcp_authorization_codes`)

#### `mcp_tokens` table (`McpToken`)

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` PK | |
| `user_id` | `bigint` NOT NULL FK | Token subject (user) |
| `account_id` | `bigint` NOT NULL FK | Single account binding (never spans accounts) |
| `client_id` | `string` NOT NULL | CIMD URL (OAuth) or `"personal:<label>"` (PAT) |
| `client_name` | `string` NOT NULL | Display name for audit & settings UI |
| `token_prefix` | `string` NOT NULL | First 12 chars (`mcp_at_...` or `mcp_pat_...`) for UI display |
| `token_digest` | `string` NOT NULL UNIQUE | SHA-256 hex digest of raw token (raw token is never stored) |
| `refresh_token_digest` | `string` NULL UNIQUE | SHA-256 hex digest of rotating refresh token (OAuth only) |
| `resource` | `string` NOT NULL | Audience URI (RFC 8707), e.g. `https://mcp.airys.chat/mcp` |
| `scopes` | `string[]` NOT NULL | e.g. `["mcp:read", "mcp:write", "mcp:toolset:crm"]` |
| `expires_at` | `datetime` NOT NULL | 1 hour (OAuth access token) or up to 90 days (PAT) |
| `refresh_expires_at` | `datetime` NULL | 30 days (OAuth refresh token) |
| `revoked_at` | `datetime` NULL | Set immediately on user/admin revocation or `/oauth/revoke` |
| `last_used_at` | `datetime` NULL | Throttled update (every 5 min) |
| `last_used_ip` | `string` NULL | Last caller IP |
| `created_at` / `updated_at` | `datetime` NOT NULL | |

#### `mcp_authorization_codes` table (`McpAuthorizationCode`)

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` PK | |
| `user_id` | `bigint` NOT NULL | |
| `account_id` | `bigint` NOT NULL | |
| `client_id` | `string` NOT NULL | |
| `client_name` | `string` NOT NULL | |
| `redirect_uri` | `string` NOT NULL | Must match CIMD `redirect_uris` |
| `resource` | `string` NOT NULL | RFC 8707 resource URL |
| `scopes` | `string[]` NOT NULL | Granted scopes |
| `code_digest` | `string` NOT NULL UNIQUE | SHA-256 digest of single-use code (TTL 5 min) |
| `code_challenge` | `string` NOT NULL | PKCE `S256` challenge |
| `used_at` | `datetime` NULL | Replay detection |
| `expires_at` | `datetime` NOT NULL | `5.minutes.from_now` |

### Endpoints

1. `GET /.well-known/oauth-authorization-server` — RFC 8414 metadata advertising
   `authorization_endpoint`, `token_endpoint`, `revocation_endpoint`, `introspection_endpoint`,
   `code_challenge_methods_supported: ["S256"]`, `client_id_metadata_document_supported: true`, and
   `scopes_supported`.
2. `GET /oauth/authorize` & `POST /oauth/authorize` — Authenticates the user via Devise session,
   fetches and validates the client's CIMD document (HTTPS, SSRF-safe resolver, matching `client_id`
   and `redirect_uri`), validates `resource` against the allowlisted MCP resource URLs, and renders
   the consent screen (account selector + scope checkboxes, defaulting to `mcp:read` with
   `mcp:irreversible` unchecked by default).
3. `POST /oauth/token` — Exchanges `authorization_code` (+ `code_verifier`, `resource`,
   `redirect_uri`) or `refresh_token` (rotating) for an `mcp_at_<random>` access token (`expires_in: 3600`).
4. `POST /oauth/revoke` — RFC 7009 token revocation (`revoked_at = Time.current`).
5. `POST /oauth/introspect` — RFC 7662 token introspection used by `@airyschat/mcp` (`src/auth.ts`).
   Returns:
   ```json
   {
     "active": true,
     "token_type": "mcp",
     "client_id": "https://claude.ai/oauth/client-metadata.json",
     "sub": "user:42",
     "account_id": 6,
     "aud": "https://mcp.airys.chat/mcp",
     "scope": "mcp:read mcp:write mcp:toolset:crm",
     "exp": 1793200000
   }
   ```
6. `GET / POST / DELETE /saas/api/v1/accounts/:account_id/mcp_tokens` — CRUD for Personal MCP Tokens
   and connected OAuth clients in Profile Settings (and Account Admin view to revoke any member's
   MCP token).

### Controller Scope Enforcement (`AccessTokenAuthHelper`)

In `app/controllers/concerns/access_token_auth_helper.rb`:
- Extract token from `Authorization: Bearer mcp_...` or `api_access_token: mcp_...`.
- When the token starts with `mcp_`, look up `McpToken.active.find_by_raw_token(token)`:
  1. Reject with `401 Unauthorized` if missing, expired, or `revoked_at.present?`.
  2. Reject with `403 Forbidden` if `params[:account_id].present? && params[:account_id].to_i != mcp_token.account_id` (an MCP token never spans accounts).
  3. Enforce access scope:
     - Non-`GET`/`HEAD` requests require `mcp:write` or `mcp:irreversible`.
     - Requests matching an irreversible endpoint in `config/mcp_irreversible_routes.yml` (synced from
       `@airyschat/mcp`'s `catalog.json`) require `mcp:irreversible`.
     - If `mcp_token` has `mcp:toolset:*` scopes, verify the controller belongs to an allowed toolset.
  4. Set `Current.user = mcp_token.user` so Pundit authorization still applies as a hard ceiling.

---

## 2. `specs/025-mcp-tokens-and-oauth/tasks.md`

| ID | P | Size | Task | Done when |
|---|---|---|---|---|
| MCP-01 | P0 | M | Migration + `McpToken` and `McpAuthorizationCode` models (SHA-256 digest lookup, expiry, revocation, scopes validation) | Model specs green (`bundle exec rspec spec/models/mcp_token_spec.rb`) |
| MCP-02 | P0 | M | Extend `AccessTokenAuthHelper` for `mcp_` tokens: account binding, `mcp:read`/`mcp:write`/`mcp:irreversible` + `mcp:toolset:*` enforcement | Request specs green for read-only, write, and irreversible endpoints |
| MCP-03 | P0 | M | OAuth 2.1 AS endpoints: `/.well-known/oauth-authorization-server`, `/oauth/token` (PKCE S256 + refresh rotation), `/oauth/revoke`, `/oauth/introspect` | Request specs green; matches `@airyschat/mcp` `AirysChatTokenIntrospector` contract |
| MCP-04 | P0 | M | CIMD validator + `/oauth/authorize` consent screen (Vue / Rails view with account picker and scope selector) | Consent flow spec green; SSRF-safe CIMD fetch |
| MCP-05 | P1 | M | Personal MCP Tokens & connected clients management API + Settings UI (`/saas/api/v1/accounts/:id/mcp_tokens`) | User can create a 90d PAT and revoke OAuth/PAT tokens in Settings |
| MCP-06 | P0 | S | End-to-end staging verification with `@airyschat/mcp` HTTP server (`REM-10` / `REM-11`) | Sanitized evidence recorded in `verification.md` |
