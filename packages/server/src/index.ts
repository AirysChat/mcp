#!/usr/bin/env node
/**
 * AirysChat MCP server (stdio).
 *
 * stdio is the transport that works everywhere the target clients live — Claude Code,
 * Codex, Gemini CLI and Antigravity all spawn a local process. The hosted Streamable HTTP
 * entry point (`src/http.ts`, lane 005, ADRs 0004/0006) reuses `createServerForContext`.
 *
 * Nothing may be written to stdout except protocol traffic: stdout IS the transport.
 * Diagnostics go to stderr.
 */

import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { AirysChatClient } from './client.js';
import { ConfigError, TOOLSET_NAMES, loadConfig } from './config.js';
import { VERSION, createServerForContext } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const context = { config, client: new AirysChatClient(config) };
  const { server, registered } = createServerForContext(context);

  process.stderr.write(
    `airyschat-mcp ${VERSION} → ${config.baseUrl} (account ${config.accountId}) | ` +
      `toolsets: ${[...config.toolsets].join(', ') || 'none'} | features: ${config.features} | tools: ${registered}` +
      `${config.readOnly ? ' | READ-ONLY' : ''}\n`,
  );

  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    process.stderr.write(
      `airyschat-mcp: ${error.message}\n\n` +
        'Required environment (stdio):\n' +
        '  AIRYSCHAT_BASE_URL    e.g. https://airys.chat\n' +
        '  AIRYSCHAT_API_KEY     agent or admin access token (sent as the api_access_token header)\n' +
        '  AIRYSCHAT_ACCOUNT_ID  numeric account ID\n\n' +
        'Optional:\n' +
        `  AIRYSCHAT_TOOLSETS    comma-separated: ${TOOLSET_NAMES.join(', ')} (default: core, whatsapp)\n` +
        '  AIRYSCHAT_FEATURES    stable (default), beta or experimental — highest tool maturity to expose\n' +
        '  AIRYSCHAT_READ_ONLY   1 to disable every write tool\n' +
        '  AIRYSCHAT_SCOPES      optional MCP token scopes (mcp:read, mcp:write, mcp:irreversible, mcp:toolset:<name>)\n' +
        '  AIRYSCHAT_TIMEOUT_MS  request timeout, default 30000\n\n' +
        'Or connect via hosted OAuth 2.1 (zero local env vars): https://mcp.airys.chat/mcp\n',
    );
  } else {
    process.stderr.write(`airyschat-mcp: fatal: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  }
  process.exit(1);
});
