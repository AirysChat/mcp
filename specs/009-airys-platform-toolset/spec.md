# 009 — Airys API (platform) toolset

- Release: **0.9.0** · Target: after airys-platform milestone M2 · Prefix `PLT` · Toolset `platform`
- External: `AirysBR/airys-platform` (FastAPI on Cloud Run, `api.airys.chat`), specs in `AirysBR/Airys-AI`

## Why

The Airys platform API aggregates cross-instance signals AirysChat alone cannot provide: WhatsApp
number health, quality alerts, instance inventory, usage. Agents supervising many instances need
them. Today the API exposes only `/health` and `PUT /v1/instances/{id}/inventory`.

## What

- Toolset `platform` (default off) against `api.airys.chat` with its own credential
  (`AIRYS_API_TOKEN`), separate from the AirysChat token.
- Initial tools depend on the platform roadmap: `platform_numbers_health`, `platform_alerts_list`,
  `platform_instances_list`, `platform_usage`.
- Respect platform rules: neutrality (no AirysChat-specific code path on the API side), no secrets.

## Acceptance

- Tools verified against `api.staging…` once the endpoints exist; until then every task is
  `BLOCKED_EXTERNAL` with a link to the platform spec.
