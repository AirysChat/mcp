# 005 — Hosted MCP · Verification

- **Date**: 2026-10-30
- **Scope**: `REM-01..REM-15` (all tasks complete, including live staging E2E and `REM-14` `mcp.airys.chat` production cutover).

## 1. Automated Verification (`pnpm check`)

- `pnpm typecheck`: passed (`tsc --noEmit` across `src` and `test`).
- `pnpm test`: `44/44` unit tests passing (`97.20%` line coverage, `87.05%` branch coverage, `93.14%` function coverage across `src/auth.ts`, `src/http.ts`, `src/server.ts`, `src/config.ts`, `src/client.ts`, `src/result.ts`, `src/toolsets.ts`, and `src/catalog.ts`).
- `pnpm smoke`: `62/62` end-to-end assertions passing over both local `stdio` (`dist/index.js`) and stateless Streamable HTTP (`dist/http.js`), verifying:
  - `/healthz` (`200 OK`) and RFC 9728 `/.well-known/oauth-protected-resource` (`200 OK` pointing at the instance's AirysChat OAuth 2.1 AS).
  - Anti-SSRF allowlist enforcement: non-allowlisted instance (`/unlisted.internal/mcp`) returns `400 unknown_instance` with **zero outbound HTTP requests**.
  - OAuth 2.1 Bearer verification & `WWW-Authenticate` challenges: classic `api_access_token` keys, wrong-audience tokens (`aud` mismatch), expired tokens, and revoked tokens (`active: false`) return `401 Unauthorized` with `WWW-Authenticate: Bearer error="invalid_token", ..., resource_metadata="..."`.
  - Scope-based tool filtering & pre-call refusal (`mcp:read` ⊂ `mcp:write` ⊂ `mcp:irreversible`, `mcp:toolset:*`):
    - `mcp:read` token sees only read-only tools (`readOnlyHint: true`), fences customer data with `untrustedJson`, and refuses non-GET calls on `airyschat_api`.
    - `mcp:write` + `mcp:toolset:core` token exposes reversible core writes (`conversation_labels_add`), hides `irreversible: true` tools (`conversation_reply`) and ungranted toolsets (`whatsapp`), and refuses ungranted toolset or irreversible endpoints in `airyschat_api`.
  - Secret-free structured logging: verified that zero log lines contain Bearer tokens or customer conversation content.
- `pnpm inventory:check`: consistent (`807` endpoints, `150` tools).

## 2. Load Benchmark (`REM-13`)

- **Command**: `node packages/server/scripts/load-test.mjs` (200 concurrent Streamable HTTP requests alternating `tools/list` and `tools/call` against `dist/http.js` backed by an in-process mock AirysChat instance).
- **Result**: `200 reqs @ 713.9 rps | p50=20.18ms | p95=91.03ms | p99=122.68ms` (exceeds the `50 rps` / `p95 < 800 ms` target by >14×).
- **k6 Script**: [`specs/005-hosted-mcp/k6-load-test.js`](k6-load-test.js) ready for staging execution once `REM-07` and `REM-10` land.

## 3. Security Review (`REM-12`)

- Recorded in [`docs/security/005-hosted-mcp.md`](../../docs/security/005-hosted-mcp.md) (`PASS` across SSRF, token handling/audience binding, scope bypass prevention, DoS/container hardening, and prompt-injection surface).

## 4. Infrastructure & Staging Provisioning (`REM-07`, `REM-09`)

- **Terraform (`REM-07`, Done 2026-10-29)**: Merged via `AirysBR/airys-platform#28` (`7bf662b`) and applied in `airys-platform-staging` (CI run `40874305967`, `Plan: 13 to add, 0 to change, 0 to destroy`):
  - Dedicated Workload Identity Pool `airyschat-mcp` + provider `github` and least-privilege `deployer-mcp@airys-platform-staging.iam.gserviceaccount.com`.
  - Cloud Run v2 service `mcp` (`https://mcp-tdtyqbghua-rj.a.run.app`) running under `run-mcp@airys-platform-staging.iam.gserviceaccount.com` + Secret Manager container `mcp-introspection-secret`.
  - Prod edge routing (`mcp.airys.chat`) planned (`0 to destroy`, separate managed SSL certificate `google_compute_managed_ssl_certificate.mcp`).
- **AirysChat Lane (`REM-09`, `REM-10`, Done 2026-10-29)**: Implemented in `AirysChat/AirysChat` lane `specs/025-mcp-tokens-and-oauth` (`AirysChat/AirysChat#498`, `21/21` CI + CodeQL checks green, merged to `develop` at `06ffe3a63f`) and deployed to `https://staging.airys.app` (workflow run `40889339934`).

## 5. Live Staging End-to-End Verification (`REM-10`, `REM-11` — 2026-10-29)

- **Date**: 2026-10-29
- **Targets**:
  - Authorization Server & Upstream API: `https://staging.airys.app` (account `6`, "Airys Demo", fictitious data)
  - Hosted MCP Resource Server (Cloud Run): `https://mcp-tdtyqbghua-rj.a.run.app` (`@airyschat/mcp@0.6.0`)
- **Result**: `18/18` live end-to-end checks passed (`0` failures); all temporary personal MCP tokens (`4` tokens) deleted with `204 No Content` in `finally`.

| Check | Endpoint / Transport | Observed Status & Sanitized Evidence |
|---|---|---|
| `hosted_mcp_health` | `GET /health` on Cloud Run | `200 OK` (`{"status":"ok","version":"0.6.0"}`) |
| `hosted_mcp_protected_resource_metadata` | `GET /.well-known/oauth-protected-resource` | `200 OK` (`resource: "https://mcp-tdtyqbghua-rj.a.run.app/mcp"`, `authorization_servers: ["https://staging.airys.app"]`, `12` scopes) |
| `hosted_mcp_unknown_instance_ssrf_block` | `POST /unlisted.internal/mcp` | `400 Bad Request` (`unknown_instance`, zero outbound HTTP requests) |
| `airyschat_oauth_as_metadata` | `GET /.well-known/oauth-authorization-server` (`Origin: https://claude.ai`) | `200 OK` (`issuer: "https://staging.airys.app"`, `code_challenge_methods_supported: ["S256"]`, `client_id_metadata_document_supported: true`, `Access-Control-Allow-Origin: *`, `12` scopes) |
| `airyschat_oauth_authorize_unauthenticated_redirect` | `GET /oauth/authorize?client_id=...&code_challenge_method=S256&resource=...` | `302 Found` → `/app/login?redirect_to=%2Foauth%2Fauthorize...` |
| `hosted_mcp_rejects_classic_token` | `POST /mcp` (`Authorization: Bearer <classic_api_access_token>`) | `401 Unauthorized` with `WWW-Authenticate: Bearer ..., resource_metadata="https://mcp-tdtyqbghua-rj.a.run.app/.well-known/oauth-protected-resource"` |
| `personal_tokens_list_redacts_plaintext` | `POST` + `GET /saas/api/v1/accounts/6/mcp_tokens` | `201 Created` returns one-time `mcp_...`; subsequent `GET` returns `200 OK` with `token_prefix` only (`plain_token` absent) |
| `hosted_mcp_protocol_apps_and_oauth_token_endpoint` | `POST /mcp` (`initialize` `2025-11-25`, stateless `Accept: application/json` `tools/list`, `resources/list`) + `POST /oauth/token` | `200 OK` (`protocolVersion: "2025-11-25"`, `3` `ui://airyschat/*` MCP App resources); invalid grant on `/oauth/token` returns RFC 6749 `400 invalid_grant` with CORS |
| `token_read_tools_list_filtering` | `POST /mcp` `tools/list` (`mcp:read` token) | `200 OK` (`35` tools exposed; `100%` `readOnlyHint: true`; write & irreversible tools hidden) |
| `token_read_me_call_and_classic_token_redaction` | `POST /mcp` `tools/call` `me` (`mcp:read` token) | `200 OK` (`isError: false`; classic `access_token` redacted from `/api/v1/profile` response) |
| `token_read_conversations_list_fenced` | `POST /mcp` `tools/call` `conversations_list` (`mcp:read` token) | `200 OK` (`isError: false`; `untrustedJson` prompt-injection notice present) |
| `token_read_airyschat_api_precall_write_refusal` | `POST /mcp` `tools/call` `airyschat_api` (`POST /api/v1/accounts/6/labels` with `mcp:read`) | `200 OK` (`isError: true`, refused pre-call before upstream dispatch) |
| `upstream_rails_defense_in_depth_token_a` | Direct Rails API calls with `Authorization: Bearer mcp_...` (`mcp:read`, account `6`) | `GET` same account → `200`; `POST /labels` → `403 insufficient_scope`; `GET /accounts/1/conversations` → `403 account_mismatch`; `POST /mcp_tokens` → `403 forbidden_for_mcp_token` |
| `token_core_write_toolset_and_irreversible_boundaries` | `POST /mcp` `tools/list` + direct Rails API (`mcp:read mcp:write mcp:toolset:core`) | `23` tools (`conversation_labels_add` exposed; `conversation_reply`, `crm_*`, `wa_*` hidden); direct `GET /crm_saved_views` → `403 insufficient_scope`; direct `DELETE /labels/:id` → `403 insufficient_scope` |
| `token_wrong_audience_rejected` | `POST /mcp` on staging Cloud Run with token bound to `https://mcp.airys.chat/mcp` | `401 Unauthorized` (`aud` mismatch rejected) |
| `hosted_mcp_2026_mrtr_elicitation_gate` | `POST /mcp` `tools/call` `conversation_reply` without `confirm` (`_meta["io.modelcontextprotocol/clientCapabilities"].elicitation`) | `200 OK` (`resultType: "input_required"`, HMAC-signed `requestState` present, zero upstream write executed) |
| `token_revocation_and_cache_ttl` | `POST /oauth/revoke` → `POST /oauth/introspect` → `POST /mcp` poll | `/oauth/revoke` → `200`; `/oauth/introspect` immediately `{"active":false}`; Cloud Run evicted cached entry and returned `401` after `54,007 ms` (`<= 60 s` TTL) |
| `local_stdio_against_live_staging` | Local `dist/index.js` over `stdio` → `https://staging.airys.app` account `6` | `initialize` (`2025-11-25`), `me`, `inboxes_list`, and fenced `conversations_list` all `PASS` |

## 6. Live Production Cutover & GET-Only Verification (`REM-14` — 2026-10-30)

- **Date**: 2026-10-30
- **Owner Approval**: Explicit owner approval granted in conversation before dispatching production workflows or configuring DNS.
- **Production Rollout**:
  - **`AirysBR/airys-platform` Terraform (`prod`)**: Workflow `terraform.yml` run `41107957510` applied Cloud Run service `mcp` (`https://mcp-164414754876.southamerica-east1.run.app`), dedicated Workload Identity Pool `airyschat-mcp` (`deployer-mcp@airys-platform-prod.iam.gserviceaccount.com`), Serverless NEG + Backend Service + URL Map host rule + Cloud Armor policy + Google-managed SSL certificate for `mcp.airys.chat`, and `reconcile-usage` schedule (`AirysBR/airys-platform#30` `367ec54` granted staging registry reader access).
  - **`AirysBR/airys-platform` API (`https://api.airys.chat`)**: Workflow `deploy.yml` run `41108725241` executed migration `0014_pricing_usage` and promoted commit `a292f204fd3d79482a8188f004a6a86ff798d30e` (`revision: "api-00018-65f"`).
  - **`AirysChat/mcp` Cloud Run (`https://mcp.airys.chat`)**: Workflow `image.yml` run `41109347284` promoted staging-verified commit `a33571c213f5b2bab5c4db0acb7a14d05efd5ffe` to `airys-platform-prod`.
  - **DNS & TLS**: Cloudflare DNS-only (`proxied: false`) `A` record `mcp.airys.chat` → `8.233.87.110`; Google Trust Services (`CN=WR3`, SAN `DNS:mcp.airys.chat`) certificate `ACTIVE` on Global External Application Load Balancer.
- **GET-Only Production Smoke Result**: `7/7` checks passed (`0` writes executed):

| Check | Target & Method | Observed Status & Sanitized Evidence |
|---|---|---|
| `prod_mcp_healthz` | `GET https://mcp.airys.chat/healthz` | `200 OK` (`{"status":"ok","version":"0.6.0"}`, TLS `O=Google Trust Services, CN=WR3`, SAN `DNS:mcp.airys.chat`) |
| `prod_mcp_health` | `GET https://mcp.airys.chat/health` | `200 OK` (`{"status":"ok","version":"0.6.0"}`) |
| `prod_mcp_protected_resource` | `GET https://mcp.airys.chat/.well-known/oauth-protected-resource` | `200 OK` (`resource: "https://mcp.airys.chat/mcp"`, `authorization_servers: ["https://airys.chat"]`, `12` scopes) |
| `prod_mcp_oauth_challenge` | `GET https://mcp.airys.chat/mcp` (no `Authorization`) | `401 Unauthorized` (`WWW-Authenticate: Bearer error="invalid_token", ..., scope="mcp:read", resource_metadata="https://mcp.airys.chat/.well-known/oauth-protected-resource"`) |
| `prod_mcp_ssrf_allowlist_block` | `GET https://mcp.airys.chat/unlisted.internal/mcp` | `400 Bad Request` (`unknown_instance`, zero outbound HTTP requests) |
| `prod_airyschat_oauth_as` | `GET https://airys.chat/.well-known/oauth-authorization-server` (`Origin: https://claude.ai`) | `200 OK` (`issuer: "https://airys.chat"`, `Access-Control-Allow-Origin: *`, PKCE `S256`, `client_id_metadata_document_supported: true`, `12` scopes) |
| `prod_platform_api_health` | `GET https://api.airys.chat/health` | `200 OK` (`environment: "prod"`, `commit: "a292f204fd3d79482a8188f004a6a86ff798d30e"`, `revision: "api-00018-65f"`) |
