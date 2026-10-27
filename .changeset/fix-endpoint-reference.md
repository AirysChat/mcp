---
"@airyschat/mcp": patch
---

`airyschat_api` no longer points agents to a swagger file and `x-airys-stub` markers that do not exist. It now says where the reference really is: `application_swagger.json` for inherited Chatwoot endpoints, and the controllers for AirysChat-only (`saas`) endpoints, which have no published schema.
