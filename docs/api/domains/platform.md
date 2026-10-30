# Domain Brief — Airys Platform API (`platform` toolset)

- **Lane**: `009-airys-platform-toolset` (`PLT-01..PLT-06`)
- **Upstream repository**: `AirysBR/airys-platform` (`origin/main` at `a292f20`, PR `#29`)
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

## 2. Live OpenAPI 3.1 Endpoints (`openapi/openapi.json` at `a292f20`)

| Method & Path | Auth | Router | Summary | MCP Tool | Stability |
|---|---|---|---|---|---|
| `GET /health` | None | `routers/health.py` | Service liveness, version, environment (`staging`\|`prod`), git commit, Cloud Run revision | `platform_health` | `stable` |
| `GET /v1/instances` | `Bearer` | `routers/instances.py` (`PLAT-8.1`) | List caller-scoped registered instances (`meta.tenants`), channel counts, and webhook dead/retry job totals & failures | `platform_instances_list` | `beta` |
| `GET /v1/numbers` | `Bearer` | `routers/numbers.py` (`PLAT-8.1`) | List caller-scoped WhatsApp phone number health (`status`, `quality_rating`, `messaging_limit`, `health_can_send`, `health_errors`, WABA metadata, and caller-only `serving_channels`) | `platform_numbers_health` | `beta` |
| `GET /v1/alerts` | `Bearer` | `routers/alerts.py` (`PLAT-4.3` / `PLAT-8.1`) | List caller-scoped open/resolved control-plane alerts across all 15 health and delivery rules | `platform_alerts_list` | `beta` |
| `GET /v1/usage` | `Bearer` | `routers/usage.py` (`PLAT-8.5` / `PLAT-11.1`) | List caller-scoped daily WhatsApp message volume and Meta cost buckets reconciled from Graph v25.0 `pricing_analytics` | `platform_usage` | `beta` |
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

## 3. Control-Plane Management & Usage API (`PLAT-8.1..8.5`, `PLAT-11.1`)

Shipped in `AirysBR/airys-platform#29` (`a292f20`) and deployed to staging (`https://api-tdtyqbghua-rj.a.run.app`):

| MCP Tool | Task | HTTP Route | Upstream Backing Model / Rule Set | Stability |
|---|---|---|---|---|
| `platform_numbers_health` | `PLT-03` | `GET /v1/numbers` | `meta.phone_numbers` + `meta.routes` + `meta.instance_channels` + `meta.wabas` (`phone_number_id`, `display_phone_number`, `verified_name`, `waba_id`, `waba_name`, `waba_status`, `currency`, `status`, `quality_rating`, `messaging_limit`, `health_can_send`, `health_errors`, `health_additional_info`, caller-scoped `serving_channels`, `last_polled_at`) | `beta` |
| `platform_alerts_list` | `PLT-03` | `GET /v1/alerts` | `meta.alerts` across all 15 rules (`instance_silent`, `channel_token_invalid`, `channel_ids_stale`, `channel_phone_mismatch`, `number_banned`, `number_cannot_send`, `number_quality_red`, `number_unowned`, `number_claimed_twice`, `token_expiring`, `webhook_jobs_dying`, `dead_set_full`, `callback_dead`, `delivery_rejected`, `webhook_unrouted`) | `beta` |
| `platform_instances_list` | `PLT-04` | `GET /v1/instances` | `meta.tenants` + `meta.instance_channels` + `meta.instance_webhook_failures` (`tenant_id`, `environment`, `customer_id`, `base_url`, `active`, `last_inventory_at`, `channels_count`, `webhook_dead_total`, `webhook_retry_total`, `webhook_failures`) | `beta` |
| `platform_usage` | `PLT-04` | `GET /v1/usage` | `meta.pricing_usage` (`0014_pricing_usage.py`), reconciled daily via Graph v25.0 `pricing_analytics` (`MARKETING`, `MARKETING_LITE`, `UTILITY`, `AUTHENTICATION`, `AUTHENTICATION_INTERNATIONAL`, `SERVICE`, `REFERRAL_CONVERSION`) including split WABA `messaging_account_id` and Solution Partner credit-line WABAs without `cost` | `beta` |

If an older or unpromoted `airys-platform` deployment returns `404 Not Found` on any of the four routes, the tool handler preserves a clear `not_yet_deployed_on_platform` diagnostic pointing the caller to per-instance fallback tools (`wa_health`, `wa_templates_list`, `inboxes_list`).
