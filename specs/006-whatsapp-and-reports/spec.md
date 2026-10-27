# 006 — WhatsApp complete & reports

- Release: **0.6.0** · Target 2027-02-01 · Prefix `WAR` · Toolsets `whatsapp`, `reports` (new)

## Why

v0.1 covers template listing, campaign preflight and sends. Operators also manage templates,
scheduled messages, call logs and need reports v2 (agent, inbox, label, CSAT, SLA, conversation
metrics) to close the loop: "did the campaign work?".

## What

- **Templates**: create, edit, delete (Meta writes — irreversible + confirm), sync status,
  rejection reason explainer, quality rating.
- **Scheduled messages**: list, create, cancel (customer-visible → confirm).
- **Calls** (WhatsApp calling): contact call history read.
- **Campaign results**: delivery/read/reply metrics per campaign.
- **Reports v2** (`reports` toolset, read-only): account summary, agents, inboxes, labels, teams,
  CSAT, SLA, conversation traffic heatmap, bot metrics; CSV export link where available.
- Skill: `campaign-retro` (results vs. preflight, next-send suggestions).

## Acceptance

- Template create/delete verified on a staging WABA test template.
- Reports tools return the same numbers as the AirysChat UI for a fixed date range on staging.
