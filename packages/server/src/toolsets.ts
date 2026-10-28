/**
 * Tool registration plumbing.
 *
 * Tools declare `write: true` in one place and get three things from it: the read-only
 * refusal, the MCP annotation hints, and exclusion from the read-only build. Leaving
 * that to each tool guarantees one eventually forgets.
 */

import type { McpServer } from '@modelcontextprotocol/server';
import type { z } from 'zod';
import type { AirysChatClient } from './client.js';
import { ACCESS_RANK, STABILITY_RANK, type AccessLevel, type Config, type Stability } from './config.js';
import { fromError, readOnlyRefusal, scopeRefusal, type ToolResult } from './result.js';

export interface ToolContext {
  client: AirysChatClient;
  config: Config;
}

interface ToolMetadata {
  name: string;
  /**
   * Maturity (ADR 0003). Non-stable tools are hidden unless AIRYSCHAT_FEATURES opts in.
   * Promotion to `stable` needs live evidence on staging and a changeset.
   */
  stability: Stability;
  /** For `deprecated` tools: the tool that replaces it, named in the description. */
  replacedBy?: string;
  title: string;
  description: string;
  /** True when the tool changes state. Drives the read-only gate and the destructive hint. */
  write?: boolean;
  /** True when the effect cannot be undone — a sent message, a launched campaign. */
  irreversible?: boolean;
  /** True when repeating the call has the same effect as making it once. */
  idempotent?: boolean;
  /**
   * For write tools that also have a harmless read path (the escape hatch's GET). In a
   * read-only build the tool stays registered, is annotated read-only, and its handler is
   * responsible for refusing every write path itself (it can read `config.readOnly`).
   */
  readOnlyCapable?: boolean;
}

/**
 * Registry-facing shape. The argument type is erased to `unknown` so a heterogeneous
 * list of tools can be held in one array; `defineTool` below preserves full inference
 * for whoever writes the handler, which is where it actually matters.
 */
export interface AnyToolDefinition extends ToolMetadata {
  inputSchema: z.ZodType;
  outputSchema?: z.ZodType;
  handler: (args: unknown, context: ToolContext) => Promise<ToolResult>;
}

export function defineTool<Schema extends z.ZodType>(
  definition: ToolMetadata & {
    inputSchema: Schema;
    outputSchema?: z.ZodType;
    handler: (args: z.infer<Schema>, context: ToolContext) => Promise<ToolResult>;
  },
): AnyToolDefinition {
  return definition as AnyToolDefinition;
}

/** Registers every tool the current config allows. Returns how many were registered. */
export function registerTools(
  server: McpServer,
  tools: AnyToolDefinition[],
  context: ToolContext,
  options: { keepUnscopedForRefusal?: boolean } = {},
): number {
  const maxAccess: AccessLevel = context.config.readOnly ? 'read' : (context.config.maxAccess ?? 'irreversible');
  const readOnly = context.config.readOnly || maxAccess === 'read';
  const enabled = tools
    .filter((tool) => isVisible(tool.stability, context.config.features))
    .filter((tool) => options.keepUnscopedForRefusal || !readOnly || !tool.write || tool.readOnlyCapable)
    .filter(
      (tool) =>
        options.keepUnscopedForRefusal ||
        ACCESS_RANK[maxAccess] >= ACCESS_RANK.irreversible ||
        !tool.irreversible ||
        tool.readOnlyCapable,
    );

  for (const tool of enabled) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: describe(tool),
        inputSchema: tool.inputSchema,
        ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
        annotations: {
          title: tool.title,
          readOnlyHint: !tool.write || (readOnly && Boolean(tool.readOnlyCapable)),
          destructiveHint: Boolean(tool.irreversible) && !readOnly,
          idempotentHint: Boolean(tool.idempotent),
          // Every tool reaches a remote AirysChat instance whose state changes
          // independently of this server.
          openWorldHint: true,
        },
      },
      async (args) => {
        // Belt and braces: read-only / scoped builds filter write/irreversible tools from
        // tools/list, and also enforce pre-call refusal if invoked directly.
        if (tool.write && readOnly && !tool.readOnlyCapable) {
          return context.config.authScheme === 'bearer'
            ? scopeRefusal(tool.name, tool.irreversible ? 'mcp:irreversible' : 'mcp:write')
            : readOnlyRefusal(tool.name);
        }
        if (tool.irreversible && ACCESS_RANK[maxAccess] < ACCESS_RANK.irreversible && !tool.readOnlyCapable) {
          return scopeRefusal(tool.name, 'mcp:irreversible');
        }
        try {
          return await tool.handler(args, context);
        } catch (error) {
          return fromError(error);
        }
      },
    );
  }

  return enabled.length;
}

/** Deprecated tools keep working for one minor release, so they count as stable for visibility. */
function isVisible(stability: Stability, features: Config['features']): boolean {
  const rank = stability === 'deprecated' ? STABILITY_RANK.stable : STABILITY_RANK[stability];
  return rank <= STABILITY_RANK[features];
}

/** Non-stable tools say so up front, so the model and the human both see the maturity. */
function describe(tool: AnyToolDefinition): string {
  switch (tool.stability) {
    case 'beta':
      return `[beta] ${tool.description}`;
    case 'experimental':
      return `[experimental — may change or break] ${tool.description}`;
    case 'deprecated':
      return `DEPRECATED${tool.replacedBy ? ` — use ${tool.replacedBy}` : ''}. ${tool.description}`;
    default:
      return tool.description;
  }
}
