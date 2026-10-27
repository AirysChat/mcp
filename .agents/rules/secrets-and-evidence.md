---
trigger: always_on
description: Secrets, tenant data and evidence handling for all work in this repository.
---

# Secrets and evidence

- Never write an API token, Meta token, OAuth secret, npm token or customer identifier (phone,
  e-mail, name, conversation text) to a file, commit, spec, issue, PR, log line or chat reply.
- Credentials come from the environment (`AIRYSCHAT_API_KEY`, …) or GitHub Actions secrets. The
  hosted service reads them from Secret Manager; Terraform creates containers, never versions.
- Live verification targets `https://staging.airys.app`, account **6** ("Airys Demo", fictitious
  data). Any other instance — `airys.chat`, customer hosts — needs the owner to name it in the
  conversation, and stays GET-only unless the owner approves a specific write.
- Evidence in `specs/*/verification.md` is **sanitized**: command, date, target host, HTTP status,
  counts and field names. Redact IDs that identify a real customer. Raw captures go to
  `evidence-raw/` (git-ignored) and are deleted after the task.
- `wa_campaign_test_send` and `wa_campaign_launch` are never part of automated verification.
- If a secret is exposed, stop, tell the owner, and treat rotation as the first task.
