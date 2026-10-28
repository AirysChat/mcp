# Domain Brief — `help_center` (v0.8.0, Lane 008)

- **Source**: `AirysChat@c9ea590d8c` (`origin/develop`)
- **Date**: 2026-10-28
- **Lane task**: `ADM-01` (feeds `ADM-07` in lane 008)
- **Prefixes**:
  - `core` (`/api/v1/accounts/:account_id/portals*` — help center portals, categories, articles, and bulk article actions)

## 1. Endpoint Catalog & Parameters

### 1.1 Portals (`Api::V1::Accounts::PortalsController`)

| Method | Prefix | Path | Controller#action | Permission | Parameters (`*` required) | Effect | Untrusted | Curated Tool |
|---|---|---|---|---|---|---|---|---|
| `GET` | `core` | `/portals` | `api/v1/accounts/portals#index` | `portal:index?` | `page` | read | **yes** | `portals_list` |
| `GET` | `core` | `/portals/:id` | `api/v1/accounts/portals#show` | `portal:show?` | `id*` (**portal `slug`**, not numeric ID), `locale` | read | **yes** | `portal_get` |
| `GET` | `core` | `/portals/:id/ssl_status` | `api/v1/accounts/portals#ssl_status` | `portal:ssl_status?` (admin) | `id*` (**portal `slug`**) | read | no | `portal_get` |
| `POST` | `core` | `/portals` | `api/v1/accounts/portals#create` | `portal:create?` (admin) | `portal*: { name*, slug*, color, custom_domain, header_text, homepage_link, page_title, archived, config: { default_locale, allowed_locales: [] } }`, `inbox_id` | write | **yes** | `portal_upsert` |
| `PATCH`/`PUT` | `core` | `/portals/:id` | `api/v1/accounts/portals#update` | `portal:update?` (admin) | `id*` (**portal `slug`**), `portal*: { name, slug, color, custom_domain, header_text, homepage_link, page_title, archived, config: {} }`, `inbox_id` | write | **yes** | `portal_upsert` |
| `PATCH` | `core` | `/portals/:id/archive` | `api/v1/accounts/portals#archive` | `portal:archive?` (admin) | `id*` (**portal `slug`**) | write + **irreversible** | no | `portal_upsert` |
| `DELETE` | `core` | `/portals/:id/logo` | `api/v1/accounts/portals#logo` | `portal:logo?` (admin) | `id*` (**portal `slug`**) | write | no | `portal_upsert` |
| `POST` | `core` | `/portals/:id/send_instructions` | `api/v1/accounts/portals#send_instructions` | `portal:send_instructions?` (admin) | `id*` (**portal `slug`**), `email*` | write + **irreversible** (sends external CNAME instruction email) | no | `portal_upsert` |
| `DELETE` | `core` | `/portals/:id` | `api/v1/accounts/portals#destroy` | `portal:destroy?` (admin) | `id*` (**portal `slug`**) | write + **irreversible** | no | `portal_upsert` |

### 1.2 Categories (`Api::V1::Accounts::CategoriesController`)

| Method | Prefix | Path | Controller#action | Permission | Parameters (`*` required) | Effect | Untrusted | Curated Tool |
|---|---|---|---|---|---|---|---|---|
| `GET` | `core` | `/portals/:portal_id/categories` | `api/v1/accounts/categories#index` | `category:index?` | `portal_id*` (**portal `slug`**), `locale`, `page` | read | **yes** | `categories_list` |
| `GET` | `core` | `/portals/:portal_id/categories/:id` | `api/v1/accounts/categories#show` | `category:show?` | `portal_id*` (**portal `slug`**), `id*` (numeric category ID) | read | **yes** | `categories_list` |
| `POST` | `core` | `/portals/:portal_id/categories` | `api/v1/accounts/categories#create` | `category:create?` (admin) | `portal_id*` (**portal `slug`**), `category*: { name*, slug*, locale*, description, position, icon, icon_color, parent_category_id, associated_category_id, related_category_ids: [] }` | write | **yes** | `category_upsert` |
| `PATCH`/`PUT` | `core` | `/portals/:portal_id/categories/:id` | `api/v1/accounts/categories#update` | `category:update?` (admin) | `portal_id*` (**portal `slug`**), `id*`, `category*: { name, slug, locale, description, position, icon, icon_color, parent_category_id, associated_category_id, related_category_ids: [] }` | write | **yes** | `category_upsert` |
| `POST` | `core` | `/portals/:portal_id/categories/reorder` | `api/v1/accounts/categories#reorder` | `category:reorder?` (admin) | `portal_id*` (**portal `slug`**), `positions_hash*` (`Record<string, number>`) | write | no | `category_upsert` |
| `DELETE` | `core` | `/portals/:portal_id/categories/:id` | `api/v1/accounts/categories#destroy` | `category:destroy?` (admin) | `portal_id*` (**portal `slug`**), `id*` | write + **irreversible** | no | `category_delete` |

### 1.3 Articles & Bulk Actions (`Api::V1::Accounts::ArticlesController`, `Articles::BulkActionsController`)

| Method | Prefix | Path | Controller#action | Permission | Parameters (`*` required) | Effect | Untrusted | Curated Tool |
|---|---|---|---|---|---|---|---|---|
| `GET` | `core` | `/portals/:portal_id/articles` | `api/v1/accounts/articles#index` | `article:index?` | `portal_id*` (**portal `slug`**), `query`, `locale`, `category_slug`, `status` (`draft`\|`published`\|`archived` or `0`\|`1`\|`2`), `author_id`, `page` | read | **yes** | `articles_list` |
| `GET` | `core` | `/portals/:portal_id/articles/:id` | `api/v1/accounts/articles#show` | `article:show?` | `portal_id*` (**portal `slug`**), `id*` (numeric article ID) | read | **yes** | `article_get` |
| `POST` | `core` | `/portals/:portal_id/articles` | `api/v1/accounts/articles#create` | `article:create?` | `portal_id*` (**portal `slug`**), `article*: { title*, slug*, content*, author_id*, description, position, category_id, associated_article_id, status, locale, meta: { title, description, tags: [] } }` | write | **yes** | `article_upsert` |
| `PATCH`/`PUT` | `core` | `/portals/:portal_id/articles/:id` | `api/v1/accounts/articles#update` | `article:update?` | `portal_id*` (**portal `slug`**), `id*`, `article*: { title, slug, content, description, position, category_id, author_id, associated_article_id, status, locale, draft_title, draft_content, meta: {} }` | write | **yes** | `article_upsert` / `article_publish` |
| `POST` | `core` | `/portals/:portal_id/articles/reorder` | `api/v1/accounts/articles#reorder` | `article:reorder?` | `portal_id*` (**portal `slug`**), `positions_hash*` (`Record<string, number>`) | write | no | `article_upsert` |
| `PATCH` | `core` | `/portals/:portal_id/articles/bulk_actions/update_category` | `api/v1/accounts/articles/bulk_actions#update_category` | `article:create?` | `portal_id*` (**portal `slug`**), `ids*` (`number[]`), `category_id*` | write | no | `article_upsert` |
| `POST` | `core` | `/portals/:portal_id/articles/bulk_actions/translate` | `api/v1/accounts/articles/bulk_actions#translate` | `article:create?` | `portal_id*` (**portal `slug`**), `ids*` (`number[]`), `locale*`, `category_id`, `force` | write | no | `article_upsert` |
| `PATCH` | `core` | `/portals/:portal_id/articles/bulk_actions/update_status` | `api/v1/accounts/articles/bulk_actions#update_status` | `article:create?` | `portal_id*` (**portal `slug`**), `ids*` (`number[]`), `status*` (`draft`\|`published`\|`archived`) | write + **irreversible** | no | `article_publish` |
| `DELETE` | `core` | `/portals/:portal_id/articles/:id` | `api/v1/accounts/articles#destroy` | `article:destroy?` | `portal_id*` (**portal `slug`**), `id*` | write + **irreversible** | no | `article_delete` |
| `DELETE` | `core` | `/portals/:portal_id/articles/bulk_actions/delete_articles` | `api/v1/accounts/articles/bulk_actions#delete_articles` | `article:create?` | `portal_id*` (**portal `slug`**), `ids*` (`number[]`) | write + **irreversible** | no | `article_delete` |

## 2. Quirks & Non-Obvious Behaviour

1. **`:id` on `/portals/:id` and `:portal_id` on `/portals/:portal_id/*` are the portal's `slug` (string), NOT its numeric `id`**:
   - `PortalsController#fetch_portal` runs `Current.account.portals.find_by(slug: permitted_params[:id])`.
   - `CategoriesController#portal` and `ArticlesController#portal` run `Current.account.portals.find_by!(slug: params[:portal_id])`.
   - Passing a numeric ID returns `404` (unless the slug happens to be numeric). All `help_center` tools accept `portal_slug: z.string()` and interpolate `encodeURIComponent(portal_slug)`.
2. **Article `author_id` is required on `POST /portals/:portal_id/articles`**:
   - `Article` belongs to `author` (`User`). When `author_id` is omitted in `article_upsert` on create, the tool can either accept `author_id` explicitly or fetch `/api/v1/profile` (`me`) to default `author_id` to the authenticated user's `id`!
3. **`CategoriesController#create` calls `@category.related_categories << related_categories_records` where `related_categories_records` reads `params[:category][:related_category_ids]`**:
   - Even when `related_category_ids` is omitted, `params[:category]` must be present (`{ category: { ... } }`), otherwise `params[:category][:related_category_ids]` raises `NoMethodError`. Always wrap category payloads under `{ category: ... }`.
4. **All help center payloads carry untrusted text**:
   - Portal titles/headers, category names/descriptions, and article titles/bodies/meta tags can contain arbitrary HTML/Markdown or user-submitted content, so all read and write responses that return portal/category/article records use `untrustedJson`.
