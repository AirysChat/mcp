---
"@airyschat/mcp": minor
---

Add the `meta_agent` toolset covering Meta Business Agent workspace and direct endpoints (17 tools across 94 endpoints):

- Read tools (`beta` — `AIA-06`): `mba_inboxes_list`, `mba_workspace_get`, `mba_settings_get`, `mba_business_info_get`, `mba_resources_list`, `mba_thread_control_get`, `mba_handoff_get`, `mba_budget_get`.
- Write tools (`beta` — `AIA-07`): `mba_preflight`, `mba_onboarding`, `mba_settings_update`, `mba_business_info_update`, `mba_resource_upsert`, `mba_resource_delete`, `mba_connectors`, `mba_release`, `mba_thread_control_release`, `mba_handoff_update`, `mba_budget_update` with automatic `idempotency_key` generation, `observed_hash` optimistic concurrency preflight, and server-derived `requireConfirmation` gates.
- Evaluation & playground tool (`experimental` — `AIA-08`): `mba_evals` (`list_cases`, `get_summary`, `get_details`, `get_run`, `run_eval`, `run_test`, `send_event`, `get_event`).
