---
"@airyschat/mcp": patch
---

Promote live-verified `llm_models_list` and `conversation_ai_usage` to `stable`, resolve `display_id` → internal conversation ID via `/conversations/:id/crm_deal` in `conversation_ai_usage`, classify `/meta_agent/*` HTTP 403 responses from `Concerns::Saas::FeatureGate` as plan entitlement limits (`ApiError.isPlanGate`), and add the `agent-supervision` Claude Code plugin skill (`AIA-10`, `AIA-11`).
