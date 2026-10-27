---
"@airyschat/mcp": minor
---

Tools now carry a stability tier (`stable`, `beta`, `experimental`, `deprecated`) and `AIRYSCHAT_FEATURES` chooses the highest tier exposed. The default is `stable`.

**Heads-up:** write tools (`conversation_reply`, `conversation_update`, `wa_templates_sync`, `wa_campaign_create`, `wa_campaign_launch`, `wa_campaign_cancel`, `wa_campaign_test_send`) stay `beta` until they are verified live, so they are hidden by default. Set `AIRYSCHAT_FEATURES=beta` to keep using them. Non-stable tools start their description with `[beta]` or `[experimental]`.
