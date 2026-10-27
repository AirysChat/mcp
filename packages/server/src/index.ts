#!/usr/bin/env node
/**
 * AirysChat MCP server (stdio).
 *
 * stdio is the transport that works everywhere the target clients live — Claude Code,
 * Codex, and Gemini CLI all spawn a local process. A hosted streamable-HTTP deployment
 * for end customers is a separate concern and belongs in the Rails app, where it can
 * reuse Pundit scoping instead of re-implementing it here.
 *
 * Nothing may be written to stdout except protocol traffic: stdout IS the transport.
 * Diagnostics go to stderr.
 */

import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { AirysChatClient } from './client.js';
import { ConfigError, loadConfig } from './config.js';
import { coreTools } from './tools/core.js';
import { rawTools } from './tools/raw.js';
import { whatsappTools } from './tools/whatsapp.js';
import { registerTools, type AnyToolDefinition } from './toolsets.js';

const VERSION = '0.1.0';

async function main(): Promise<void> {
  const config = loadConfig();
  const context = { config, client: new AirysChatClient(config) };

  const server = new McpServer({ name: 'airyschat', version: VERSION });

  // The escape hatch is always on: it is the only route to the ~325 endpoints that do
  // not have a dedicated tool yet.
  const selected: AnyToolDefinition[] = [...rawTools];
  if (config.toolsets.has('core')) selected.push(...coreTools);
  if (config.toolsets.has('whatsapp')) selected.push(...whatsappTools);

  const registered = registerTools(server, selected, context);

  process.stderr.write(
    `airyschat-mcp ${VERSION} → ${config.baseUrl} (account ${config.accountId}) | ` +
      `toolsets: ${[...config.toolsets].join(', ') || 'none'} | tools: ${registered}` +
      `${config.readOnly ? ' | READ-ONLY' : ''}\n`,
  );

  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    process.stderr.write(
      `airyschat-mcp: ${error.message}\n\n` +
        'Required environment:\n' +
        '  AIRYSCHAT_BASE_URL    e.g. https://app.airyschat.com\n' +
        '  AIRYSCHAT_API_KEY     agent or admin access token (sent as the api_access_token header)\n' +
        '  AIRYSCHAT_ACCOUNT_ID  numeric account ID\n\n' +
        'Optional:\n' +
        '  AIRYSCHAT_TOOLSETS    comma-separated: core, whatsapp (default: both)\n' +
        '  AIRYSCHAT_READ_ONLY   1 to disable every write tool\n' +
        '  AIRYSCHAT_TIMEOUT_MS  request timeout, default 30000\n',
    );
  } else {
    process.stderr.write(`airyschat-mcp: fatal: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  }
  process.exit(1);
});
