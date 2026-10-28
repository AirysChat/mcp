/**
 * Shared MCP server factory (REM-01).
 *
 * Both the local stdio server (`src/index.ts`) and the stateless Streamable HTTP
 * server (`src/http.ts`) build an `McpServer` for a `ToolContext` with no process-global
 * state in tool handlers.
 */

import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/server';
import type { Config } from './config.js';
import { aiAgentsTools } from './tools/ai_agents.js';
import { catalogTools } from './tools/catalog.js';
import { coreTools } from './tools/core.js';
import { crmTools } from './tools/crm.js';
import { metaAgentTools } from './tools/meta_agent.js';
import { rawTools } from './tools/raw.js';
import { reportsTools } from './tools/reports.js';
import { whatsappTools } from './tools/whatsapp.js';
import { registerTools, type AnyToolDefinition, type ToolContext } from './toolsets.js';

/** Single source of truth: the published package version (bumped by Changesets). */
export const VERSION: string = createRequire(import.meta.url)('../package.json').version;

/** Selects the tool definitions enabled for a given `Config` (before maturity and scope filtering). */
export function selectToolsForConfig(config: Pick<Config, 'toolsets'>): AnyToolDefinition[] {
  // The escape hatch and its catalog search are always on: together they are the route to
  // every endpoint that does not have a dedicated tool yet.
  const selected: AnyToolDefinition[] = [...catalogTools, ...rawTools];
  if (config.toolsets.has('core')) selected.push(...coreTools);
  if (config.toolsets.has('whatsapp')) selected.push(...whatsappTools);
  if (config.toolsets.has('crm')) selected.push(...crmTools);
  if (config.toolsets.has('ai_agents')) selected.push(...aiAgentsTools);
  if (config.toolsets.has('meta_agent')) selected.push(...metaAgentTools);
  if (config.toolsets.has('reports')) selected.push(...reportsTools);
  return selected;
}

export function createServerForContext(
  context: ToolContext,
  options: { keepUnscopedForRefusal?: boolean } = {},
): { server: McpServer; registered: number } {
  const server = new McpServer(
    { name: 'airyschat', version: VERSION },
    {
      // MCP 2026-07-28 cacheable results: the tool list is fixed for a given context
      // (toolsets, features, and scopes), so clients may cache it privately.
      cacheHints: { 'tools/list': { ttlMs: 60 * 60 * 1000, cacheScope: 'private' } },
    },
  );

  const selected = selectToolsForConfig(context.config);
  const registered = registerTools(server, selected, context, options);
  return { server, registered };
}
