import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { McpServer } from '@modelcontextprotocol/server';
import type { AirysChatClient, RequestOptions } from '../src/client.js';
import { loadConfig, type Config } from '../src/config.js';
import type { ToolResult } from '../src/result.js';
import { crmTools } from '../src/tools/crm.js';
import { whatsappTools } from '../src/tools/whatsapp.js';
import { registerTools, type AnyToolDefinition, type ToolContext } from '../src/toolsets.js';

interface RecordedCall {
  path: string;
  options?: RequestOptions;
}

function createMockContext(
  responder: (path: string, options?: RequestOptions) => unknown = () => ({ id: 1, ok: true }),
): { context: ToolContext; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const client = {
    request: async (path: string, options?: RequestOptions) => {
      calls.push({ path, options });
      return responder(path, options);
    },
  } as unknown as AirysChatClient;

  const config: Config = {
    baseUrl: 'https://staging.airys.app',
    apiKey: 'test-token',
    accountId: 6,
    toolsets: new Set(['core', 'whatsapp', 'crm']),
    features: 'beta',
    readOnly: false,
    timeoutMs: 5_000,
    maxAccess: 'irreversible',
  };

  return { context: { client, config }, calls };
}

function findTool(list: AnyToolDefinition[], name: string): AnyToolDefinition {
  const tool = list.find((entry) => entry.name === name);
  assert.ok(tool, `Expected tool "${name}" to exist`);
  return tool;
}

function textOf(result: ToolResult): string {
  return (result.content ?? []).map((c) => ('text' in c && typeof c.text === 'string' ? c.text : '')).join('\n');
}

describe('Lane 011 — Action Tools Scope Alignment & Stable Promotion (`ACT-01..ACT-04`)', () => {
  it('ACT-01: hides crm_deal_move, crm_deal_update, and wa_campaign_create from mcp:write tokens while keeping reversible writes visible', () => {
    const registered: string[] = [];
    const server = {
      registerTool: (name: string) => registered.push(name),
    } as unknown as McpServer;
    const config = loadConfig({
      AIRYSCHAT_BASE_URL: 'https://staging.airys.app',
      AIRYSCHAT_API_KEY: 'test-key',
      AIRYSCHAT_ACCOUNT_ID: '6',
      AIRYSCHAT_TOOLSETS: 'whatsapp,crm',
      AIRYSCHAT_FEATURES: 'stable',
      AIRYSCHAT_SCOPES: 'mcp:write',
    });

    registerTools(server, [...crmTools, ...whatsappTools], {
      config,
      client: {} as AirysChatClient,
    });

    // Reversible writes exposed under AIRYSCHAT_FEATURES=stable + mcp:write
    assert.ok(registered.includes('crm_deal_create'));
    assert.ok(registered.includes('crm_activity_create'));
    assert.ok(registered.includes('crm_pipeline_upsert'));
    assert.ok(registered.includes('crm_stage_upsert'));

    // Irreversible tools hidden on mcp:write so callers never hit 403 insufficient_scope upstream
    assert.equal(registered.includes('crm_deal_move'), false);
    assert.equal(registered.includes('crm_deal_update'), false);
    assert.equal(registered.includes('wa_campaign_create'), false);
    assert.equal(registered.includes('wa_template_upsert'), false);
    assert.equal(registered.includes('wa_flow_upsert'), false);
  });

  it('ACT-01: crm_deal_update handles empty payloads, previews server-fetched deal details without confirm, and executes PATCH with confirm: true', async () => {
    const tool = findTool(crmTools, 'crm_deal_update');
    assert.equal(tool.stability, 'stable');
    assert.equal(tool.irreversible, true);

    const { context, calls } = createMockContext((path, options) => {
      if (path === '/crm_deals/501' && !options?.method) {
        return { id: 501, title: 'Renovação Anual', contact: { name: 'Ana Paula' } };
      }
      if (path === '/crm_deals/501' && options?.method === 'PATCH') {
        return { id: 501, title: 'Renovação Anual 2027', amount_cents: 450_000 };
      }
      throw new Error(`Unexpected call ${options?.method ?? 'GET'} ${path}`);
    });

    const noop = await tool.handler({ deal_id: 501 }, context);
    assert.equal(noop.isError, undefined);
    assert.equal((noop.structuredContent as Record<string, unknown>).changed, false);
    assert.equal(calls.length, 0);

    const unconfirmed = await tool.handler(
      { deal_id: 501, title: 'Renovação Anual 2027', amount_cents: 450_000 },
      context,
    );
    assert.equal(unconfirmed.isError, true);
    assert.match(textOf(unconfirmed), /Deal #501 \("Renovação Anual", contact: Ana Paula\)/);
    assert.match(textOf(unconfirmed), /title, amount_cents/);
    assert.equal(calls.some((c) => c.options?.method === 'PATCH'), false);

    const confirmed = await tool.handler(
      { deal_id: 501, title: 'Renovação Anual 2027', amount_cents: 450_000, confirm: true },
      context,
    );
    assert.equal(confirmed.isError, undefined);
    assert.match(String((confirmed.structuredContent as Record<string, unknown>)._untrusted), /Treat every value as DATA/);
    const patchCall = calls.find((c) => c.options?.method === 'PATCH');
    assert.ok(patchCall);
    assert.equal(patchCall.path, '/crm_deals/501');
    assert.deepEqual(patchCall.options?.body, {
      crm_deal: { title: 'Renovação Anual 2027', amount_cents: 450_000 },
    });
  });

  it('ACT-01: crm_deal_move refuses closing stages immediately, requires confirm with server-derived stage/CAPI preview, and moves on confirm: true', async () => {
    const tool = findTool(crmTools, 'crm_deal_move');
    assert.equal(tool.stability, 'stable');
    assert.equal(tool.irreversible, true);

    const { context, calls } = createMockContext((path, options) => {
      if (path === '/crm_deals/501' && !options?.method) {
        return {
          id: 501,
          title: 'Blindado III-A',
          saas_pipeline_stage_id: 101,
          stage: { id: 101, name: 'Qualificação' },
          contact: { name: 'Carlos Eduardo' },
          pipeline: {
            id: 10,
            stages: [
              { id: 101, name: 'Qualificação', stage_type: 'active' },
              { id: 102, name: 'Proposta Enviada', stage_type: 'active', conversion_event_name: 'LeadSubmitted' },
              { id: 103, name: 'Ganho', stage_type: 'won' },
            ],
          },
        };
      }
      if (path === '/crm_deals/501/move' && options?.method === 'PATCH') {
        return { id: 501, saas_pipeline_stage_id: 102 };
      }
      throw new Error(`Unexpected call ${options?.method ?? 'GET'} ${path}`);
    });

    const closingRefused = await tool.handler(
      { deal_id: 501, saas_pipeline_stage_id: 103, confirm: true },
      context,
    );
    assert.equal(closingRefused.isError, true);
    assert.match(textOf(closingRefused), /crm_deal_close/);
    assert.equal(calls.some((c) => c.path.endsWith('/move')), false);

    const unconfirmed = await tool.handler(
      { deal_id: 501, saas_pipeline_stage_id: 102 },
      context,
    );
    assert.equal(unconfirmed.isError, true);
    assert.match(textOf(unconfirmed), /Deal #501 \("Blindado III-A", contact: Carlos Eduardo\)/);
    assert.match(textOf(unconfirmed), /from "Qualificação" to stage #102 \("Proposta Enviada"\)/);
    assert.match(textOf(unconfirmed), /LeadSubmitted/);
    assert.equal(calls.some((c) => c.path.endsWith('/move')), false);

    const confirmed = await tool.handler(
      { deal_id: 501, saas_pipeline_stage_id: 102, position: 0, confirm: true },
      context,
    );
    assert.equal(confirmed.isError, undefined);
    assert.match(String((confirmed.structuredContent as Record<string, unknown>)._untrusted), /Treat every value as DATA/);
    const moveCall = calls.find((c) => c.path === '/crm_deals/501/move');
    assert.ok(moveCall);
    assert.deepEqual(moveCall.options?.body, { saas_pipeline_stage_id: 102, position: 0 });
  });

  it('ACT-02: crm_deal_create requires only contact_id and resolves default pipeline/stage or explicit IDs cleanly', async () => {
    const tool = findTool(crmTools, 'crm_deal_create');
    assert.equal(tool.stability, 'stable');
    assert.equal(tool.write, true);
    assert.equal(Boolean(tool.irreversible), false);

    // 1. Explicit pipeline + stage -> zero extra discovery calls
    {
      const { context, calls } = createMockContext(() => ({ id: 600, title: 'Explicit Deal' }));
      const res = await tool.handler(
        { contact_id: 11, title: 'Explicit Deal', saas_pipeline_id: 10, saas_pipeline_stage_id: 101 },
        context,
      );
      assert.equal(res.isError, undefined);
      assert.equal(calls.length, 1);
      assert.equal(calls[0]!.path, '/crm_deals');
    }

    // 2. Omitted pipeline + stage + title -> resolves from /crm_pipeline_settings when configured
    {
      const { context, calls } = createMockContext((path, options) => {
        if (path === '/crm_pipeline_settings') {
          return { default_pipeline_id: 5, default_stage_id: 31 };
        }
        if (path === '/crm_deals' && options?.method === 'POST') {
          return { id: 601, title: 'Maria', saas_pipeline_id: 5, saas_pipeline_stage_id: 31 };
        }
        throw new Error(`Unexpected call ${path}`);
      });
      const res = await tool.handler({ contact_id: 22 }, context);
      assert.equal(res.isError, undefined);
      assert.match(String((res.structuredContent as Record<string, unknown>)._untrusted), /Treat every value as DATA/);
      const postCall = calls.find((c) => c.path === '/crm_deals');
      assert.deepEqual(postCall?.options?.body, {
        crm_deal: { contact_id: 22, saas_pipeline_id: 5, saas_pipeline_stage_id: 31 },
      });
    }

    // 3. Fallback when /crm_pipeline_settings has null defaults -> first pipeline + first active stage
    {
      const { context, calls } = createMockContext((path, options) => {
        if (path === '/crm_pipeline_settings') {
          return { default_pipeline_id: null, default_stage_id: null };
        }
        if (path === '/pipelines') {
          return [{ id: 8, name: 'Comercial' }];
        }
        if (path === '/pipelines/8/pipeline_stages') {
          return [
            { id: 80, name: 'Ganho', stage_type: 'won' },
            { id: 81, name: 'Entrada', stage_type: 'active' },
          ];
        }
        if (path === '/crm_deals' && options?.method === 'POST') {
          return { id: 602, saas_pipeline_id: 8, saas_pipeline_stage_id: 81 };
        }
        throw new Error(`Unexpected call ${path}`);
      });
      const res = await tool.handler({ contact_id: 33 }, context);
      assert.equal(res.isError, undefined);
      const postCall = calls.find((c) => c.path === '/crm_deals');
      assert.deepEqual(postCall?.options?.body, {
        crm_deal: { contact_id: 33, saas_pipeline_id: 8, saas_pipeline_stage_id: 81 },
      });
    }

    // 4. Explicit pipeline_id without stage_id -> resolves first active stage of that pipeline
    {
      const { context, calls } = createMockContext((path, options) => {
        if (path === '/pipelines/9/pipeline_stages') {
          return [{ id: 91, name: 'Novo Lead', stage_type: 'active' }];
        }
        if (path === '/crm_deals' && options?.method === 'POST') {
          return { id: 603, saas_pipeline_id: 9, saas_pipeline_stage_id: 91 };
        }
        throw new Error(`Unexpected call ${path}`);
      });
      const res = await tool.handler({ contact_id: 44, saas_pipeline_id: 9 }, context);
      assert.equal(res.isError, undefined);
      assert.equal(calls.length, 2);
    }

    // 5. No pipeline configured -> clean failure without calling POST /crm_deals
    {
      const { context, calls } = createMockContext((path) => {
        if (path === '/crm_pipeline_settings') return { default_pipeline_id: null, default_stage_id: null };
        if (path === '/pipelines') return [];
        throw new Error(`Unexpected call ${path}`);
      });
      const res = await tool.handler({ contact_id: 55 }, context);
      assert.equal(res.isError, true);
      assert.match(textOf(res), /No CRM sales pipeline is configured/);
      assert.equal(calls.some((c) => c.path === '/crm_deals'), false);
    }
  });

  it('ACT-03: crm_activity_create, crm_pipeline_upsert, and crm_stage_upsert validate inputs and route to /saas', async () => {
    const actCreate = findTool(crmTools, 'crm_activity_create');
    const pipeUpsert = findTool(crmTools, 'crm_pipeline_upsert');
    const stageUpsert = findTool(crmTools, 'crm_stage_upsert');

    assert.equal(actCreate.stability, 'stable');
    assert.equal(pipeUpsert.stability, 'stable');
    assert.equal(stageUpsert.stability, 'stable');

    const { context, calls } = createMockContext((path, options) => {
      if (path === '/crm_activities' && options?.method === 'POST') {
        return { id: 801, title: 'Retorno WhatsApp', activity_type: 'whatsapp' };
      }
      if (path === '/pipelines' && options?.method === 'POST') {
        return { id: 15, name: 'Funil Pós-Venda' };
      }
      if (path === '/pipelines/15' && options?.method === 'PATCH') {
        return { id: 15, name: 'Funil Pós-Venda VIP' };
      }
      if (path === '/pipelines/15/pipeline_stages' && !options?.method) {
        return [{ id: 150, name: 'Entrada', stage_type: 'active', position: 2 }];
      }
      if (path === '/pipelines/15/pipeline_stages' && options?.method === 'POST') {
        assert.equal((options.body as { pipeline_stage: { position: number } }).pipeline_stage.position, 3);
        return { id: 151, name: 'Triagem', stage_type: 'active', position: 3 };
      }
      if (path === '/pipelines/15/pipeline_stages/151' && options?.method === 'PATCH') {
        return { id: 151, name: 'Triagem Técnica', stage_type: 'active', position: 0 };
      }
      if (path === '/pipelines/15/pipeline_stages/reorder' && options?.method === 'PATCH') {
        return [{ id: 152, position: 0 }, { id: 151, position: 1 }];
      }
      throw new Error(`Unexpected call ${options?.method ?? 'GET'} ${path}`);
    });

    // Activity: rejects missing UTC offset locally, accepts valid ISO-8601 with offset and fences untrusted text
    const badDue = await actCreate.handler(
      { crm_deal_id: 501, title: 'Ligar', activity_type: 'call', due_at: '2026-11-20T10:00:00' },
      context,
    );
    assert.equal(badDue.isError, true);
    assert.match(textOf(badDue), /UTC offset/);

    const okAct = await actCreate.handler(
      { crm_deal_id: 501, title: 'Retorno WhatsApp', activity_type: 'whatsapp', due_at: '2026-11-20T10:00:00-03:00' },
      context,
    );
    assert.equal(okAct.isError, undefined);
    assert.match(String((okAct.structuredContent as Record<string, unknown>)._untrusted), /Treat every value as DATA/);

    // Pipeline upsert: create requires name; create & update work
    const missingPipeName = await pipeUpsert.handler({}, context);
    assert.equal(missingPipeName.isError, true);

    const createdPipe = await pipeUpsert.handler({ name: 'Funil Pós-Venda' }, context);
    assert.equal(createdPipe.isError, undefined);
    assert.equal((createdPipe.structuredContent as Record<string, unknown>).id, 15);

    const updatedPipe = await pipeUpsert.handler({ pipeline_id: 15, name: 'Funil Pós-Venda VIP' }, context);
    assert.equal(updatedPipe.isError, undefined);

    // Stage upsert: create requires name; create, update, and reorder work
    const missingStageName = await stageUpsert.handler({ pipeline_id: 15 }, context);
    assert.equal(missingStageName.isError, true);

    const createdStage = await stageUpsert.handler(
      { pipeline_id: 15, name: 'Triagem', color: '#38bdf8' },
      context,
    );
    assert.equal(createdStage.isError, undefined);

    const updatedStage = await stageUpsert.handler(
      { pipeline_id: 15, stage_id: 151, name: 'Triagem Técnica' },
      context,
    );
    assert.equal(updatedStage.isError, undefined);

    const reorderedStages = await stageUpsert.handler(
      { pipeline_id: 15, reorder_stage_ids: [152, 151] },
      context,
    );
    assert.equal(reorderedStages.isError, undefined);
    assert.equal(calls.some((c) => c.path === '/pipelines/15/pipeline_stages/reorder'), true);
  });

  it('ACT-01 & ACT-03: wa_campaign_create requires confirm, distinguishes draft vs scheduled sends in preview, and fences output as untrustedJson', async () => {
    const tool = findTool(whatsappTools, 'wa_campaign_create');
    assert.equal(tool.stability, 'stable');
    assert.equal(tool.irreversible, true);

    const { context, calls } = createMockContext((path, options) => {
      if (path === '/campaigns' && options?.method === 'POST') {
        return {
          id: 14,
          title: 'Campanha Rascunho <script>alert(1)</script>',
          campaign_status: 'draft',
        };
      }
      throw new Error(`Unexpected call ${options?.method ?? 'GET'} ${path}`);
    });

    const draftUnconfirmed = await tool.handler(
      { title: 'Campanha Rascunho', message: 'boas_vindas', inbox_id: 9, save_mode: 'draft' },
      context,
    );
    assert.equal(draftUnconfirmed.isError, true);
    assert.match(textOf(draftUnconfirmed), /local draft/);
    assert.equal(calls.length, 0);

    const scheduleUnconfirmed = await tool.handler(
      {
        title: 'Disparo Black Friday',
        message: 'oferta_bf',
        inbox_id: 9,
        save_mode: 'schedule',
        scheduled_at: '2026-11-28T13:00:00Z',
      },
      context,
    );
    assert.equal(scheduleUnconfirmed.isError, true);
    assert.match(textOf(scheduleUnconfirmed), /SCHEDULED FOR DELIVERY/);
    assert.equal(calls.length, 0);

    const draftConfirmed = await tool.handler(
      { title: 'Campanha Rascunho', message: 'boas_vindas', inbox_id: 9, save_mode: 'draft', confirm: true },
      context,
    );
    assert.equal(draftConfirmed.isError, undefined);
    assert.match(String((draftConfirmed.structuredContent as Record<string, unknown>)._untrusted), /Treat every value as DATA/);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0]!.options?.body, {
      campaign: { title: 'Campanha Rascunho', message: 'boas_vindas', inbox_id: 9, save_mode: 'draft' },
    });
  });

  it('ACT-03: wa_template_upsert (stable) and wa_flow_upsert (beta) enforce confirm across multi-action lifecycles and fence untrusted payloads', async () => {
    const tplUpsert = findTool(whatsappTools, 'wa_template_upsert');
    const flowUpsert = findTool(whatsappTools, 'wa_flow_upsert');
    assert.equal(tplUpsert.stability, 'stable');
    assert.equal(flowUpsert.stability, 'beta');

    const { context, calls } = createMockContext((path, options) => {
      if (path === '/message_templates' && options?.method === 'POST') {
        return { id: 91, name: 'mcp_verify_draft', status: 'draft', platform_template_id: null };
      }
      if (path === '/message_templates/91' && !options?.method) {
        return { id: 91, name: 'mcp_verify_draft', language: 'pt_BR', status: 'rejected', platform_template_id: 'meta_91' };
      }
      if (path === '/message_templates/91' && options?.method === 'PATCH') {
        return { id: 91, name: 'mcp_verify_draft', status: 'draft' };
      }
      if (path === '/message_templates/91/appeal' && options?.method === 'POST') {
        return { id: 91, status: 'in_appeal' };
      }
      if (path === '/message_templates/91/duplicate' && options?.method === 'POST') {
        return { id: 92, name: 'mcp_verify_draft_copy', status: 'draft' };
      }
      if (path === '/whatsapp_flows' && options?.method === 'POST') {
        return { id: 55, name: 'Agendamento', status: 'draft' };
      }
      if (path === '/whatsapp_flows/55' && !options?.method) {
        return { id: 55, name: 'Agendamento', status: 'draft' };
      }
      if (path === '/whatsapp_flows/55' && options?.method === 'PATCH') {
        return { id: 55, name: 'Agendamento v2', status: 'draft' };
      }
      if (path === '/whatsapp_flows/55/publish' && options?.method === 'POST') {
        return { id: 55, name: 'Agendamento v2', status: 'published' };
      }
      if (path === '/whatsapp_flows/55' && options?.method === 'DELETE') {
        return {};
      }
      throw new Error(`Unexpected call ${options?.method ?? 'GET'} ${path}`);
    });

    // Template create / update / appeal / duplicate
    const tplUnconfirmed = await tplUpsert.handler(
      { action: 'create', name: 'mcp_verify_draft', language: 'pt_BR', category: 'utility' },
      context,
    );
    assert.equal(tplUnconfirmed.isError, true);
    assert.match(textOf(tplUnconfirmed), /as local draft/);

    const tplCreated = await tplUpsert.handler(
      { action: 'create', name: 'mcp_verify_draft', language: 'pt_BR', category: 'utility', confirm: true },
      context,
    );
    assert.equal(tplCreated.isError, undefined);
    assert.match(String((tplCreated.structuredContent as Record<string, unknown>)._untrusted), /Treat every value as DATA/);

    const tplUpdateUnconfirmed = await tplUpsert.handler(
      { action: 'update', template_id: 91, category: 'utility' },
      context,
    );
    assert.equal(tplUpdateUnconfirmed.isError, true);
    assert.match(textOf(tplUpdateUnconfirmed), /resubmit to Meta/);

    const tplUpdated = await tplUpsert.handler(
      { action: 'update', template_id: 91, category: 'utility', confirm: true },
      context,
    );
    assert.equal(tplUpdated.isError, undefined);

    const tplAppealed = await tplUpsert.handler(
      { action: 'appeal', template_id: 91, appeal_reason: 'Transactional order status', confirm: true },
      context,
    );
    assert.equal(tplAppealed.isError, undefined);

    const tplDuplicated = await tplUpsert.handler(
      { action: 'duplicate', template_id: 91, name: 'mcp_verify_draft_copy', confirm: true },
      context,
    );
    assert.equal(tplDuplicated.isError, undefined);

    // Flow create / update / publish / delete
    const flowUnconfirmed = await flowUpsert.handler(
      { action: 'create', name: 'Agendamento', inbox_id: 9 },
      context,
    );
    assert.equal(flowUnconfirmed.isError, true);

    const flowCreated = await flowUpsert.handler(
      { action: 'create', name: 'Agendamento', inbox_id: 9, confirm: true },
      context,
    );
    assert.equal(flowCreated.isError, undefined);
    assert.match(String((flowCreated.structuredContent as Record<string, unknown>)._untrusted), /Treat every value as DATA/);

    const flowUpdated = await flowUpsert.handler(
      { action: 'update', flow_id: 55, name: 'Agendamento v2', confirm: true },
      context,
    );
    assert.equal(flowUpdated.isError, undefined);

    const flowPublished = await flowUpsert.handler(
      { action: 'publish', flow_id: 55, confirm: true },
      context,
    );
    assert.equal(flowPublished.isError, undefined);

    const flowDeleted = await flowUpsert.handler(
      { action: 'delete', flow_id: 55, confirm: true },
      context,
    );
    assert.equal(flowDeleted.isError, undefined);
    assert.equal((flowDeleted.structuredContent as Record<string, unknown>).deleted, true);
    assert.ok(calls.length > 0);
  });
});
