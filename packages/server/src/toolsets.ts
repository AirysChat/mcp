/**
 * Tool registration plumbing.
 *
 * Tools declare `write: true` in one place and get three things from it: the read-only
 * refusal, the MCP annotation hints, and exclusion from the read-only build. Leaving
 * that to each tool guarantees one eventually forgets.
 */

import type { McpServer, RequestStateCodec, ServerContext } from '@modelcontextprotocol/server';
import type { z } from 'zod';
import { TOOL_APP_META } from './apps/index.js';
import type { AirysChatClient } from './client.js';
import { ACCESS_RANK, STABILITY_RANK, type AccessLevel, type Config, type Stability } from './config.js';
import {
  buildConfirmationInputRequired,
  clientSupportsFormElicitation,
  createConfirmationStateCodec,
  resolveElicitedConfirmation,
  type ConfirmationStatePayload,
} from './elicitation.js';
import {
  failure,
  fromError,
  getConfirmationEffect,
  readOnlyRefusal,
  scopeRefusal,
  type ToolResult,
} from './result.js';
import {
  attachTaskMetadata,
  createTaskReporter,
  defaultTaskRegistry,
  TASK_TRACKED_TOOLS,
  TaskCancelledError,
  type TaskProgressReporter,
  type TaskRegistry,
} from './tasks.js';

export interface ToolContext {
  client: AirysChatClient;
  config: Config;
  mcp?: ServerContext;
  task?: TaskProgressReporter;
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
  /** Optional MCP `_meta` (e.g. `ui.resourceUri` for MCP Apps). */
  _meta?: Record<string, unknown>;
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

export interface RegisterToolsOptions {
  keepUnscopedForRefusal?: boolean;
  stateCodec?: RequestStateCodec<ConfirmationStatePayload>;
  taskRegistry?: TaskRegistry;
}

/** Registers every tool the current config allows. Returns how many were registered. */
export function registerTools(
  server: McpServer,
  tools: AnyToolDefinition[],
  context: ToolContext,
  options: RegisterToolsOptions = {},
): number {
  const maxAccess: AccessLevel = context.config.readOnly ? 'read' : (context.config.maxAccess ?? 'irreversible');
  const readOnly = context.config.readOnly || maxAccess === 'read';
  const stateCodec = options.stateCodec ?? createConfirmationStateCodec(context.config.accountId);
  const taskRegistry = options.taskRegistry ?? defaultTaskRegistry;
  const accountId = String(context.config.accountId ?? '');

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
    const appMeta = TOOL_APP_META[tool.name] ?? tool._meta;
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: describe(tool),
        inputSchema: tool.inputSchema,
        ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
        ...(appMeta ? { _meta: appMeta } : {}),
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
      async (args, mcpCtx) => {
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

        // Check whether this call is a retry of an elicited confirmation (`APP-06`).
        const elicitOutcome = resolveElicitedConfirmation(mcpCtx, context, tool.name, args);
        if (elicitOutcome.status === 'refused') {
          return elicitOutcome.result;
        }
        const effectiveArgs =
          elicitOutcome.status === 'approved' && args && typeof args === 'object'
            ? { ...(args as Record<string, unknown>), confirm: true }
            : args;

        const isTaskTracked = TASK_TRACKED_TOOLS.has(tool.name);
        const taskEntry = isTaskTracked
          ? createTaskReporter(taskRegistry, accountId, tool.name, effectiveArgs, mcpCtx)
          : undefined;

        const callContext: ToolContext = {
          ...context,
          mcp: mcpCtx,
          ...(taskEntry ? { task: taskEntry.reporter } : {}),
        };

        try {
          if (taskEntry) {
            taskEntry.reporter.throwIfAborted();
          }

          const result = await tool.handler(effectiveArgs, callContext);

          // If the tool stopped at a `requireConfirmation` gate (`APP-06`):
          const confirmationEffect = getConfirmationEffect(result);
          if (confirmationEffect !== undefined) {
            if (taskEntry) {
              taskRegistry.discardTask(taskEntry.task.taskId);
            }
            if (mcpCtx && clientSupportsFormElicitation(server, mcpCtx)) {
              return await buildConfirmationInputRequired(
                stateCodec,
                mcpCtx,
                context,
                tool.name,
                args,
                confirmationEffect,
              );
            }
            return result;
          }

          if (taskEntry) {
            const completed = taskRegistry.completeTask(taskEntry.task.taskId, result);
            if (completed) {
              const summary = taskRegistry.getTask(completed.taskId, accountId);
              if (summary) return attachTaskMetadata(result, summary);
            }
          }

          return result;
        } catch (error) {
          if (taskEntry) {
            if (error instanceof TaskCancelledError || taskEntry.reporter.signal.aborted) {
              const reason = error instanceof Error ? error.message : 'Task cancelled by caller';
              const cancelled = taskRegistry.cancelTask(taskEntry.task.taskId, accountId, reason);
              const failResult = failure(`Cancelled (${taskEntry.task.taskId}): ${reason}`);
              return cancelled ? attachTaskMetadata(failResult, cancelled) : failResult;
            }
            const errResult = fromError(error);
            const failed = taskRegistry.completeTask(taskEntry.task.taskId, errResult);
            if (failed) {
              const summary = taskRegistry.getTask(failed.taskId, accountId);
              if (summary) return attachTaskMetadata(errResult, summary);
            }
            return errResult;
          }
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
