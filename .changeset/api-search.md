---
"@airyschat/mcp": minor
---

New tool `airyschat_api_search`: finds any of the ~800 AirysChat endpoints by intent ("deal won", "pipeline stages", "template quality") and returns the exact call for `airyschat_api` — method, prefix, path, known params, whether it writes, why it is irreversible, and the dedicated tool to prefer when one exists. It reads a catalog shipped with the server and never calls AirysChat. Always on, like `airyschat_api`.
