---
name: campaign-check
description: Pre-launch safety report for a WhatsApp campaign — template approval, audience reach, preflight risk, and inbox health. Sends nothing.
disable-model-invocation: true
---

# Pre-launch check for a WhatsApp campaign

Read-only. **Never call `wa_campaign_launch` or `wa_campaign_test_send` from this skill**,
even if the check comes back clean — this produces a report, and the decision is the
user's.

Load the `airyschat` skill first if it is not already active.

Campaign: **$ARGUMENTS** (a campaign display ID, or a name to look up with
`wa_campaigns_list`). If empty, ask which campaign.

1. `wa_campaign_get` — record its status, inbox, template name, and
   `lifecycle_permissions`.
2. `wa_templates_list` filtered to that inbox — find the template named in the campaign's
   `message` field. **Report its status.** Anything other than `approved` blocks the send.
3. `wa_inbox_health` for the sending inbox — quality rating and messaging limits.
4. `wa_campaign_preflight` with `campaign_id`. This returns HTTP 200 even when blocked, so
   read `allowed`, `blocking_issues`, `warnings`, `eligible_count`, and `audience_counts`.
5. If the campaign has run before, `wa_campaign_get` already carries
   `latest_preflight_status` and `suppression_counts` — mention them for contrast.

Report:

- **Verdict** — `allowed` from preflight, stated plainly as safe to launch or blocked.
- **Blockers** — every entry in `blocking_issues`, verbatim.
- **Warnings** — every entry in `warnings`.
- **Reach** — `eligible_count` against `audience_counts.total`, and what accounts for the
  gap (suppressed, frequency-capped, invalid recipient, country-restricted).
- **Template** — name, status, category, and whether the category matches the campaign's.
- **Inbox health** — quality rating and any limit that would throttle the send.

End with the exact call the user would run to launch, including `confirm: true`, but do
not run it. If preflight blocked the campaign, say that launching will be refused and do
not offer the call at all.

Note that preflight is re-run at launch and can refuse then even if it passes now, because
template approval and WABA health change over time.
