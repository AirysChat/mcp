---
"@airyschat/mcp": minor
---

`wa_campaign_preflight` now requires `inbox_id`. AirysChat always resolves the inbox first, so calls with only `campaign_id` (or no arguments) failed with a 404; they are now refused locally with a clear validation error. 404s outside campaign routes no longer suggest that campaign display IDs are the problem.
