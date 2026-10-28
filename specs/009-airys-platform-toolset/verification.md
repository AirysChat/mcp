# 009 — Airys API (`platform` toolset) · verification

- **Date**: 2026-10-28
- **Targets**:
  - Staging: `https://api-tdtyqbghua-rj.a.run.app` (`airys-platform-staging`)
  - Production: `https://api.airys.chat` (`airys-platform-prod`)
- **Upstream contract**: `AirysBR/airys-platform` `openapi/openapi.json` (`origin/main` at `631d96c`)

## 1. Automated Verification (`pnpm check`)

- `pnpm typecheck`: passed (`tsc --noEmit` across `packages/server` src + tests).
- `pnpm test`: `52/52` unit tests passed, including `packages/server/test/platform.test.ts` covering:
  - `loadConfig` parsing of `AIRYS_PLATFORM_URL`, `AIRYS_API_TOKEN`, and toolset `platform`, plus unexpanded `${AIRYS_API_TOKEN}` rejection.
  - `AirysPlatformClient` neutrality: never sends `AIRYSCHAT_API_KEY` (`api_access_token`) to `api.airys.chat`; sends `Authorization: Bearer <AIRYS_API_TOKEN>` on authenticated routes and fails fast with `PlatformAuthConfigError` when `AIRYS_API_TOKEN` is unset.
  - `platform_health` (`stable`), `platform_signals_attribution_list` (`beta`, `untrustedJson` fencing), `platform_signals_outcome_record` (`beta`, `write: true`, `idempotent: true`, currency validation).
  - `platform_numbers_health`, `platform_alerts_list`, `platform_instances_list`, and `platform_usage` (`experimental`, both `200 OK` payloads and `404` `not_yet_deployed_on_platform` diagnostics while `PLAT-8.1` / `PLAT-8.5` are open in `AirysBR/Airys-AI` milestone M2).
- `pnpm smoke`: `67/67` end-to-end checks passed over stdio and Streamable HTTP.
- `pnpm inventory:check`: `807` endpoints, `212` tools (`7` `platform` tools registered in `unmapped_tools`).

## 2. Live Verification (`platform_health`)

| Tool | Target Host | HTTP Status | Sanitized Evidence |
|---|---|---|---|
| `platform_health` | `https://api-tdtyqbghua-rj.a.run.app` | `200 OK` | `{"status":"ok","service":"airys-platform","version":"0.1.0","environment":"staging","commit":"06ae993a114ad4271d48be464f641a814f40d1a8","revision":"api-00022-wrv"}` |
| `platform_health` | `https://api.airys.chat` | `200 OK` | `{"status":"ok","service":"airys-platform","version":"0.1.0","environment":"prod","commit":"554ebff7eb46a5e3230a45d821fc04a0f83d6cec","revision":"api-00017-bcf"}` |

## 3. External Dependencies (`PLAT-8.1` / `PLAT-8.5`)

- `platform_numbers_health` (`GET /v1/numbers`), `platform_alerts_list` (`GET /v1/alerts`), and `platform_instances_list` (`GET /v1/instances`) are implemented in `packages/server/src/tools/platform.ts` at `stability: 'experimental'` and await the `AirysBR/airys-platform` milestone M2 Management API routers (`PLAT-8.1`) for promotion to `stable`.
- `platform_usage` (`GET /v1/usage`) is implemented at `stability: 'experimental'` and awaits `PLAT-8.5` / `PLAT-11.1`.
