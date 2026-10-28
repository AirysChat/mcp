# `@airyschat/mcp` Tool Reference

> Generated from `packages/server/src/tools/*.ts` via `pnpm docs:tools`. Do not edit by hand.

Total curated & catalog tools: **212** (**80** `stable`, **113** `beta`, **19** `experimental`).

## Summary by Toolset

| Toolset | Default | Total | `stable` | `beta` | `experimental` |
|---|---|---:|---:|---:|---:|
| `always-on` | on | 2 | 2 | 0 | 0 |
| `core` | on | 24 | 15 | 9 | 0 |
| `whatsapp` | on | 32 | 16 | 16 | 0 |
| `crm` | off | 42 | 13 | 15 | 14 |
| `ai_agents` | off | 24 | 2 | 22 | 0 |
| `meta_agent` | off | 20 | 0 | 19 | 1 |
| `reports` | off | 9 | 9 | 0 | 0 |
| `admin` | off | 41 | 11 | 30 | 0 |
| `help_center` | off | 11 | 11 | 0 | 0 |
| `platform` | off | 7 | 1 | 2 | 4 |

## Always-on (`catalog` + `raw`)

| Tool | Stability | Access Scope | Idempotent | MCP App | Summary |
|---|---|---|---|---|---|
| `airyschat_api_search` | `stable` | `mcp:read` | yes | — | Search the AirysChat API catalog |
| `airyschat_api` | `stable` | `mcp:write` | — | — | Call an AirysChat API endpoint directly |

## `core` — Conversations, Messages, Contacts, Inboxes, Teams, Labels, Search

| Tool | Stability | Access Scope | Idempotent | MCP App | Summary |
|---|---|---|---|---|---|
| `conversations_list` | `stable` | `mcp:read` | — | — | List conversations |
| `conversation_get` | `stable` | `mcp:read` | — | `ui://airyschat/conversation-view.html` | Get a conversation |
| `conversation_messages` | `stable` | `mcp:read` | — | `ui://airyschat/conversation-view.html` | List messages in a conversation |
| `conversation_view` | `stable` | `mcp:read` | — | `ui://airyschat/conversation-view.html` | Load the interactive conversation view (MCP App) |
| `conversation_reply` | `beta` | `mcp:irreversible` | — | — | Reply to a conversation |
| `conversation_update` | `beta` | `mcp:write` | — | — | Update conversation status, priority, assignment, or labels |
| `conversation_labels_add` | `beta` | `mcp:write` | yes | — | Add labels to a conversation without replacing existing labels |
| `contacts_search` | `stable` | `mcp:read` | — | — | Search contacts |
| `contact_get` | `stable` | `mcp:read` | — | — | Get a contact |
| `contact_conversations` | `stable` | `mcp:read` | — | — | List a contact’s conversations |
| `contact_create` | `beta` | `mcp:write` | — | — | Create a contact |
| `contact_update` | `beta` | `mcp:write` | — | — | Update a contact |
| `contact_delete` | `beta` | `mcp:irreversible` | — | — | Delete a contact |
| `contact_labels_set` | `beta` | `mcp:write` | yes | — | Set labels on a contact |
| `contacts_merge` | `beta` | `mcp:irreversible` | — | — | Merge two contacts |
| `inboxes_list` | `stable` | `mcp:read` | — | — | List inboxes |
| `agents_list` | `stable` | `mcp:read` | — | — | List agents |
| `labels_list` | `stable` | `mcp:read` | — | — | List labels |
| `teams_list` | `stable` | `mcp:read` | — | — | List teams |
| `me` | `stable` | `mcp:read` | — | — | Show the authenticated user |
| `canned_responses_list` | `stable` | `mcp:read` | — | — | List canned responses |
| `search` | `stable` | `mcp:read` | — | — | Global search across conversations, contacts, messages, and articles |
| `notifications_list` | `beta` | `mcp:read` | — | — | List notifications or unread count for the authenticated user |
| `custom_filters_list` | `stable` | `mcp:read` | — | — | List or get saved custom filters |

## `whatsapp` — Templates, Campaigns, Scheduled Messages, Flows, Calls

| Tool | Stability | Access Scope | Idempotent | MCP App | Summary |
|---|---|---|---|---|---|
| `wa_templates_list` | `stable` | `mcp:read` | — | — | List WhatsApp message templates |
| `wa_template_get` | `stable` | `mcp:read` | — | — | Get a WhatsApp message template |
| `wa_template_analytics` | `stable` | `mcp:read` | — | — | Get template analytics |
| `wa_templates_sync` | `beta` | `mcp:write` | yes | — | Sync templates from Meta |
| `wa_template_upsert` | `beta` | `mcp:irreversible` | — | — | Create, update, appeal, or duplicate a WhatsApp template |
| `wa_template_delete` | `beta` | `mcp:irreversible` | — | — | Delete a WhatsApp message template |
| `wa_template_rejection_explain` | `stable` | `mcp:read` | — | — | Explain a WhatsApp template rejection and suggest fixes |
| `wa_scheduled_messages_list` | `stable` | `mcp:read` | — | — | List scheduled WhatsApp messages for a conversation |
| `wa_scheduled_message_upsert` | `beta` | `mcp:irreversible` | — | — | Schedule or reschedule a WhatsApp message |
| `wa_scheduled_message_cancel` | `beta` | `mcp:irreversible` | — | — | Cancel a scheduled WhatsApp message |
| `wa_contact_calls_list` | `stable` | `mcp:read` | — | — | List WhatsApp & voice call history or get a call |
| `wa_call_transcribe` | `beta` | `mcp:write` | yes | — | Transcribe a recorded call or voicemail |
| `wa_campaigns_list` | `stable` | `mcp:read` | — | — | List campaigns |
| `wa_campaign_get` | `stable` | `mcp:read` | — | — | Get a campaign |
| `wa_campaign_metrics` | `stable` | `mcp:read` | — | — | Get campaign delivery metrics |
| `wa_campaign_results` | `stable` | `mcp:read` | — | — | Get campaign results, Marketing Messages metrics, suppressions, or A/B test results |
| `wa_campaign_intelligence` | `stable` | `mcp:read` | — | — | Get WhatsApp campaign intelligence, inbox summaries, or optimal send time |
| `wa_campaign_send_plan` | `beta` | `mcp:irreversible` | — | — | Plan multi-wave sends, qualified audiences, A/B tests, or campaign copy |
| `wa_audience_estimate` | `stable` | `mcp:read` | — | — | Estimate a campaign audience |
| `wa_campaign_preflight` | `stable` | `mcp:read` | — | `ui://airyschat/campaign-preflight-report.html` | Run a campaign preflight risk check |
| `campaign_preflight_report` | `stable` | `mcp:read` | — | `ui://airyschat/campaign-preflight-report.html` | Generate an interactive WhatsApp campaign preflight report (MCP App) |
| `wa_campaign_create` | `beta` | `mcp:write` | — | — | Create a campaign |
| `wa_campaign_update` | `beta` | `mcp:irreversible` | — | — | Update a draft or scheduled campaign |
| `wa_campaign_delete` | `beta` | `mcp:irreversible` | — | — | Delete a campaign |
| `wa_campaign_launch` | `beta` | `mcp:irreversible` | — | — | Launch a campaign |
| `wa_campaign_cancel` | `beta` | `mcp:write` | — | — | Cancel a scheduled campaign |
| `wa_campaign_test_send` | `beta` | `mcp:irreversible` | — | — | Send a campaign to one contact as a test |
| `wa_inbox_health` | `stable` | `mcp:read` | — | — | Check WhatsApp campaign health for an inbox |
| `wa_contact_preferences` | `beta` | `mcp:read` | — | — | List or inspect WhatsApp contact opt-in/opt-out preferences |
| `wa_contact_preference_update` | `beta` | `mcp:irreversible` | — | — | Update WhatsApp contact opt-in/opt-out status or review consent events |
| `wa_flows_list` | `stable` | `mcp:read` | — | — | List or inspect WhatsApp Flows |
| `wa_flow_upsert` | `beta` | `mcp:irreversible` | — | — | Create, update, publish, deprecate, sync, or delete a WhatsApp Flow |

## `crm` — Pipelines, Deals, Notes, Activities, Companies, Conversion Settings

| Tool | Stability | Access Scope | Idempotent | MCP App | Summary |
|---|---|---|---|---|---|
| `crm_pipelines_list` | `stable` | `mcp:read` | — | — | List CRM sales pipelines |
| `crm_pipeline_get` | `stable` | `mcp:read` | — | — | Get a CRM pipeline and its stages |
| `crm_deals_search` | `stable` | `mcp:read` | — | `ui://airyschat/crm-board.html` | List or search CRM deals |
| `crm_board` | `stable` | `mcp:read` | — | `ui://airyschat/crm-board.html` | Load the interactive CRM pipeline board (MCP App) |
| `crm_deal_get` | `stable` | `mcp:read` | — | — | Get a CRM deal |
| `crm_deal_timeline` | `stable` | `mcp:read` | — | — | Get a CRM deal timeline |
| `crm_deal_create` | `beta` | `mcp:write` | — | — | Create a CRM deal |
| `crm_deal_update` | `beta` | `mcp:write` | — | — | Update a CRM deal |
| `crm_deal_move` | `beta` | `mcp:write` | — | `ui://airyschat/crm-board.html` | Move a CRM deal to another open stage |
| `crm_deal_close` | `beta` | `mcp:irreversible` | — | — | Close a CRM deal as won or lost |
| `crm_deal_delete` | `beta` | `mcp:irreversible` | — | — | Delete a CRM deal |
| `crm_deals_bulk_update` | `beta` | `mcp:irreversible` | — | — | Bulk update CRM deals |
| `crm_deal_notes_list` | `stable` | `mcp:read` | — | — | List notes on a CRM deal |
| `crm_deal_note_create` | `beta` | `mcp:write` | — | — | Add a note to a CRM deal |
| `crm_deal_note_update` | `beta` | `mcp:write` | — | — | Update a note on a CRM deal |
| `crm_deal_note_delete` | `beta` | `mcp:irreversible` | — | — | Delete a note on a CRM deal |
| `crm_activities_list` | `stable` | `mcp:read` | — | — | List or get CRM activities |
| `crm_activity_create` | `beta` | `mcp:write` | — | — | Schedule a CRM activity |
| `crm_activity_update` | `beta` | `mcp:write` | — | — | Update a CRM activity |
| `crm_activity_complete` | `beta` | `mcp:write` | yes | — | Mark a CRM activity completed |
| `crm_activity_postpone` | `beta` | `mcp:write` | — | — | Postpone a CRM activity |
| `crm_activity_delete` | `beta` | `mcp:irreversible` | — | — | Delete a CRM activity |
| `conversation_deal_get` | `stable` | `mcp:read` | — | — | Get the CRM deal linked to a conversation |
| `conversation_deal_update` | `beta` | `mcp:write` | — | — | Update or create the CRM deal for a conversation |
| `crm_insights` | `stable` | `mcp:read` | — | — | Get CRM dashboard and origin results insights |
| `crm_close_reasons_list` | `stable` | `mcp:read` | — | — | List CRM closure reasons |
| `crm_loss_reasons_list` | `stable` | `mcp:read` | — | — | List CRM loss reasons with 90-day usage breakdown |
| `crm_views_list` | `stable` | `mcp:read` | — | — | List CRM saved views |
| `crm_pipeline_upsert` | `experimental` | `mcp:write` | — | — | Create or update a CRM pipeline |
| `crm_stage_upsert` | `experimental` | `mcp:write` | — | — | Create, update, or reorder CRM pipeline stages |
| `crm_close_reason_upsert` | `experimental` | `mcp:write` | — | — | Create or update a CRM closure reason |
| `crm_view_upsert` | `experimental` | `mcp:write` | — | — | Create or update a CRM saved view |
| `crm_settings_get` | `experimental` | `mcp:read` | — | — | Get CRM pipeline settings |
| `crm_settings_update` | `experimental` | `mcp:write` | — | — | Update CRM pipeline settings |
| `crm_business_hours_get` | `experimental` | `mcp:read` | — | — | Get CRM business hours schedule |
| `crm_business_hours_update` | `experimental` | `mcp:write` | — | — | Update CRM business hours schedule |
| `crm_follow_up_rules_list` | `experimental` | `mcp:read` | — | — | List CRM automatic follow-up rules |
| `crm_follow_up_rule_upsert` | `experimental` | `mcp:write` | — | — | Create or update a CRM automatic follow-up rule |
| `crm_automations_list` | `experimental` | `mcp:read` | — | — | List CRM stage automations |
| `crm_automation_upsert` | `experimental` | `mcp:write` | — | — | Create or update a CRM stage automation |
| `crm_conversion_settings_get` | `experimental` | `mcp:read` | — | — | Get WhatsApp Conversions API (CAPI) settings for a pipeline |
| `crm_conversion_settings_update` | `experimental` | `mcp:irreversible` | — | — | Update WhatsApp Conversions API (CAPI) stage mappings |

## `ai_agents` — AirysChat AI Agents, Knowledge Base, Workflow Runs, Responder Guard

| Tool | Stability | Access Scope | Idempotent | MCP App | Summary |
|---|---|---|---|---|---|
| `ai_agents_list` | `beta` | `mcp:read` | — | — | List AI Agents |
| `ai_agent_get` | `beta` | `mcp:read` | — | — | Get AI Agent |
| `ai_agent_analytics` | `beta` | `mcp:read` | — | — | Get AI Agent Analytics |
| `ai_agent_versions_list` | `beta` | `mcp:read` | — | — | List AI Agent Versions |
| `ai_agents_monitor` | `beta` | `mcp:read` | — | — | Monitor AI Agent Conversations |
| `ai_agents_ownership_overview` | `beta` | `mcp:read` | — | — | Get Inbox AI Responder Ownership Overview |
| `ai_workflow_runs_list` | `beta` | `mcp:read` | — | — | List or Get AI Agent Workflow Runs |
| `ai_knowledge_bases_list` | `beta` | `mcp:read` | — | — | List or Get AI Agent Knowledge Bases |
| `ai_knowledge_search` | `beta` | `mcp:read` | — | — | Search AI Agent Knowledge Base (RAG) |
| `ai_knowledge_documents_list` | `beta` | `mcp:read` | — | — | List Knowledge Base Documents |
| `ai_agent_tools_list` | `beta` | `mcp:read` | — | — | List AI Agent Tools |
| `conversation_ai_usage` | `stable` | `mcp:read` | — | — | Get Conversation AI Token & Cost Usage |
| `llm_models_list` | `stable` | `mcp:read` | — | — | List Available LLM Models & Health |
| `ai_agent_upsert` | `beta` | `mcp:write` | — | — | Create, Update, or Clone AI Agent |
| `ai_agent_delete` | `beta` | `mcp:irreversible` | — | — | Delete AI Agent |
| `ai_agent_preview` | `beta` | `mcp:write` | — | — | Preview AI Agent Chat or Voice Reply |
| `ai_agent_publish` | `beta` | `mcp:irreversible` | — | — | Snapshot, Publish, or Discard AI Agent Workflow |
| `ai_agent_version_restore` | `beta` | `mcp:irreversible` | — | — | Restore AI Agent Version |
| `ai_mode_transition` | `beta` | `mcp:irreversible` | — | — | Preview or Transition Inbox AI Responder Mode |
| `ai_agent_inbox_upsert` | `beta` | `mcp:irreversible` | — | — | Attach, Update, or Detach AI Agent Inbox Link |
| `ai_knowledge_base_upsert` | `beta` | `mcp:irreversible` | — | — | Create, Update, or Delete AI Knowledge Base |
| `ai_knowledge_document_create` | `beta` | `mcp:write` | — | — | Create Knowledge Base Document |
| `ai_knowledge_document_delete` | `beta` | `mcp:irreversible` | — | — | Delete Knowledge Base Document |
| `ai_agent_tool_upsert` | `beta` | `mcp:irreversible` | — | — | Create, Update, Delete, or Import AI Agent Tools |

## `meta_agent` — Meta Business Agent (MBA) Settings, FAQs, Skills, Thread Control, Evals

| Tool | Stability | Access Scope | Idempotent | MCP App | Summary |
|---|---|---|---|---|---|
| `mba_inboxes_list` | `beta` | `mcp:read` | — | — | List Meta Business Agent Inboxes & Agent Status |
| `mba_workspace_get` | `beta` | `mcp:read` | — | — | Get Meta Business Agent Workspace & Panels |
| `mba_settings_get` | `beta` | `mcp:read` | — | — | Get Meta Business Agent Settings |
| `mba_business_info_get` | `beta` | `mcp:read` | — | — | Get Meta Business Agent Business Info |
| `mba_resources_list` | `beta` | `mcp:read` | — | — | List or Get Meta Business Agent Resources (FAQs, Skills, Allowlist, Websites, Files, Connectors) |
| `mba_thread_control_get` | `beta` | `mcp:read` | — | — | Get Conversation Meta Business Agent Thread Control State |
| `mba_handoff_get` | `beta` | `mcp:read` | — | — | Get Meta Business Agent Human Handoff Rotation |
| `mba_budget_get` | `beta` | `mcp:read` | — | — | Get Meta Business Agent WABA Budgets |
| `mba_preflight` | `beta` | `mcp:write` | — | — | Run Meta Business Agent Preflight or Eligibility Check |
| `mba_onboarding` | `beta` | `mcp:irreversible` | — | — | Bootstrap, Attest Terms, Onboard, Select Agent, or Reconcile Meta Business Agent |
| `mba_settings_update` | `beta` | `mcp:irreversible` | — | — | Update Meta Business Agent Settings |
| `mba_business_info_update` | `beta` | `mcp:irreversible` | — | — | Update or Reset Meta Business Agent Business Info |
| `mba_resource_upsert` | `beta` | `mcp:irreversible` | — | — | Create or Update Meta Business Agent Resource (FAQ, Skill, Allowlist, Website, File, Connector) |
| `mba_resource_delete` | `beta` | `mcp:irreversible` | — | — | Delete Meta Business Agent Resource |
| `mba_connectors` | `beta` | `mcp:irreversible` | — | — | Manage Meta Business Agent Connector Tools, Logs & Credentials |
| `mba_release` | `beta` | `mcp:irreversible` | — | — | Check Release Readiness or Execute Meta Business Agent Release Action |
| `mba_thread_control_release` | `beta` | `mcp:irreversible` | — | — | Release Conversation Thread Control Back to Meta Business Agent |
| `mba_handoff_update` | `beta` | `mcp:irreversible` | — | — | Update Meta Business Agent Human Handoff Rotation |
| `mba_budget_update` | `beta` | `mcp:irreversible` | — | — | Update Meta Business Agent WABA Budgets |
| `mba_evals` | `experimental` | `mcp:irreversible` | — | — | Run or Inspect Meta Business Agent Tests, Evals & Agent Events |

## `reports` — Analytics v2, Summary Reports, Live Metrics, CSAT, SLA, Bot Metrics

| Tool | Stability | Access Scope | Idempotent | MCP App | Summary |
|---|---|---|---|---|---|
| `reports_summary` | `stable` | `mcp:read` | — | — | Get account or dimension report summary, bot metrics, or year in review |
| `reports_timeseries` | `stable` | `mcp:read` | — | — | Get report metric timeseries or hourly traffic heatmap data |
| `reports_by_dimension` | `stable` | `mcp:read` | — | — | Get summary reports broken down by agent, team, inbox, label, or channel |
| `reports_live_metrics` | `stable` | `mcp:read` | — | — | Get real-time open/unattended conversation metrics |
| `reports_inbox_label_matrix` | `stable` | `mcp:read` | — | — | Get conversation counts across the inbox × label matrix |
| `reports_distribution` | `stable` | `mcp:read` | — | — | Get first response time distribution by channel |
| `reports_drilldown` | `stable` | `mcp:read` | — | — | Drill down into conversations inside a report timeseries bucket |
| `csat_responses` | `stable` | `mcp:read` | — | — | Get CSAT survey metrics or list individual customer responses |
| `reports_csv_export` | `stable` | `mcp:read` | — | — | Download CSV exports for agent, inbox, label, team, traffic heatmap, or CSAT reports |

## `admin` — Inboxes, Agents, Teams, Automations, Macros, Webhooks, Integrations, Attributes, SLA

| Tool | Stability | Access Scope | Idempotent | MCP App | Summary |
|---|---|---|---|---|---|
| `inbox_get` | `stable` | `mcp:read` | — | — | Get an inbox with members, assignable agents, and agent bot |
| `inbox_upsert` | `beta` | `mcp:write` | — | — | Create or update an inbox or set its agent bot |
| `inbox_delete` | `beta` | `mcp:irreversible` | — | — | Delete an inbox |
| `inbox_members_sync` | `beta` | `mcp:irreversible` | — | — | Add, replace, or remove inbox members |
| `agent_invite` | `beta` | `mcp:irreversible` | — | — | Invite one or more agents to the account |
| `agent_update` | `beta` | `mcp:write` | — | — | Update an agent name, role, or availability |
| `agent_delete` | `beta` | `mcp:irreversible` | — | — | Remove an agent from the account |
| `team_get` | `stable` | `mcp:read` | — | — | Get a team and its members |
| `team_upsert` | `beta` | `mcp:write` | — | — | Create or update a team |
| `team_delete` | `beta` | `mcp:irreversible` | — | — | Delete a team |
| `team_members_sync` | `beta` | `mcp:irreversible` | — | — | Add, replace, or remove team members |
| `automation_rules_list` | `stable` | `mcp:read` | — | — | List or get automation rules |
| `automation_rule_upsert` | `beta` | `mcp:write` | — | — | Create, update, or clone an automation rule |
| `automation_rule_delete` | `beta` | `mcp:irreversible` | — | — | Delete an automation rule |
| `macros_list` | `stable` | `mcp:read` | — | — | List or get macros |
| `macro_upsert` | `beta` | `mcp:write` | — | — | Create or update a macro |
| `macro_execute` | `beta` | `mcp:irreversible` | — | — | Execute a macro on conversations |
| `macro_delete` | `beta` | `mcp:irreversible` | — | — | Delete a macro |
| `webhooks_list` | `stable` | `mcp:read` | — | — | List account webhooks |
| `webhook_upsert` | `beta` | `mcp:write` | — | — | Create or update an outgoing webhook (with SSRF validation) |
| `webhook_delete` | `beta` | `mcp:irreversible` | — | — | Delete an outgoing webhook |
| `integrations_list` | `stable` | `mcp:read` | — | — | List integration apps or get an integration app/hook |
| `integration_hook_upsert` | `beta` | `mcp:write` | — | — | Create or update an integration hook (with SSRF URL validation) |
| `integration_hook_delete` | `beta` | `mcp:irreversible` | — | — | Delete an integration hook |
| `custom_attributes_list` | `stable` | `mcp:read` | — | — | List or get custom attribute definitions |
| `custom_attribute_upsert` | `beta` | `mcp:write` | — | — | Create or update a custom attribute definition |
| `custom_attribute_delete` | `beta` | `mcp:irreversible` | — | — | Delete a custom attribute definition |
| `sla_policies_list` | `beta` | `mcp:read` | — | — | List SLA policies or applied SLA reports |
| `sla_policy_upsert` | `beta` | `mcp:write` | — | — | Create or update an SLA policy |
| `sla_policy_delete` | `beta` | `mcp:irreversible` | — | — | Delete an SLA policy |
| `assignment_policies_list` | `stable` | `mcp:read` | — | — | List or get assignment policies |
| `assignment_policy_upsert` | `beta` | `mcp:irreversible` | — | — | Create, update, link, unlink, or delete an assignment policy |
| `label_upsert` | `stable` | `mcp:write` | — | — | Create, update, or get an account label |
| `label_delete` | `stable` | `mcp:irreversible` | — | — | Delete an account label |
| `canned_response_upsert` | `beta` | `mcp:write` | — | — | Create or update a canned response |
| `canned_response_delete` | `beta` | `mcp:irreversible` | — | — | Delete a canned response |
| `custom_filter_upsert` | `beta` | `mcp:write` | — | — | Create or update a saved custom filter |
| `custom_filter_delete` | `beta` | `mcp:irreversible` | — | — | Delete a saved custom filter |
| `account_settings_get` | `stable` | `mcp:read` | — | — | Get account settings, notification settings, and branded email layout |
| `account_settings_update` | `beta` | `mcp:write` | — | — | Update account settings, notification settings, or branded email layout |
| `audit_logs_list` | `beta` | `mcp:read` | — | — | List account audit logs |

## `help_center` — Portals, Categories, Articles CRUD & Publish

| Tool | Stability | Access Scope | Idempotent | MCP App | Summary |
|---|---|---|---|---|---|
| `portals_list` | `stable` | `mcp:read` | — | — | List help center portals |
| `portal_get` | `stable` | `mcp:read` | — | — | Get a help center portal by slug |
| `portal_upsert` | `stable` | `mcp:irreversible` | — | — | Create, update, archive, or delete a help center portal |
| `categories_list` | `stable` | `mcp:read` | — | — | List or get help center categories |
| `category_upsert` | `stable` | `mcp:write` | — | — | Create, update, or reorder help center categories |
| `category_delete` | `stable` | `mcp:irreversible` | — | — | Delete a help center category |
| `articles_list` | `stable` | `mcp:read` | — | — | List or search help center articles |
| `article_get` | `stable` | `mcp:read` | — | — | Get a help center article |
| `article_upsert` | `stable` | `mcp:write` | — | — | Create, update, reorder, recategorize, or translate help center articles |
| `article_publish` | `stable` | `mcp:irreversible` | — | — | Publish, unpublish, or archive help center article(s) |
| `article_delete` | `stable` | `mcp:irreversible` | — | — | Delete one or more help center articles |

## `platform` — Airys Platform API (`api.airys.chat`): Health, Ad Signals, Control Plane

| Tool | Stability | Access Scope | Idempotent | MCP App | Summary |
|---|---|---|---|---|---|
| `platform_health` | `stable` | `mcp:read` | — | — | Get Airys Platform API health and revision |
| `platform_signals_attribution_list` | `beta` | `mcp:read` | — | — | List ad touches attributed to a contact on Airys Platform |
| `platform_signals_outcome_record` | `beta` | `mcp:write` | yes | — | Record a Business Messaging conversion outcome on Airys Platform |
| `platform_numbers_health` | `experimental` | `mcp:read` | — | — | List cross-instance WhatsApp number health on Airys Platform |
| `platform_alerts_list` | `experimental` | `mcp:read` | — | — | List control-plane alerts on Airys Platform |
| `platform_instances_list` | `experimental` | `mcp:read` | — | — | List registered AirysChat instances on Airys Platform |
| `platform_usage` | `experimental` | `mcp:read` | — | — | Get cross-instance WhatsApp usage and cost on Airys Platform |
