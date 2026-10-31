# npm Trusted Publishing & MCP Registry Guide (`GA-05`, `GA-06`)

## 1. npm Scope `@airyschat` & Trusted Publishing (`GA-05`)

- **Package**: `@airyschat/mcp`
- **Owner**: Airys (`@airyschat` organization on npmjs.com and GitHub Packages `npm.pkg.github.com`)
- **Policy (ADR 0003)**:
  - Pre-1.0 releases (`0.x`) publish to **GitHub Packages** (`https://npm.pkg.github.com`) when repository variable `PUBLISH_ENABLED=true`.
  - Starting at **1.0.0**, `.github/workflows/release.yml` publishes to **public npm** (`https://registry.npmjs.org`) with `--access public --provenance` when repository variable `NPM_PUBLIC_ENABLED=true`.

### Configuring OIDC Trusted Publishing on npmjs.com

1. **First-time bootstrap** (only needed once before `@airyschat/mcp` exists on `npmjs.com`):
   - Create a short-lived granular access token on `npmjs.com` (**Read and write** on `airyschat` org, **Bypass 2FA** checked) and set `gh secret set NPM_TOKEN --repo AirysChat/mcp`.
   - Enable public npm publishing:
     ```bash
     gh variable set NPM_PUBLIC_ENABLED --body "true" --repo AirysChat/mcp
     ```
2. **Switch permanently to passwordless OIDC** (once `@airyschat/mcp` exists on `npmjs.com`):
   - Sign in to `https://www.npmjs.com` under the `airyschat` organization and open `https://www.npmjs.com/package/@airyschat/mcp/access`.
   - Under **Trusted Publisher**, choose **GitHub Actions**:
     - **Organization / User**: `AirysChat`
     - **Repository**: `mcp`
     - **Workflow filename**: `release.yml`
     - **Environment name**: *(leave empty)*
     - **Allowed actions**: check **`Allow npm publish`** and **`Allow npm dist-tag`**
   - Click **Set up connection** and complete 2FA so the saved row appears on `/access` (do not click `Update Package Settings` before saving the connection).
   - Remove the temporary bootstrap token (`gh secret delete NPM_TOKEN --repo AirysChat/mcp`) and revoke it on `npmjs.com`. Node 24 / npm 11 exchanges the GitHub Actions OIDC token natively.
3. Verify provenance after release:
   ```bash
   npm view @airyschat/mcp dist.attestations
   ```

---

## 2. Official MCP Registry (`chat.airys/mcp`, `GA-06`)

- **Namespace**: `chat.airys/mcp` (reverse-DNS verified on `airys.chat`, owner decision 2026-10-27; matched by `"mcpName": "chat.airys/mcp"` in [`packages/server/package.json`](../../packages/server/package.json)).
- **Manifest**: [`server.json`](../../server.json) at repository root (kept in version lockstep with `packages/server/package.json` via `pnpm plugins:sync` and `pnpm release:prepare`).
- **Transports advertised**:
  1. `packages[0]`: npm `@airyschat/mcp` over `stdio`
  2. `remotes[0]`: `https://mcp.airys.chat/mcp` over `streamable-http`

### DNS TXT Verification on `airys.chat` (Cloudflare)

1. Generate an Ed25519 keypair and add the public key TXT record (`v=MCPv1; k=ed25519; p=<base64-pubkey>`) at `airys.chat` in Cloudflare DNS (per the official `mcp-publisher` DNS authentication guide).
2. Store the hex seed in GitHub Actions secrets and enable automatic registry publishing on release:
   ```bash
   gh secret set MCP_REGISTRY_DNS_PRIVATE_KEY --repo AirysChat/mcp
   gh variable set MCP_REGISTRY_PUBLISH_ENABLED --body "true" --repo AirysChat/mcp
   ```
