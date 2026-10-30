# 009 — Airys API (`platform` toolset) · verification

- **Date**: 2026-10-30
- **Targets**:
  - Staging: `https://api-tdtyqbghua-rj.a.run.app` (`airys-platform-staging`, revision `api-00023-qmb`)
  - Production: `https://api.airys.chat` (`airys-platform-prod`, pending production cutover of `a292f20`)
- **Upstream contract**: `AirysBR/airys-platform` `openapi/openapi.json` (`origin/main` at `a292f20`, PR `#29`)

## 1. Automated Verification (`pnpm check`)

- `pnpm typecheck`: passed (`tsc --noEmit` across `packages/server` src + tests).
- `pnpm test`: all unit tests passed (>80% line/branch/function coverage gate), including `packages/server/test/platform.test.ts` covering:
  - `loadConfig` parsing of `AIRYS_PLATFORM_URL`, `AIRYS_API_TOKEN`, and toolset `platform`, plus unexpanded `${AIRYS_API_TOKEN}` rejection.
  - `AirysPlatformClient` neutrality: never sends `AIRYSCHAT_API_KEY` (`api_access_token`) to `api.airys.chat`; sends `Authorization: Bearer <AIRYS_API_TOKEN>` on authenticated routes and fails fast with `PlatformAuthConfigError` when `AIRYS_API_TOKEN` is unset.
  - `platform_health` (`stable`), `platform_signals_attribution_list` (`beta`, `untrustedJson` fencing), `platform_signals_outcome_record` (`beta`, `write: true`, `idempotent: true`, currency validation).
  - `platform_numbers_health`, `platform_alerts_list` (15 rules including `delivery_rejected` and `webhook_unrouted`), `platform_instances_list`, and `platform_usage` (7 Meta `pricing_analytics` categories including `MARKETING_LITE`, `AUTHENTICATION_INTERNATIONAL`, `REFERRAL_CONVERSION`) promoted to `beta`, with `200 OK` payloads and graceful `404` `not_yet_deployed_on_platform` fallback for unpromoted environments.
- `pnpm smoke`: `67/67` end-to-end checks passed over stdio and Streamable HTTP (`AIRYSCHAT_FEATURES=beta` exercising all 7 `platform` tools).
- `pnpm inventory:check`: `807` endpoints, `212` tools (`7` `platform` tools registered in `unmapped_tools`).
- `pnpm plugins:check` & `pnpm docs:check`: `4` client plugin bundles (`claude`, `codex`, `gemini`, `antigravity`) and `docs/tools/reference.md` synchronized.
- `pnpm security:scan`: `0` findings across tracked files.

## 2. Live Staging Verification (`https://api-tdtyqbghua-rj.a.run.app`, 2026-10-30)

| Check / Route | Target Host | HTTP Status | Sanitized Evidence |
|---|---|---|---|
| `platform_health` (`GET /health`) | `https://api-tdtyqbghua-rj.a.run.app` | `200 OK` | `{"status":"ok","service":"airys-platform","version":"0.1.0","environment":"staging","commit":"a292f204fd3d79482a8188f004a6a86ff798d30e","revision":"api-00023-qmb"}` |
| `GET /openapi.json` | `https://api-tdtyqbghua-rj.a.run.app` | `200 OK` | OpenAPI `3.1.0`, paths: `["/health","/v1/alerts","/v1/instances","/v1/instances/{tenant_id}/inventory","/v1/numbers","/v1/signals/attribution","/v1/signals/outcomes","/v1/usage"]` |
| `GET /v1/instances` (no/invalid Bearer) | `https://api-tdtyqbghua-rj.a.run.app` | `401 Unauthorized` | `{"detail":"invalid instance key"}` (router mounted; enforces Bearer auth without tenant enumeration) |
| `GET /v1/numbers` (no/invalid Bearer) | `https://api-tdtyqbghua-rj.a.run.app` | `401 Unauthorized` | `{"detail":"invalid instance key"}` |
| `GET /v1/alerts` (no/invalid Bearer) | `https://api-tdtyqbghua-rj.a.run.app` | `401 Unauthorized` | `{"detail":"invalid instance key"}` |
| `GET /v1/usage` (no/invalid Bearer) | `https://api-tdtyqbghua-rj.a.run.app` | `401 Unauthorized` | `{"detail":"invalid instance key"}` |
| `platform_health` (`GET /health`) | `https://api.airys.chat` (2026-10-28) | `200 OK` | `{"status":"ok","service":"airys-platform","version":"0.1.0","environment":"prod","commit":"554ebff7eb46a5e3230a45d821fc04a0f83d6cec","revision":"api-00017-bcf"}` |

## 3. Security Verification

- **Credential separation**: `AIRYSCHAT_API_KEY` is never sent to `AIRYS_PLATFORM_URL`; `AIRYS_API_TOKEN` is never sent to `AIRYSCHAT_BASE_URL`.
- **Untrusted content fencing**: `platform_signals_attribution_list`, `platform_numbers_health`, `platform_alerts_list`, and `platform_instances_list` wrap upstream payloads with `untrustedJson` (`_untrusted` notice + JSON envelope) because inbox names, verified names, ad headlines, URLs, and webhook error strings originate outside the operator prompt boundary.
- **Multi-tenant isolation**: verified in `AirysBR/airys-platform#29` (`tests/test_management_api.py`, `tests/test_usage.py`, `125/125` PostgreSQL 17 tests passing) that every `/v1/*` read query filters strictly by `caller_tenant` ownership at the SQL layer and returns identical `401` responses on missing, invalid, or cross-environment keys.
- **Promotion to `stable`**: `platform_health` is `stable`; the 6 authenticated `platform` tools are `beta` and require an authenticated staging `AIRYS_API_TOKEN` readback (`live-verify`) before promotion to `stable` per ADR 0003.
