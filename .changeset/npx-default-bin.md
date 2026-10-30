---
"@airyschat/mcp": patch
---

Add `"mcp"` default binary alias in `package.json` so `npx -y @airyschat/mcp@latest` resolves `dist/index.js` without `"could not determine executable to run"`, pass explicit `-p @airyschat/mcp@latest airyschat-mcp` args across all 4 client plugin manifests, and resolve unexpanded `${VAR:-default}` optional env placeholders in `loadConfig`.
