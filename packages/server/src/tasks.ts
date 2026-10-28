/**
 * MCP Tasks & progress notifications (`APP-07`).
 *
 * Long-running operations (`wa_campaign_launch`, `wa_campaign_test_send`,
 * `crm_deals_bulk_update`) report progress via `notifications/progress` when the caller
 * supplies `_meta.progressToken`, honor cancellation via `ctx.mcpReq.signal` and
 * `tasks/cancel`, and expose task state through `tasks/list`, `tasks/get`, `tasks/result`,
 * and `tasks/cancel` scoped strictly to the authenticated `accountId`.
 */

import { randomUUID } from 'node:crypto';
import {
  ProtocolError,
  ProtocolErrorCode,
  RELATED_TASK_META_KEY,
  type McpServer,
  type ProgressToken,
  type ServerContext,
} from '@modelcontextprotocol/server';
import { z } from 'zod';
import { failure, json, type ToolResult } from './result.js';
import type { ToolContext } from './toolsets.js';

export type TrackedTaskStatus = 'working' | 'input_required' | 'completed' | 'failed' | 'cancelled';

export interface TrackedTaskSummary {
  taskId: string;
  toolName: string;
  status: TrackedTaskStatus;
  statusMessage: string;
  progress: number;
  total: number;
  createdAt: string;
  lastUpdatedAt: string;
  ttl: number;
}

interface InternalTrackedTask extends TrackedTaskSummary {
  accountId: string;
  abortController: AbortController;
  result?: ToolResult;
}

export class TaskCancelledError extends Error {
  readonly taskId: string;
  constructor(taskId: string, reason = 'Task cancelled by caller') {
    super(reason);
    this.name = 'TaskCancelledError';
    this.taskId = taskId;
  }
}

export interface TaskProgressReporter {
  readonly taskId: string;
  readonly signal: AbortSignal;
  reportProgress(progress: number, total: number, message: string): Promise<void>;
  throwIfAborted(): void;
}

export const TASK_TRACKED_TOOLS = new Set([
  'wa_campaign_launch',
  'wa_campaign_test_send',
  'crm_deals_bulk_update',
]);

const DEFAULT_TASK_TTL_MS = 60 * 60 * 1000;
const DEFAULT_MAX_TASKS = 200;

export class TaskRegistry {
  private readonly tasks = new Map<string, InternalTrackedTask>();
  private readonly maxTasks: number;

  constructor(maxTasks = DEFAULT_MAX_TASKS) {
    this.maxTasks = maxTasks;
  }

  createTask(params: {
    accountId: string;
    toolName: string;
    total?: number;
    statusMessage?: string;
    externalSignal?: AbortSignal;
    taskId?: string;
  }): InternalTrackedTask {
    if (this.tasks.size >= this.maxTasks) {
      const oldestKey = this.tasks.keys().next().value;
      if (oldestKey !== undefined) this.tasks.delete(oldestKey);
    }

    const taskId = params.taskId ?? `task_${randomUUID()}`;
    const now = new Date().toISOString();
    const abortController = new AbortController();

    if (params.externalSignal) {
      if (params.externalSignal.aborted) {
        abortController.abort(params.externalSignal.reason);
      } else {
        params.externalSignal.addEventListener(
          'abort',
          () => abortController.abort(params.externalSignal?.reason),
          { once: true },
        );
      }
    }

    const record: InternalTrackedTask = {
      taskId,
      accountId: params.accountId,
      toolName: params.toolName,
      status: abortController.signal.aborted ? 'cancelled' : 'working',
      statusMessage: params.statusMessage ?? `Starting ${params.toolName}`,
      progress: 0,
      total: params.total ?? 1,
      createdAt: now,
      lastUpdatedAt: now,
      ttl: DEFAULT_TASK_TTL_MS,
      abortController,
    };

    this.tasks.set(taskId, record);
    return record;
  }

  updateProgress(taskId: string, progress: number, total: number, message: string): void {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'working') return;
    task.progress = progress;
    task.total = total;
    task.statusMessage = message;
    task.lastUpdatedAt = new Date().toISOString();
  }

  completeTask(taskId: string, result: ToolResult, message?: string): InternalTrackedTask | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;
    task.status = result.isError ? 'failed' : 'completed';
    task.progress = task.total;
    task.statusMessage = message ?? (result.isError ? `${task.toolName} failed` : `${task.toolName} completed`);
    task.lastUpdatedAt = new Date().toISOString();
    task.result = result;
    return task;
  }

  discardTask(taskId: string): void {
    this.tasks.delete(taskId);
  }

  cancelTask(taskId: string, accountId: string, reason = 'Cancelled by operator'): TrackedTaskSummary | undefined {
    const task = this.tasks.get(taskId);
    if (!task || task.accountId !== accountId) return undefined;
    if (task.status === 'working' || task.status === 'input_required') {
      task.status = 'cancelled';
      task.statusMessage = reason;
      task.lastUpdatedAt = new Date().toISOString();
      task.result = failure(`Cancelled (${taskId}): ${reason}`);
      task.abortController.abort(new TaskCancelledError(taskId, reason));
    }
    return toSummary(task);
  }

  getTask(taskId: string, accountId: string): TrackedTaskSummary | undefined {
    const task = this.tasks.get(taskId);
    if (!task || task.accountId !== accountId) return undefined;
    return toSummary(task);
  }

  getTaskResult(taskId: string, accountId: string): { summary: TrackedTaskSummary; result?: ToolResult } | undefined {
    const task = this.tasks.get(taskId);
    if (!task || task.accountId !== accountId) return undefined;
    return { summary: toSummary(task), result: task.result };
  }

  listTasks(accountId: string): TrackedTaskSummary[] {
    const out: TrackedTaskSummary[] = [];
    for (const task of this.tasks.values()) {
      if (task.accountId === accountId) out.push(toSummary(task));
    }
    return out.reverse();
  }
}

function toSummary(task: InternalTrackedTask): TrackedTaskSummary {
  return {
    taskId: task.taskId,
    toolName: task.toolName,
    status: task.status,
    statusMessage: task.statusMessage,
    progress: task.progress,
    total: task.total,
    createdAt: task.createdAt,
    lastUpdatedAt: task.lastUpdatedAt,
    ttl: task.ttl,
  };
}

export const defaultTaskRegistry = new TaskRegistry();

/**
 * Creates a `TaskProgressReporter` for a tool execution and wires `notifications/progress`
 * when the client provided a `progressToken`.
 */
export function createTaskReporter(
  registry: TaskRegistry,
  accountId: string,
  toolName: string,
  args: unknown,
  mcpCtx?: ServerContext,
): { task: InternalTrackedTask; reporter: TaskProgressReporter } {
  const initialTotal = inferInitialTotal(toolName, args);
  const task = registry.createTask({
    accountId,
    toolName,
    total: initialTotal,
    statusMessage: `Starting ${toolName}`,
    externalSignal: mcpCtx?.mcpReq?.signal,
  });

  const progressToken = mcpCtx?.mcpReq?._meta?.progressToken as ProgressToken | undefined;

  const reporter: TaskProgressReporter = {
    taskId: task.taskId,
    signal: task.abortController.signal,
    throwIfAborted() {
      if (task.abortController.signal.aborted) {
        const reason = task.abortController.signal.reason;
        if (reason instanceof TaskCancelledError) throw reason;
        throw new TaskCancelledError(
          task.taskId,
          reason instanceof Error ? reason.message : 'Task cancelled by caller',
        );
      }
    },
    async reportProgress(progress: number, total: number, message: string) {
      registry.updateProgress(task.taskId, progress, total, message);
      if (progressToken !== undefined && mcpCtx?.mcpReq?.notify) {
        try {
          await mcpCtx.mcpReq.notify({
            method: 'notifications/progress',
            params: {
              progressToken,
              progress,
              total,
              message,
            },
          });
        } catch {
          // Best-effort notification: stateless or closed transports may not accept out-of-band frames.
        }
      }
    },
  };

  return { task, reporter };
}

function inferInitialTotal(toolName: string, args: unknown): number {
  if (toolName === 'crm_deals_bulk_update' && args && typeof args === 'object') {
    const ids = (args as Record<string, unknown>).ids;
    if (Array.isArray(ids) && ids.length > 0) return ids.length;
  }
  return 2;
}

/**
 * Stamps `[RELATED_TASK_META_KEY]` (`io.modelcontextprotocol/related-task`) onto a `ToolResult`.
 */
export function attachTaskMetadata(result: ToolResult, summary: TrackedTaskSummary): ToolResult {
  const existingMeta = (result._meta ?? {}) as Record<string, unknown>;
  const enriched: ToolResult = {
    ...result,
    _meta: {
      ...existingMeta,
      [RELATED_TASK_META_KEY]: { taskId: summary.taskId },
      task: summary,
    },
  };
  if (enriched.structuredContent && typeof enriched.structuredContent === 'object' && !Array.isArray(enriched.structuredContent)) {
    enriched.structuredContent = {
      ...(enriched.structuredContent as Record<string, unknown>),
      _task: summary,
    };
  }
  return enriched;
}

const TaskListParamsSchema = z.object({
  cursor: z.string().optional(),
});

const TaskIdParamsSchema = z.object({
  taskId: z.string().min(1),
});

const TaskCancelParamsSchema = z.object({
  taskId: z.string().min(1),
  reason: z.string().optional(),
});

/**
 * Registers `tasks/list`, `tasks/get`, `tasks/result`, and `tasks/cancel` on the underlying
 * `Server` instance so MCP clients can poll or cancel long-running tasks.
 */
export function registerTaskHandlers(
  server: McpServer,
  context: Pick<ToolContext, 'config'>,
  registry: TaskRegistry = defaultTaskRegistry,
): void {
  const accountId = String(context.config.accountId ?? '');

  server.server.setRequestHandler(
    'tasks/list',
    { params: TaskListParamsSchema },
    async () => ({
      tasks: registry.listTasks(accountId),
    }),
  );

  server.server.setRequestHandler(
    'tasks/get',
    { params: TaskIdParamsSchema },
    async ({ taskId }) => {
      const summary = registry.getTask(taskId, accountId);
      if (!summary) {
        throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Task not found: ${taskId}`, { taskId });
      }
      return { ...summary };
    },
  );

  server.server.setRequestHandler(
    'tasks/result',
    { params: TaskIdParamsSchema },
    async ({ taskId }) => {
      const entry = registry.getTaskResult(taskId, accountId);
      if (!entry) {
        throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Task not found: ${taskId}`, { taskId });
      }
      if (entry.result) return entry.result;
      return json({
        taskId: entry.summary.taskId,
        status: entry.summary.status,
        statusMessage: entry.summary.statusMessage,
        progress: entry.summary.progress,
        total: entry.summary.total,
      });
    },
  );

  server.server.setRequestHandler(
    'tasks/cancel',
    { params: TaskCancelParamsSchema },
    async ({ taskId, reason }) => {
      const cancelled = registry.cancelTask(taskId, accountId, reason ?? 'Cancelled via tasks/cancel');
      if (!cancelled) {
        throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Task not found: ${taskId}`, { taskId });
      }
      return { ...cancelled };
    },
  );
}
