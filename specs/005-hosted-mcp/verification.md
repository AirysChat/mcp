# 005 — Hosted MCP · Verification

- **Date**: 2026-10-28
- **Scope**: `REM-01..REM-06`, `REM-08`, `REM-09`, `REM-12`, `REM-13`, `REM-15` (with `REM-07`, `REM-10`, `REM-11`, `REM-14` tracked as `BLOCKED_EXTERNAL` awaiting `airys-platform/infra` Terraform apply and `AirysChat/AirysChat` lane `025-mcp-tokens-and-oauth`).

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
- **AirysChat Lane (`REM-09`)**: [`specs/005-hosted-mcp/airyschat-lane-mcp-tokens.md`](airyschat-lane-mcp-tokens.md) ready to open as `specs/025-mcp-tokens-and-oauth` in `AirysChat/AirysChat`.
