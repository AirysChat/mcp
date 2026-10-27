---
"@airyschat/mcp": minor
---

`airyschat_api` stays available with `AIRYSCHAT_READ_ONLY=1`, limited to GET and annotated read-only. Any other method is refused locally, even with `confirm: true`. Read-only setups can now reach every endpoint that has no dedicated tool.
