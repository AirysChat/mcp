/**
 * Elicitation-based confirmations with `confirm: true` fallback (`APP-06`, ADR 0005).
 *
 * When a tool requires confirmation (`requireConfirmation` in `src/result.ts`):
 * 1. If the caller passed `confirm: true`, execution proceeds immediately on every client.
 * 2. If `confirm` is omitted and the client advertises form elicitation (`capabilities.elicitation`),
 *    the server returns an `InputRequiredResult` (`inputRequired.elicit`) with an HMAC-SHA256
 *    `requestState` bound to `(accountId, toolName, sha256(args))`.
 *    - On 2026-07-28 connections, the client fulfills the embedded elicitation request and retries
 *      `tools/call` with `inputResponses` and `requestState`.
 *    - On 2025-11-25 stateful connections, `@modelcontextprotocol/server`'s `LegacyInputRequiredShim`
 *      sends `elicitation/create` over the transport, verifies `requestState`, and re-enters the
 *      handler automatically.
 * 3. If the client does NOT advertise form elicitation (headless CLI, subagent, or legacy stateless),
 *    the server returns the deterministic `confirm: true` refusal text.
 */

import { createHash, randomBytes } from 'node:crypto';
import {
  acceptedContent,
  CLIENT_CAPABILITIES_META_KEY,
  createRequestStateCodec,
  inputRequired,
  inputResponse,
  type InputRequiredResult,
  type McpServer,
  type RequestStateCodec,
  type ServerContext,
} from '@modelcontextprotocol/server';
import { z } from 'zod';
import { failure, type ToolResult } from './result.js';
import type { ToolContext } from './toolsets.js';

const PROCESS_FALLBACK_SECRET = randomBytes(32);

export const ELICIT_CONFIRM_SCHEMA = z.object({
  confirm: z
    .boolean()
    .describe('Set to true to approve and execute this irreversible operation.'),
});

export interface ConfirmationStatePayload {
  accountId: string;
  toolName: string;
  argsDigest: string;
}

/**
 * Canonical SHA-256 digest of tool arguments (excluding `confirm`), so a `requestState`
 * minted for one target or payload cannot be replayed against mutated arguments.
 */
export function digestToolArgs(args: unknown): string {
  const normalized = canonicalizeArgs(args, true);
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function canonicalizeArgs(value: unknown, isRoot = false): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => canonicalizeArgs(item, false));
  const record = value as Record<string, unknown>;
  const sortedKeys = Object.keys(record)
    .filter((key) => !(isRoot && key === 'confirm') && record[key] !== undefined)
    .sort();
  const out: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    out[key] = canonicalizeArgs(record[key], false);
  }
  return out;
}

/**
 * Builds an HMAC-SHA256 `RequestStateCodec` bound to the MCP method and account ID.
 */
export function createConfirmationStateCodec(
  accountId: number | string | undefined,
  secretOverride?: string | Uint8Array,
): RequestStateCodec<ConfirmationStatePayload> {
  const rawSecret = secretOverride ?? process.env.AIRYSCHAT_STATE_SECRET;
  const key = rawSecret
    ? createHash('sha256').update(rawSecret).digest()
    : PROCESS_FALLBACK_SECRET;

  return createRequestStateCodec<ConfirmationStatePayload>({
    key,
    ttlSeconds: 600,
    bind: (ctx) => `${ctx.mcpReq.method}\0${String(accountId ?? '')}`,
  });
}

/**
 * Checks whether the connected client declared form elicitation support in either the
 * 2026-07-28 per-request `_meta` envelope or the 2025-11-25 `initialize` handshake.
 */
export function clientSupportsFormElicitation(
  server: McpServer,
  mcpCtx?: ServerContext,
): boolean {
  const rawEnvelope = mcpCtx?.mcpReq?.envelope as Record<string, unknown> | undefined;
  const rawMeta = mcpCtx?.mcpReq?._meta as Record<string, unknown> | undefined;
  const envelopeCaps = (rawEnvelope?.[CLIENT_CAPABILITIES_META_KEY] ??
    rawEnvelope?.clientCapabilities ??
    rawMeta?.[CLIENT_CAPABILITIES_META_KEY]) as
    | Record<string, unknown>
    | undefined;
  const legacyCaps = server.server.getClientCapabilities() as
    | Record<string, unknown>
    | undefined;
  const declared = envelopeCaps ?? legacyCaps;
  if (!declared || typeof declared !== 'object') return false;
  const elicitation = declared.elicitation;
  if (!elicitation || typeof elicitation !== 'object') return false;
  const record = elicitation as Record<string, unknown>;
  return record.form !== undefined || (record.form === undefined && record.url === undefined);
}

export type ElicitedConfirmationOutcome =
  | { status: 'none' }
  | { status: 'approved' }
  | { status: 'refused'; result: ToolResult };

/**
 * Inspects a retried request's `inputResponses` and verified `requestState` to determine
 * whether the user approved or declined a pending confirmation elicitation.
 */
export function resolveElicitedConfirmation(
  mcpCtx: ServerContext | undefined,
  context: Pick<ToolContext, 'config'>,
  toolName: string,
  args: unknown,
): ElicitedConfirmationOutcome {
  const responses = mcpCtx?.mcpReq?.inputResponses;
  if (!responses) return { status: 'none' };

  const view = inputResponse(responses, 'confirm');
  if (view.kind === 'missing') return { status: 'none' };
  if (view.kind !== 'elicit') {
    return {
      status: 'refused',
      result: failure(`Refused: unexpected input response kind "${view.kind}" for confirmation.`),
    };
  }
  if (view.action === 'decline' || view.action === 'cancel') {
    return {
      status: 'refused',
      result: failure(`Cancelled: the user ${view.action}d the confirmation prompt for ${toolName}.`),
    };
  }

  const state = mcpCtx?.mcpReq?.requestState<ConfirmationStatePayload>();
  const expectedAccountId = String(context.config.accountId ?? '');
  const expectedDigest = digestToolArgs(args);
  if (
    !state ||
    typeof state !== 'object' ||
    state.accountId !== expectedAccountId ||
    state.toolName !== toolName ||
    state.argsDigest !== expectedDigest
  ) {
    return {
      status: 'refused',
      result: failure(
        `Refused: confirmation requestState is missing or does not match tool "${toolName}" and its arguments.`,
      ),
    };
  }

  const content = acceptedContent(responses, 'confirm', ELICIT_CONFIRM_SCHEMA);
  if (content?.confirm !== true) {
    return {
      status: 'refused',
      result: failure(
        `Refused: confirmation checkbox was not set to true for ${toolName}. The action was not executed.`,
      ),
    };
  }

  return { status: 'approved' };
}

/**
 * Mints a signed `requestState` and builds the `input_required` elicitation response
 * for an irreversible tool call.
 */
export async function buildConfirmationInputRequired(
  codec: RequestStateCodec<ConfirmationStatePayload>,
  mcpCtx: ServerContext,
  context: Pick<ToolContext, 'config'>,
  toolName: string,
  args: unknown,
  effect: string,
): Promise<InputRequiredResult> {
  const requestState = await codec.mint(
    {
      accountId: String(context.config.accountId ?? ''),
      toolName,
      argsDigest: digestToolArgs(args),
    },
    mcpCtx,
  );

  return inputRequired({
    requestState,
    inputRequests: {
      confirm: inputRequired.elicit({
        message: `Confirm irreversible action (${toolName}): ${effect}`,
        requestedSchema: ELICIT_CONFIRM_SCHEMA,
      }),
    },
  });
}
