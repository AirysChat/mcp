/**
 * Shared MCP server factory (REM-01).
 *
 * Both the local stdio server (`src/index.ts`) and the stateless Streamable HTTP
 * server (`src/http.ts`) build an `McpServer` for a `ToolContext` with no process-global
 * state in tool handlers.
 */

import { createRequire } from 'node:module';
import {
  CLIENT_CAPABILITIES_META_KEY,
  McpServer,
  PROTOCOL_VERSION_META_KEY,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/server';
import { registerApps } from './apps/index.js';
import type { Config } from './config.js';
import { createConfirmationStateCodec } from './elicitation.js';
import { defaultTaskRegistry, registerTaskHandlers, type TaskRegistry } from './tasks.js';
import { adminTools } from './tools/admin.js';
import { aiAgentsTools } from './tools/ai_agents.js';
import { catalogTools } from './tools/catalog.js';
import { coreTools } from './tools/core.js';
import { crmTools } from './tools/crm.js';
import { helpCenterTools } from './tools/help_center.js';
import { metaAgentTools } from './tools/meta_agent.js';
import { rawTools } from './tools/raw.js';
import { reportsTools } from './tools/reports.js';
import { whatsappTools } from './tools/whatsapp.js';
import { registerTools, type AnyToolDefinition, type ToolContext } from './toolsets.js';

/** Single source of truth: the published package version (bumped by Changesets). */
export const VERSION: string = createRequire(import.meta.url)('../package.json').version;
export const MODERN_MCP_PROTOCOL_VERSION = '2026-07-28';

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
  if (config.toolsets.has('admin')) selected.push(...adminTools);
  if (config.toolsets.has('help_center')) selected.push(...helpCenterTools);
  return selected;
}

export function createServerForContext(
  context: ToolContext,
  options: { keepUnscopedForRefusal?: boolean; taskRegistry?: TaskRegistry } = {},
): { server: McpServer; registered: number } {
  const stateCodec = createConfirmationStateCodec(context.config.accountId);
  const taskRegistry = options.taskRegistry ?? defaultTaskRegistry;

  const server = new McpServer(
    { name: 'airyschat', version: VERSION },
    {
      supportedProtocolVersions: [MODERN_MCP_PROTOCOL_VERSION, ...SUPPORTED_PROTOCOL_VERSIONS],
      // MCP 2026-07-28 cacheable results: the tool list is fixed for a given context
      // (toolsets, features, and scopes), so clients may cache it privately; MCP App
      // resources are static per server version and may be cached publicly.
      cacheHints: {
        'tools/list': { ttlMs: 60 * 60 * 1000, cacheScope: 'private' },
        'resources/list': { ttlMs: 60 * 60 * 1000, cacheScope: 'public' },
      },
      requestState: {
        verify: (state, ctx) => stateCodec.verify(state, ctx),
      },
    },
  );

  enableStatelessMrtrPromotion(server);
  registerApps(server);
  registerTaskHandlers(server, context, taskRegistry);

  const selected = selectToolsForConfig(context.config);
  const registered = registerTools(server, selected, context, {
    ...options,
    stateCodec,
    taskRegistry,
  });
  return { server, registered };
}

/**
 * When a stateless Streamable HTTP request arrives without an `initialize` handshake and
 * carries 2026-07-28 multi-round-trip fields (`_meta["io.modelcontextprotocol/clientCapabilities"]`,
 * `requestState`, or `inputResponses`), binds the per-request `Server` instance to the
 * 2026-07-28 wire codec so `input_required` results and `requestState` verification run
 * natively while keeping bare stateless requests compatible.
 */
function enableStatelessMrtrPromotion(mcp: McpServer): void {
  const proto = mcp.server as unknown as {
    _negotiatedProtocolVersion?: string;
    _onrequest: (rawRequest: Record<string, unknown>, extra?: unknown) => void;
  };
  const origOnRequest = proto._onrequest.bind(proto);
  proto._onrequest = (rawRequest: Record<string, unknown>, extra?: unknown) => {
    const params =
      rawRequest.params && typeof rawRequest.params === 'object'
        ? (rawRequest.params as Record<string, unknown>)
        : undefined;
    const meta =
      params?._meta && typeof params._meta === 'object'
        ? (params._meta as Record<string, unknown>)
        : undefined;
    const hasModernMrtrSignal =
      meta?.[CLIENT_CAPABILITIES_META_KEY] !== undefined ||
      meta?.[PROTOCOL_VERSION_META_KEY] !== undefined ||
      params?.requestState !== undefined ||
      params?.inputResponses !== undefined;

    if (proto._negotiatedProtocolVersion === undefined && hasModernMrtrSignal && params) {
      proto._negotiatedProtocolVersion = MODERN_MCP_PROTOCOL_VERSION;
      const nextMeta: Record<string, unknown> = { ...(meta ?? {}) };
      if (typeof nextMeta[PROTOCOL_VERSION_META_KEY] !== 'string') {
        nextMeta[PROTOCOL_VERSION_META_KEY] = MODERN_MCP_PROTOCOL_VERSION;
      }
      if (!nextMeta[CLIENT_CAPABILITIES_META_KEY] || typeof nextMeta[CLIENT_CAPABILITIES_META_KEY] !== 'object') {
        nextMeta[CLIENT_CAPABILITIES_META_KEY] = {};
      }
      params._meta = nextMeta;
    }
    return origOnRequest(rawRequest, extra);
  };
}
