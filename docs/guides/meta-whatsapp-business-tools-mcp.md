# Using `@airyschat/mcp` with Meta's WhatsApp Business Tools MCP (`GA-09`)

Meta ships an official MCP server for the WhatsApp Business Platform (**WhatsApp Business Tools MCP**) focused on Graph API documentation, webhook payload schemas, error-code diagnostics, and direct Cloud API onboarding helpers.

`@airyschat/mcp` and Meta's WhatsApp Business Tools MCP are **complementary** and designed to run side-by-side in the same agent session.

## Responsibility Matrix

| Capability | `@airyschat/mcp` | Meta WhatsApp Business Tools MCP |
|---|---|---|
| Live customer conversations, messages, assignments, labels, private notes | **Primary** (`core` toolset) | Not in scope |
| Native CRM pipelines, deals, won/lost CAPI triggers, activities, companies | **Primary** (`crm` toolset) | Not in scope |
| AirysChat AI Agents, Knowledge Base RAG, one-responder guard | **Primary** (`ai_agents` toolset) | Not in scope |
| Meta Business Agent (MBA) settings, FAQs, skills, thread control, budget, evals | **Primary** (`meta_agent` toolset) | Not in scope |
| Broadcast campaigns, audience estimate, preflight health check, scheduled messages | **Primary** (`whatsapp` toolset) | Not in scope |
| Template sync, CRUD, quality scores, and rejection explainer on your AirysChat inbox | **Primary** (`wa_templates_*`, `wa_template_rejection_explain`) | Provides official Meta template policy docs & Graph schema reference |
| Cross-instance WABA/number health, token expiry, dead webhook job alerts (`api.airys.chat`) | **Primary** (`platform` toolset) | Not in scope |
| Official Cloud API documentation, Graph error code lookup (`131026`, `131042`, `141010`), raw Graph API reference | Uses `wa_template_rejection_explain` + `platform_alerts_list` | **Primary** (authoritative Meta documentation & Graph schema lookup) |

## Side-by-Side Configuration (`.mcp.json`)

```json
{
  "mcpServers": {
    "airyschat": {
      "command": "npx",
      "args": ["-y", "@airyschat/mcp@latest"],
      "env": {
        "AIRYSCHAT_BASE_URL": "${AIRYSCHAT_BASE_URL}",
        "AIRYSCHAT_API_KEY": "${AIRYSCHAT_API_KEY}",
        "AIRYSCHAT_ACCOUNT_ID": "${AIRYSCHAT_ACCOUNT_ID}",
        "AIRYSCHAT_TOOLSETS": "core,whatsapp,crm,ai_agents,meta_agent,reports,platform",
        "AIRYSCHAT_FEATURES": "beta"
      }
    },
    "meta-whatsapp-tools": {
      "command": "npx",
      "args": ["-y", "whatsapp-business-tools-mcp@latest"]
    }
  }
}
```

## Recommended Joint Workflows

1. **Fixing a Rejected or Paused WhatsApp Template**:
   - Call `wa_template_get` and `wa_template_rejection_explain` in `@airyschat/mcp` to inspect the rejected template components and AirysChat's diagnosis.
   - Query `meta-whatsapp-tools` for Meta's latest category/formatting rules (`MARKETING` vs `UTILITY` guidelines).
   - Call `wa_template_upsert` (`confirm: true`) in `@airyschat/mcp` to submit the corrected template.
2. **Pre-Launch Campaign Verification (`campaign-check` + `number-health-watch`)**:
   - Run `wa_campaign_preflight` (`campaign_preflight_report` MCP App) and `wa_inbox_health` in `@airyschat/mcp`.
   - If Meta returns a Graph restriction or error code (`141010`, `131042`, `131056`), look up the code in `meta-whatsapp-tools` for the exact Business Portfolio or payment remediation steps.
3. **Click-to-WhatsApp (CTWA) & Conversions API Attribution**:
   - Inspect contact ad touches with `platform_signals_attribution_list` (`@airyschat/mcp`) and verify conversion stage mappings with `crm_conversion_settings_get`.
   - Reference `meta-whatsapp-tools` for Business Messaging CAPI payload specifications when onboarding new ad events.
