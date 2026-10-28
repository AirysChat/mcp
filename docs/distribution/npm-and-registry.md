# npm Trusted Publishing & MCP Registry Guide (`GA-05`, `GA-06`)

## 1. npm Scope `@airyschat` & Trusted Publishing (`GA-05`)

- **Package**: `@airyschat/mcp`
- **Owner**: Airys (`@airyschat` organization on npmjs.com and GitHub Packages `npm.pkg.github.com`)
- **Policy (ADR 0003)**:
  - Pre-1.0 releases (`0.x`) publish to **GitHub Packages** (`https://npm.pkg.github.com`) when repository variable `PUBLISH_ENABLED=true`.
  - Starting at **1.0.0**, `.github/workflows/release.yml` publishes to **public npm** (`https://registry.npmjs.org`) with `--access public --provenance` when repository variable `NPM_PUBLIC_ENABLED=true`.

### Configuring OIDC Trusted Publishing on npmjs.com

1. Sign in to `https://www.npmjs.com` under the `airyschat` organization.
2. Open package settings for `@airyschat/mcp` → **Publishing access** → **Configure trusted publisher**:
   - **Provider**: GitHub Actions
   - **Organization / User**: `AirysChat`
   - **Repository**: `mcp`
   - **Workflow filename**: `release.yml`
3. Set the GitHub repository variable:
   ```bash
   gh variable set NPM_PUBLIC_ENABLED --body "true" --repo AirysChat/mcp
   ```
4. Verify provenance after release:
   ```bash
   npm view @airyschat/mcp dist.attestations
   ```

---

## 2. Official MCP Registry (`chat.airys/mcp`, `GA-06`)

- **Namespace**: `chat.airys/mcp` (reverse-DNS verified on `airys.chat`, owner decision 2026-10-27)
- **Manifest**: [`server.json`](../../server.json) at repository root (kept in version lockstep with `packages/server/package.json` via `pnpm plugins:sync` and `pnpm release:prepare`).
- **Transports advertised**:
  1. `packages[0]`: npm `@airyschat/mcp` over `stdio`
  2. `remotes[0]`: `https://mcp.airys.chat/mcp` over `streamable-http`

### DNS TXT Verification on `airys.chat` (Cloudflare)

1. Generate the MCP Registry domain verification challenge with `mcp-publisher`:
   ```bash
   npx -y @modelcontextprotocol/registry-publisher login dns --domain airys.chat
   ```
2. Add the TXT record returned by the CLI in the Cloudflare zone `airys.chat` (`_mcp-registry.airys.chat` TXT).
3. Enable automatic registry publishing on release:
   ```bash
   gh variable set MCP_REGISTRY_PUBLISH_ENABLED --body "true" --repo AirysChat/mcp
   ```
