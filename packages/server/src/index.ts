#!/usr/bin/env node
/**
 * AirysChat MCP server (stdio).
 *
 * stdio is the transport that works everywhere the target clients live — Claude Code,
 * Codex, Gemini CLI and Antigravity all spawn a local process. The hosted Streamable HTTP
 * entry point (lane 005, ADRs 0004/0006) will reuse the same tool registry.
 *
 * Nothing may be written to stdout except protocol traffic: stdout IS the transport.
 * Diagnostics go to stderr.
 */

import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { AirysChatClient } from './client.js';
import { ConfigError, loadConfig } from './config.js';
import { aiAgentsTools } from './tools/ai_agents.js';
import { catalogTools } from './tools/catalog.js';
import { coreTools } from './tools/core.js';
import { crmTools } from './tools/crm.js';
import { metaAgentTools } from './tools/meta_agent.js';
import { rawTools } from './tools/raw.js';
import { reportsTools } from './tools/reports.js';
import { whatsappTools } from './tools/whatsapp.js';
import { registerTools, type AnyToolDefinition } from './toolsets.js';

// Single source of truth: the published package version (bumped by Changesets).
const VERSION: string = createRequire(import.meta.url)('../package.json').version;

async function main(): Promise<void> {
  const config = loadConfig();
  const context = { config, client: new AirysChatClient(config) };

  const server = new McpServer(
    { name: 'airyschat', version: VERSION },
    {
      // MCP 2026-07-28 cacheable results: the tool list is fixed for the life of the process
      // (toolsets, features and read-only are read once at startup), so clients may cache it.
      // `private` because it depends on this user's configuration.
      cacheHints: { 'tools/list': { ttlMs: 60 * 60 * 1000, cacheScope: 'private' } },
    },
  );

  // The escape hatch and its catalog search are always on: together they are the route to
  // every endpoint that does not have a dedicated tool yet.
  const selected: AnyToolDefinition[] = [...catalogTools, ...rawTools];
  if (config.toolsets.has('core')) selected.push(...coreTools);
  if (config.toolsets.has('whatsapp')) selected.push(...whatsappTools);
  if (config.toolsets.has('crm')) selected.push(...crmTools);
  if (config.toolsets.has('ai_agents')) selected.push(...aiAgentsTools);
  if (config.toolsets.has('meta_agent')) selected.push(...metaAgentTools);
  if (config.toolsets.has('reports')) selected.push(...reportsTools);

  const registered = registerTools(server, selected, context);

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
        'Required environment:\n' +
        '  AIRYSCHAT_BASE_URL    e.g. https://app.airyschat.com\n' +
        '  AIRYSCHAT_API_KEY     agent or admin access token (sent as the api_access_token header)\n' +
        '  AIRYSCHAT_ACCOUNT_ID  numeric account ID\n\n' +
        'Optional:\n' +
        '  AIRYSCHAT_TOOLSETS    comma-separated: core, whatsapp, crm, ai_agents, meta_agent, reports (default: core, whatsapp)\n' +
        '  AIRYSCHAT_FEATURES    stable (default), beta or experimental — highest tool maturity to expose\n' +
        '  AIRYSCHAT_READ_ONLY   1 to disable every write tool\n' +
        '  AIRYSCHAT_TIMEOUT_MS  request timeout, default 30000\n',
    );
  } else {
    process.stderr.write(`airyschat-mcp: fatal: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  }
  process.exit(1);
});
