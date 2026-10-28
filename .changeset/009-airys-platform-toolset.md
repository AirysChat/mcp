---
'@airyschat/mcp': minor
---

Add the `platform` toolset (`AirysPlatformClient`, `AIRYS_PLATFORM_URL`, `AIRYS_API_TOKEN`) for the Airys Platform API (`api.airys.chat` / `AirysBR/airys-platform`, lane 009):

- **Second HTTP client (`AirysPlatformClient`)**: dedicated base URL (`AIRYS_PLATFORM_URL`, default `https://api.airys.chat`) and Bearer credential (`AIRYS_API_TOKEN`), isolated from `AIRYSCHAT_API_KEY`.
- **Live OpenAPI 3.1 tools**: `platform_health` (`stable`), `platform_signals_attribution_list` (`beta`, `untrustedJson`), and `platform_signals_outcome_record` (`beta`, idempotent Business Messaging Conversions API outcome writer).
- **Control-plane Management API tools (`experimental`, awaiting `PLAT-8.1` / `PLAT-8.5`)**: `platform_numbers_health`, `platform_alerts_list`, `platform_instances_list`, and `platform_usage`.
- **Skill**: `plugins/claude/skills/number-health-watch/SKILL.md`.
