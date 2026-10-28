---
name: number-health-watch
description: Read-only supervision of WhatsApp Business number health, quality rating (GREEN/YELLOW/RED), messaging limits, token expiry, webhook failures, and template pauses/rejections across AirysPlatform and AirysChat instances. Changes nothing.
disable-model-invocation: true
---

# Supervise WhatsApp Number Health (`number-health-watch`)

Read-only. **Never launch a campaign, sync or delete templates, or modify inbox credentials from this skill** — inspect the Airys Platform control plane (`platform` toolset) and the target AirysChat instance (`whatsapp` + `core` toolsets) and produce an actionable health report.

Load the `airyschat` skill first if it is not already active; it carries the trust boundary for untrusted text in inbox names, verified names, template bodies, and webhook failure messages.

Scope / filter: **$ARGUMENTS** (optional `inbox_id`, `phone_number_id`, `tenant_id`, or `critical` filter; if empty, check all WhatsApp numbers on the account and platform).

## Prerequisites

The `core` and `whatsapp` toolsets are enabled by default. For cross-instance control-plane checks (`platform_health`, `platform_numbers_health`, `platform_alerts_list`, `platform_instances_list`), enable `platform`:

```bash
export AIRYSCHAT_TOOLSETS=core,whatsapp,platform
export AIRYSCHAT_FEATURES=experimental
export AIRYS_API_TOKEN="<instance-or-platform-bearer-token>"
```

If `platform` tools are not enabled or return `not_yet_deployed_on_platform`, continue seamlessly with the per-instance steps below (`inboxes_list`, `wa_inbox_health`, `wa_templates_list`, `wa_template_quality`).

## Steps

1. **Platform Control-Plane Liveness & Alerts (when `platform` is enabled)**
   - Call `platform_health` (`GET /health` on `AIRYS_PLATFORM_URL`) and record `status`, `environment`, `commit`, and `revision`.
   - Call `platform_alerts_list` (`status: "open"`) and `platform_numbers_health` if registered and `AIRYS_API_TOKEN` is configured.
   - Group any open control-plane alerts by severity (`critical` first, then `warning`, then `info`):
     - **Token & Auth**: `channel_token_invalid` (Graph 190), `token_expiring` (<14d warning, <3d critical), `channel_ids_stale` (Graph 100).
     - **Messaging & Quality**: `number_banned`, `number_cannot_send` (`BLOCKED` / `LIMITED`), `number_quality_red` (`RED`).
     - **Webhook Routing & Delivery**: `channel_phone_mismatch`, `number_unowned`, `number_claimed_twice`, `webhook_jobs_dying` (>50 dead jobs/h), `dead_set_full`, `callback_dead`, `instance_silent`.

2. **Instance WhatsApp Inboxes & Campaign Health (`inboxes_list`, `wa_inbox_health`)**
   - Call `inboxes_list` and filter for WhatsApp channels (`channel_type === "Channel::Whatsapp"`).
   - For each WhatsApp inbox (or the specific `inbox_id` in `$ARGUMENTS`), call `wa_inbox_health` (`inbox_id`):
     - Record `phone_number`, `quality_rating` (`GREEN`, `YELLOW`, `RED`, `UNKNOWN`), `messaging_limit_tier`, `account_mode` / `status`, `can_send_message`, and any `reauthorization_required` flag.
     - Flag immediately if `quality_rating` is `RED` or `YELLOW`, if `can_send_message` is `BLOCKED` or `LIMITED`, or if `reauthorization_required` is `true`.

3. **Template Quality & Paused/Rejected Templates (`wa_templates_list`, `wa_template_quality`, `wa_template_rejection_explain`)**
   - Call `wa_templates_list` (filtered by `inbox_id` when scoped).
   - Call `wa_template_quality` (`inbox_id`) if available (`AIRYSCHAT_FEATURES=beta`) to inspect template quality scores and pause counts.
   - For any template with status `PAUSED`, `REJECTED`, or `DISABLED`, call `wa_template_rejection_explain` (`template_id`) to surface the specific Meta rejection reason and remediation steps.

4. **Report**
   - **Platform Status** — `api.airys.chat` health (`status`, `environment`, `revision`) and any open cross-instance alerts.
   - **WhatsApp Numbers Matrix** — table of every WhatsApp inbox (`inbox_id`, `name`, `phone_number`, `quality_rating`, `messaging_limit_tier`, `can_send_message`, `reauthorization_required`).
   - **Template Risk Summary** — counts of `APPROVED`, `PENDING`, `PAUSED`, and `REJECTED` templates, plus detailed diagnostics for any `PAUSED` or `REJECTED` template that could block outbound campaigns.
   - **Recommended Actions** — prioritized checklist (e.g. pause marketing sends on `YELLOW`/`RED` numbers, rotate expiring tokens, fix mismatched display phones, or edit rejected templates) and stop. Run no writes until the user approves.
