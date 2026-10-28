# Domain Brief — Airys Platform API (`platform` toolset)

- **Lane**: `009-airys-platform-toolset` (`PLT-01..PLT-06`)
- **Upstream repository**: `AirysBR/airys-platform` (`origin/main` at `631d96c`)
- **Upstream specs**: `AirysBR/Airys-AI` (`origin/main` at `60764db`):
  - `specs/20260930-131823-airys-whatsapp-platform/spec.md` & `tasks.md`
  - `specs/20260930-125720-meta-control-plane/spec.md`, `data-model.md` & `contracts/event-catalog.md`
  - `specs/20261020-meta-signals-platform/phase2-spec.md`
- **Toolset**: `platform` (default **off**; opt in via `AIRYSCHAT_TOOLSETS=...,platform` or scope `mcp:toolset:platform`)

## 1. Environments & Neutrality Contract

| Environment | Base URL (`AIRYS_PLATFORM_URL`) | Cloud Run Service | GCP Project |
|---|---|---|---|
| Production (default) | `https://api.airys.chat` | `https://api-ifoqleby5a-rj.a.run.app` (behind global external ALB + Cloud Armor) | `airys-platform-prod` |
| Staging | `https://api-tdtyqbghua-rj.a.run.app` | `https://api-tdtyqbghua-rj.a.run.app` | `airys-platform-staging` |

### Platform Neutrality & Credentials (`PLT-02`)
1. **Separate credential (`AIRYS_API_TOKEN`)**:
   - The Airys Platform API authenticates requests with `Authorization: Bearer <AIRYS_API_TOKEN>` (an instance key `airys_inst_<tenant_id>_...` today, and a project API key once `PLAT-6.1` lands).
   - `AIRYSCHAT_API_KEY` is **never** sent to `api.airys.chat`, and `AIRYS_API_TOKEN` is **never** sent to the AirysChat host.
   - `GET /health` is public and requires no token. All `/v1/*` endpoints require `Authorization: Bearer <AIRYS_API_TOKEN>` and fail fast in the MCP server if `AIRYS_API_TOKEN` is unset.
2. **Same 401 on auth failure**:
   - `airys-platform` returns the identical `401 {"detail": "invalid instance key"}` for a missing/wrong key, an unknown tenant, or a key issued for a different environment (`staging` vs `prod`), preventing tenant enumeration.

---

## 2. Live OpenAPI 3.1 Endpoints (`openapi/openapi.json` at `631d96c`)

| Method & Path | Auth | Router | Summary | MCP Tool | Stability |
|---|---|---|---|---|---|
| `GET /health` | None | `routers/health.py` | Service liveness, version, environment (`staging`\|`prod`), git commit, Cloud Run revision | `platform_health` | `stable` |
| `GET /v1/signals/attribution` | `Bearer` | `routers/signals.py` (`SIG-3`) | List ad touches (CTWA, Click-to-Messenger, Click-to-Instagram) attributed to `contact_key` (`wa_id`, `psid`, `igsid`), optional `channel` (`whatsapp`\|`messenger`\|`instagram`), ordered newest first (limit 100) | `platform_signals_attribution_list` | `beta` |
| `POST /v1/signals/outcomes` | `Bearer` | `routers/signals.py` (`SIG-3`) | Record an idempotent Business Messaging conversion outcome (`Purchase`, `LeadSubmitted`, `InitiateCheckout`, `AddToCart`, `ViewContent`, `OrderCreated`, `OrderShipped`, `OrderDelivered`, `OrderCanceled`, `OrderReturned`, `CartAbandoned`, `QualifiedLead`, `RatingProvided`, `ReviewProvided`). Returns `202` on first write and `200` on duplicate `(tenant_id, source, event_id)` | `platform_signals_outcome_record` | `beta` |
| `PUT /v1/instances/{tenant_id}/inventory` | `Bearer` | `routers/instances.py` (`PLAT-3.5`) | Replace an instance's WhatsApp channel inventory and webhook failure counts. Internal daemon endpoint pushed by AirysChat instances (`extra="forbid"`, never accepts tokens or message bodies) | *(instance daemon only — not exposed as an agent tool)* | — |

### Schema Details for Live Endpoints

#### `GET /health`
- Response (`200 OK`):
  ```json
  {
    "status": "ok",
    "service": "airys-platform",
    "version": "0.1.0",
    "environment": "staging",
    "commit": "06ae993a114ad4271d48be464f641a814f40d1a8",
    "revision": "api-00022-wrv"
  }
  ```

#### `GET /v1/signals/attribution`
- Query parameters:
  - `contact_key` (required, string `1..128`): `wa_id` (digits/E.164), Messenger `psid`, or Instagram `igsid`.
  - `channel` (optional, `'whatsapp' | 'messenger' | 'instagram'`).
- Response (`200 OK`):
  - `touches[]`: `{ touch_id, channel, click_id, ad_id, source_type, source_url, headline, asset_id, contact_key, occurred_at, referral }`
- **Prompt-injection surface**: `headline`, `source_url`, and `referral` originate from external ad metadata / webhook payloads and MUST be wrapped with `untrustedJson`.

#### `POST /v1/signals/outcomes`
- Body (`OutcomeCreate`, `extra="forbid"`):
  - `event_id` (required, string `1..255`): caller's idempotency key.
  - `source` (`'crm' | 'api'`, default `'crm'`).
  - `event_name` (required, one of the 14 Business Messaging events).
  - `event_time` (required, ISO-8601 datetime).
  - `channel` (optional, `'whatsapp' | 'messenger' | 'instagram'`).
  - `click` (optional, `{ ctwa_clid, ad_id, ref, page_id, psid, ig_id, igsid, waba_id, wa_id }`).
  - `value` (optional, decimal number/string; requires `currency` when present).
  - `currency` (optional, 3-letter uppercase ISO-4217 code `^[A-Z]{3}$`, e.g. `BRL`, `USD`).
  - `deal` (optional, `{ id, stage, status, ... }` object).
- Response (`202 Accepted` or `200 OK` on duplicate):
  - `{ outcome_id, event_id, event_name, status, touch_id, channel, click_id }`.

---

## 3. Control-Plane Management API Contract (`PLAT-8.1..PLAT-8.5`, Milestone M2)

The database tables (`meta.phone_numbers`, `meta.wabas`, `meta.tenants`, `meta.instance_channels`, `meta.instance_webhook_failures`, `meta.alerts`, `meta.app_tokens`, `meta.callback_probes`) and the 13 alert rules in `src/airys_platform/alerts/rules.py` are already live in `AirysBR/airys-platform`. Their HTTP read routers (`PLAT-8.1..PLAT-8.5`) are tracked in `AirysBR/Airys-AI` milestone M2:

| MCP Tool | Task | Target HTTP Route | Upstream Backing Model / Rule Set | Stability |
|---|---|---|---|---|
| `platform_numbers_health` | `PLT-03` | `GET /v1/numbers` | `meta.phone_numbers` + `meta.instance_channels` + `meta.wabas` (`phone_number_id`, `display_phone_number`, `verified_name`, `waba_id`, `status`, `quality_rating`, `messaging_limit`, `health_can_send`, `health_errors`, `health_additional_info`, `channels`, `last_polled_at`) | `experimental` (`BLOCKED_EXTERNAL` on `PLAT-8.1`) |
| `platform_alerts_list` | `PLT-03` | `GET /v1/alerts` | `meta.alerts` across the 13 rules (`instance_silent`, `channel_token_invalid`, `channel_ids_stale`, `channel_phone_mismatch`, `number_banned`, `number_cannot_send`, `number_quality_red`, `number_unowned`, `number_claimed_twice`, `token_expiring`, `webhook_jobs_dying`, `dead_set_full`, `callback_dead`) | `experimental` (`BLOCKED_EXTERNAL` on `PLAT-8.1`) |
| `platform_instances_list` | `PLT-04` | `GET /v1/instances` | `meta.tenants` + `meta.instance_channels` + `meta.instance_webhook_failures` (`tenant_id`, `environment`, `base_url`, `active`, `last_inventory_at`, `channels_count`, `webhook_failures`) | `experimental` (`BLOCKED_EXTERNAL` on `PLAT-8.1`) |
| `platform_usage` | `PLT-04` | `GET /v1/usage` | Metered message volume and Meta cost per number and category (`PLAT-8.5` / `PLAT-11.1`) | `experimental` (`BLOCKED_EXTERNAL` on `PLAT-8.5`) |

When an `experimental` management tool is called before the corresponding `airys-platform` router is deployed (`404 Not Found`), the tool handler surfaces a clear diagnostic explaining that the endpoint awaits `airys-platform` milestone M2 (`PLAT-8.1` / `PLAT-8.5`) and pointing the caller to per-instance fallback tools (`wa_health`, `wa_templates_list`, `inboxes_list`).
