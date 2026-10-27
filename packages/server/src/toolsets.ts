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
import type { Config } from './config.js';
import { fromError, readOnlyRefusal, type ToolResult } from './result.js';

export interface ToolContext {
  client: AirysChatClient;
  config: Config;
}

interface ToolMetadata {
  name: string;
  title: string;
  description: string;
  /** True when the tool changes state. Drives the read-only gate and the destructive hint. */
  write?: boolean;
  /** True when the effect cannot be undone — a sent message, a launched campaign. */
  irreversible?: boolean;
  /** True when repeating the call has the same effect as making it once. */
  idempotent?: boolean;
}

/**
 * Registry-facing shape. The argument type is erased to `unknown` so a heterogeneous
 * list of tools can be held in one array; `defineTool` below preserves full inference
 * for whoever writes the handler, which is where it actually matters.
 */
export interface AnyToolDefinition extends ToolMetadata {
  inputSchema: z.ZodType;
  handler: (args: unknown, context: ToolContext) => Promise<ToolResult>;
}

export function defineTool<Schema extends z.ZodType>(
  definition: ToolMetadata & {
    inputSchema: Schema;
    handler: (args: z.infer<Schema>, context: ToolContext) => Promise<ToolResult>;
  },
): AnyToolDefinition {
  return definition as AnyToolDefinition;
}

/** Registers every tool the current config allows. Returns how many were registered. */
export function registerTools(server: McpServer, tools: AnyToolDefinition[], context: ToolContext): number {
  const enabled = context.config.readOnly ? tools.filter((tool) => !tool.write) : tools;

  for (const tool of enabled) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {
          title: tool.title,
          readOnlyHint: !tool.write,
          destructiveHint: Boolean(tool.irreversible),
          idempotentHint: Boolean(tool.idempotent),
          // Every tool reaches a remote AirysChat instance whose state changes
          // independently of this server.
          openWorldHint: true,
        },
      },
      async (args) => {
        // Belt and braces: read-only builds never register write tools, but a future
        // caller that registers directly should still hit the gate.
        if (tool.write && context.config.readOnly) return readOnlyRefusal(tool.name);
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
