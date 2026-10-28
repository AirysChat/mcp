---
'@airyschat/mcp': minor
---

Add multi-client plugin bundles, MCP Registry manifest, stability freeze, and GA documentation (lane `010-distribution-ga`, `GA-01..GA-12`):

- **Shared skills & 4 client plugins (`GA-01..GA-04`)**: canonical `skills/*` synchronized into `plugins/claude`, `plugins/codex`, `plugins/gemini`, and `plugins/antigravity` via `pnpm plugins:sync` / `pnpm plugins:check`.
- **Official MCP Registry & npm provenance (`GA-05`, `GA-06`)**: `server.json` (`chat.airys/mcp`) with stdio + Streamable HTTP transports, and OIDC provenance publishing in `.github/workflows/release.yml`.
- **Security & stability freeze (`GA-07`, `GA-11`)**: `SECURITY.md`, full-history secret scanner (`pnpm security:scan`), `docs/stability-policy.md`, and `stability-freeze.test.ts` locking all 80 `stable` tools.
- **Documentation & guides (`GA-08..GA-10`, `GA-12`)**: generated 212-tool reference (`docs/tools/reference.md`), `docs/quickstart.md`, `docs/safety-model.md`, Meta WhatsApp Business Tools MCP complementarity guide, Meta Muse setup guide, and Claude/ChatGPT connector directory package.
