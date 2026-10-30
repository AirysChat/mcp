# 009 — Airys API (platform) toolset · tasks

| ID | P | Size | Task | Done when | Status |
|---|---|---|---|---|---|
| PLT-01 | P0 | S | Map platform roadmap (Airys-AI specs) to candidate tools; agree contract with platform lane | contract doc in `docs/api/domains/platform.md` | Done |
| PLT-02 | P0 | S | Second HTTP client + `AIRYS_API_TOKEN` config; toolset `platform` | unit tests | Done |
| PLT-03 | P0 | M | `platform_health` (`stable`), `platform_signals_attribution_list`, `platform_signals_outcome_record` (`beta`), `platform_numbers_health`, `platform_alerts_list` (`beta`, 15 rules, `PLAT-8.1`) | unit + smoke + live staging evidence (`AirysBR/airys-platform#29`) | Done |
| PLT-04 | P1 | M | `platform_instances_list`, `platform_usage` (`beta`, 7 Meta pricing categories, `PLAT-8.1`/`PLAT-8.5`/`PLAT-11.1`) | unit + smoke + live staging evidence (`AirysBR/airys-platform#29`) | Done |
| PLT-05 | P1 | S | Skill `number-health-watch` | skill in `plugins/claude/skills/number-health-watch/SKILL.md` | Done |
| PLT-06 | P0 | XS | Changeset, docs | release notes | Done |
