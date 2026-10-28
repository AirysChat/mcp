/**
 * Help Center toolset (`help_center`, v0.8.0, Lane 008 — `ADM-07`).
 *
 * Covers help center portals (`GET/POST/PATCH/DELETE /portals*`), categories
 * (`GET/POST/PATCH/DELETE /portals/:portal_id/categories*`), and articles
 * (`GET/POST/PATCH/DELETE /portals/:portal_id/articles*` + bulk actions).
 *
 * Quirk: `:id` on `/portals/:id` and `:portal_id` on `/portals/:portal_id/*` are
 * the portal's string `slug` (`PortalsController#fetch_portal` uses `find_by(slug:)`),
 * NOT its numeric database `id`.
 */

import { z } from 'zod';
import { failure, json, requireConfirmation, untrustedJson } from '../result.js';
import { defineTool } from '../toolsets.js';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export const helpCenterTools = [
  defineTool({
    name: 'portals_list',
    stability: 'stable',
    title: 'List help center portals',
    description: 'List all help center portals on the account (`GET /portals`).',
    inputSchema: z.object({
      page: z.number().int().min(1).optional(),
    }),
    handler: async ({ page }, { client }) =>
      untrustedJson(await client.request('/portals', { query: { page } })),
  }),

  defineTool({
    name: 'portal_get',
    stability: 'stable',
    title: 'Get a help center portal by slug',
    description:
      'Fetch a help center portal by its `portal_slug` (`GET /portals/:id` where `:id` is the string slug, not the numeric ID), ' +
      'optionally including custom domain SSL status (`GET /portals/:id/ssl_status`).',
    inputSchema: z.object({
      portal_slug: z.string().min(1).describe('Portal slug string (e.g. "help-center")'),
      locale: z.string().optional().describe('Optional locale filter for portal articles'),
      include_ssl_status: z.boolean().optional().describe('When true, also fetches GET /portals/:id/ssl_status'),
    }),
    handler: async ({ portal_slug, locale, include_ssl_status }, { client }) => {
      const slug = encodeURIComponent(portal_slug);
      const [portal, ssl_status] = await Promise.all([
        client.request(`/portals/${slug}`, { query: { locale } }),
        include_ssl_status ? client.request(`/portals/${slug}/ssl_status`) : Promise.resolve(undefined),
      ]);
      return untrustedJson({
        portal,
        ...(ssl_status !== undefined ? { ssl_status } : {}),
      });
    },
  }),

  defineTool({
    name: 'portal_upsert',
    stability: 'stable',
    title: 'Create, update, archive, or delete a help center portal',
    description:
      'Manage help center portals: `action: "create"` (`POST /portals`), `action: "update"` (`PATCH /portals/:id`), ' +
      '`action: "archive"` (`PATCH /portals/:id/archive`, requires `confirm: true`), `action: "delete_logo"` (`DELETE /portals/:id/logo`), ' +
      '`action: "send_instructions"` (`POST /portals/:id/send_instructions`, requires `confirm: true`), or ' +
      '`action: "delete"` (`DELETE /portals/:id`, requires `confirm: true`). Note: `:id` on `/portals/:id` is `portal_slug`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      action: z
        .enum(['create', 'update', 'archive', 'delete_logo', 'send_instructions', 'delete'])
        .optional()
        .describe('Defaults to update when portal_slug is provided without create, or create when action="create"'),
      portal_slug: z
        .string()
        .min(1)
        .optional()
        .describe('Existing portal slug (for update/archive/delete) or new slug on create'),
      name: z.string().min(1).optional(),
      slug: z.string().min(1).optional().describe('Portal slug on create or rename'),
      color: z.string().optional(),
      custom_domain: z.string().nullable().optional(),
      header_text: z.string().optional(),
      homepage_link: z.string().optional(),
      page_title: z.string().optional(),
      archived: z.boolean().optional(),
      config: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Portal config object, e.g. `{ default_locale: "pt_BR", allowed_locales: ["pt_BR", "en"] }`'),
      inbox_id: z.number().int().nullable().optional(),
      email: z.string().email().optional().describe('Recipient email when action="send_instructions"'),
      confirm: z
        .boolean()
        .optional()
        .describe('Required when action is "archive", "send_instructions", or "delete"'),
    }),
    handler: async (args, { client }) => {
      const mode = args.action ?? 'create';
      const targetSlug = args.portal_slug ?? args.slug;

      if (mode === 'delete') {
        if (!targetSlug) {
          return failure('validation_error', '`portal_slug` is required when `action` is `"delete"`');
        }
        const gate = requireConfirmation(args.confirm, {
          action: `Permanently delete help center portal "${targetSlug}" and all its categories and articles`,
          target: { portal_slug: targetSlug },
        });
        if (gate) return gate;

        await client.request(`/portals/${encodeURIComponent(targetSlug)}`, { method: 'DELETE' });
        return json({ deleted: true, portal_slug: targetSlug });
      }

      if (mode === 'archive') {
        if (!targetSlug) {
          return failure('validation_error', '`portal_slug` is required when `action` is `"archive"`');
        }
        const gate = requireConfirmation(args.confirm, {
          action: `Archive help center portal "${targetSlug}"`,
          target: { portal_slug: targetSlug },
        });
        if (gate) return gate;

        await client.request(`/portals/${encodeURIComponent(targetSlug)}/archive`, {
          method: 'PATCH',
        });
        return json({ archived: true, portal_slug: targetSlug });
      }

      if (mode === 'delete_logo') {
        if (!targetSlug) {
          return failure('validation_error', '`portal_slug` is required when `action` is `"delete_logo"`');
        }
        await client.request(`/portals/${encodeURIComponent(targetSlug)}/logo`, {
          method: 'DELETE',
        });
        return json({ logo_deleted: true, portal_slug: targetSlug });
      }

      if (mode === 'send_instructions') {
        if (!targetSlug || !args.email) {
          return failure(
            'validation_error',
            '`portal_slug` and `email` are required when `action` is `"send_instructions"`',
          );
        }
        const gate = requireConfirmation(args.confirm, {
          action: `Send CNAME setup instructions for portal "${targetSlug}" to ${args.email}`,
          target: { portal_slug: targetSlug, email: args.email },
        });
        if (gate) return gate;

        return json(
          await client.request(`/portals/${encodeURIComponent(targetSlug)}/send_instructions`, {
            method: 'POST',
            body: { email: args.email },
          }),
        );
      }

      const portalFields = {
        ...(args.name !== undefined ? { name: args.name } : {}),
        ...(args.slug !== undefined ? { slug: args.slug } : args.portal_slug ? { slug: args.portal_slug } : {}),
        ...(args.color !== undefined ? { color: args.color } : {}),
        ...(args.custom_domain !== undefined ? { custom_domain: args.custom_domain } : {}),
        ...(args.header_text !== undefined ? { header_text: args.header_text } : {}),
        ...(args.homepage_link !== undefined ? { homepage_link: args.homepage_link } : {}),
        ...(args.page_title !== undefined ? { page_title: args.page_title } : {}),
        ...(args.archived !== undefined ? { archived: args.archived } : {}),
        ...(args.config !== undefined ? { config: args.config } : {}),
      };

      if (mode === 'create') {
        if (!portalFields.name || !portalFields.slug) {
          return failure('validation_error', '`name` and `slug` (or `portal_slug`) are required when creating a portal');
        }
        return untrustedJson(
          await client.request('/portals', {
            method: 'POST',
            body: {
              portal: portalFields,
              ...(args.inbox_id !== undefined ? { inbox_id: args.inbox_id } : {}),
            },
          }),
        );
      }

      if (!args.portal_slug) {
        return failure('validation_error', '`portal_slug` is required when updating a portal');
      }
      return untrustedJson(
        await client.request(`/portals/${encodeURIComponent(args.portal_slug)}`, {
          method: 'PATCH',
          body: {
            portal: portalFields,
            ...(args.inbox_id !== undefined ? { inbox_id: args.inbox_id } : {}),
          },
        }),
      );
    },
  }),

  defineTool({
    name: 'categories_list',
    stability: 'stable',
    title: 'List or get help center categories',
    description:
      'List categories in a help center portal (`GET /portals/:portal_id/categories` where `:portal_id` is `portal_slug`) ' +
      'or fetch one category (`GET /portals/:portal_id/categories/:id`).',
    inputSchema: z.object({
      portal_slug: z.string().min(1).describe('Portal slug string'),
      category_id: z.number().int().optional().describe('When set, fetches GET /portals/:portal_id/categories/:id'),
      locale: z.string().optional(),
      page: z.number().int().min(1).optional(),
    }),
    handler: async ({ portal_slug, category_id, locale, page }, { client }) => {
      const slug = encodeURIComponent(portal_slug);
      if (category_id !== undefined) {
        return untrustedJson(await client.request(`/portals/${slug}/categories/${category_id}`));
      }
      return untrustedJson(
        await client.request(`/portals/${slug}/categories`, {
          query: { locale, page },
        }),
      );
    },
  }),

  defineTool({
    name: 'category_upsert',
    stability: 'stable',
    title: 'Create, update, or reorder help center categories',
    description:
      'Create (`POST /portals/:portal_id/categories`), update (`PATCH /portals/:portal_id/categories/:id`), or reorder (`POST /portals/:portal_id/categories/reorder`) ' +
      'categories in a help center portal.',
    write: true,
    inputSchema: z.object({
      action: z
        .enum(['create', 'update', 'reorder'])
        .optional()
        .describe('Defaults to update when category_id is given, create otherwise'),
      portal_slug: z.string().min(1).describe('Portal slug string'),
      category_id: z.number().int().optional(),
      name: z.string().min(1).optional(),
      slug: z.string().min(1).optional(),
      locale: z.string().optional(),
      description: z.string().optional(),
      position: z.number().int().optional(),
      icon: z.string().optional(),
      icon_color: z.string().optional(),
      parent_category_id: z.number().int().nullable().optional(),
      associated_category_id: z.number().int().nullable().optional(),
      related_category_ids: z.array(z.number().int()).optional(),
      positions_hash: z
        .record(z.string(), z.number().int())
        .optional()
        .describe('Map of category ID string to position integer when action="reorder"'),
    }),
    handler: async (args, { client }) => {
      const portalSlug = encodeURIComponent(args.portal_slug);
      const mode = args.action ?? (args.category_id !== undefined ? 'update' : 'create');

      if (mode === 'reorder') {
        if (!args.positions_hash) {
          return failure('validation_error', '`positions_hash` is required when `action` is `"reorder"`');
        }
        await client.request(`/portals/${portalSlug}/categories/reorder`, {
          method: 'POST',
          body: { positions_hash: args.positions_hash },
        });
        return json({ reordered: true, portal_slug: args.portal_slug, positions_hash: args.positions_hash });
      }

      const {
        action: _action,
        portal_slug: _ps,
        category_id,
        positions_hash: _ph,
        ...categoryFields
      } = args;

      if (mode === 'create') {
        if (!categoryFields.name || !categoryFields.slug) {
          return failure('validation_error', '`name` and `slug` are required when creating a category');
        }
        return untrustedJson(
          await client.request(`/portals/${portalSlug}/categories`, {
            method: 'POST',
            body: {
              category: {
                locale: 'en',
                ...categoryFields,
              },
            },
          }),
        );
      }

      if (category_id === undefined) {
        return failure('validation_error', '`category_id` is required when updating a category');
      }
      return untrustedJson(
        await client.request(`/portals/${portalSlug}/categories/${category_id}`, {
          method: 'PATCH',
          body: { category: categoryFields },
        }),
      );
    },
  }),

  defineTool({
    name: 'category_delete',
    stability: 'stable',
    title: 'Delete a help center category',
    description:
      'Delete a category from a help center portal (`DELETE /portals/:portal_id/categories/:id`). Requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      portal_slug: z.string().min(1),
      category_id: z.number().int(),
      confirm: z.boolean().optional().describe('Set true only after a human approves deleting the category'),
    }),
    handler: async ({ portal_slug, category_id, confirm }, { client }) => {
      const slug = encodeURIComponent(portal_slug);
      const raw = asRecord(await client.request(`/portals/${slug}/categories/${category_id}`));
      const cat = raw.payload && typeof raw.payload === 'object' ? asRecord(raw.payload) : raw;
      const gate = requireConfirmation(confirm, {
        action: `Delete category #${category_id} (${typeof cat.name === 'string' ? `"${cat.name}"` : 'unnamed'}) from portal "${portal_slug}"`,
        target: { portal_slug, category_id, name: cat.name ?? null, slug: cat.slug ?? null },
      });
      if (gate) return gate;

      await client.request(`/portals/${slug}/categories/${category_id}`, { method: 'DELETE' });
      return json({ deleted: true, portal_slug, category_id });
    },
  }),

  defineTool({
    name: 'articles_list',
    stability: 'stable',
    title: 'List or search help center articles',
    description:
      'List or search articles in a help center portal (`GET /portals/:portal_id/articles`). Supports `query` search, `locale`, `category_slug`, `status`, `author_id`, and `page`.',
    inputSchema: z.object({
      portal_slug: z.string().min(1).describe('Portal slug string'),
      query: z.string().optional().describe('Search query over article title and content'),
      locale: z.string().optional(),
      category_slug: z.string().optional(),
      status: z.enum(['draft', 'published', 'archived']).optional(),
      author_id: z.number().int().optional(),
      page: z.number().int().min(1).optional(),
    }),
    handler: async ({ portal_slug, ...query }, { client }) => {
      const slug = encodeURIComponent(portal_slug);
      return untrustedJson(await client.request(`/portals/${slug}/articles`, { query }));
    },
  }),

  defineTool({
    name: 'article_get',
    stability: 'stable',
    title: 'Get a help center article',
    description:
      'Fetch a single help center article by ID (`GET /portals/:portal_id/articles/:id`).',
    inputSchema: z.object({
      portal_slug: z.string().min(1).describe('Portal slug string'),
      article_id: z.number().int(),
    }),
    handler: async ({ portal_slug, article_id }, { client }) => {
      const slug = encodeURIComponent(portal_slug);
      return untrustedJson(await client.request(`/portals/${slug}/articles/${article_id}`));
    },
  }),

  defineTool({
    name: 'article_upsert',
    stability: 'stable',
    title: 'Create, update, reorder, recategorize, or translate help center articles',
    description:
      'Create (`POST /portals/:portal_id/articles`), update (`PATCH /portals/:portal_id/articles/:id`), reorder (`POST /portals/:portal_id/articles/reorder`), ' +
      'bulk update category (`PATCH /portals/:portal_id/articles/bulk_actions/update_category`), or bulk translate (`POST /portals/:portal_id/articles/bulk_actions/translate`) ' +
      'help center articles. On create, defaults `status` to `"draft"` and resolves `author_id` from `/api/v1/profile` when omitted. ' +
      'To change article status to `"published"`, use `article_publish`.',
    write: true,
    inputSchema: z.object({
      action: z
        .enum(['create', 'update', 'reorder', 'bulk_update_category', 'bulk_translate'])
        .optional()
        .describe('Defaults to update when article_id is given, create otherwise'),
      portal_slug: z.string().min(1).describe('Portal slug string'),
      article_id: z.number().int().optional(),
      title: z.string().min(1).optional(),
      slug: z.string().min(1).optional(),
      content: z.string().optional(),
      description: z.string().optional(),
      position: z.number().int().optional(),
      category_id: z.number().int().nullable().optional(),
      author_id: z.number().int().optional().describe('Defaults to the authenticated user ID on create'),
      associated_article_id: z.number().int().nullable().optional(),
      locale: z.string().optional(),
      draft_title: z.string().optional(),
      draft_content: z.string().optional(),
      meta: z
        .object({
          title: z.string().optional(),
          description: z.string().optional(),
          tags: z.array(z.string()).optional(),
        })
        .optional(),
      positions_hash: z
        .record(z.string(), z.number().int())
        .optional()
        .describe('Map of article ID string to position integer when action="reorder"'),
      article_ids: z
        .array(z.number().int())
        .min(1)
        .optional()
        .describe('Target article IDs for bulk_update_category or bulk_translate'),
      force: z.boolean().optional().describe('Overwrite existing translations when action="bulk_translate"'),
    }),
    handler: async (args, { client }) => {
      const portalSlug = encodeURIComponent(args.portal_slug);
      const mode = args.action ?? (args.article_id !== undefined ? 'update' : 'create');

      if (mode === 'reorder') {
        if (!args.positions_hash) {
          return failure('validation_error', '`positions_hash` is required when `action` is `"reorder"`');
        }
        return json(
          await client.request(`/portals/${portalSlug}/articles/reorder`, {
            method: 'POST',
            body: { positions_hash: args.positions_hash },
          }),
        );
      }

      if (mode === 'bulk_update_category') {
        if (!args.article_ids || args.category_id === undefined || args.category_id === null) {
          return failure(
            'validation_error',
            '`article_ids` and `category_id` are required when `action` is `"bulk_update_category"`',
          );
        }
        await client.request(`/portals/${portalSlug}/articles/bulk_actions/update_category`, {
          method: 'PATCH',
          body: { ids: args.article_ids, category_id: args.category_id },
        });
        return json({
          updated: true,
          portal_slug: args.portal_slug,
          article_ids: args.article_ids,
          category_id: args.category_id,
        });
      }

      if (mode === 'bulk_translate') {
        if (!args.article_ids || !args.locale) {
          return failure(
            'validation_error',
            '`article_ids` and `locale` are required when `action` is `"bulk_translate"`',
          );
        }
        const res = await client.request(`/portals/${portalSlug}/articles/bulk_actions/translate`, {
          method: 'POST',
          body: {
            ids: args.article_ids,
            locale: args.locale,
            ...(args.category_id !== undefined ? { category_id: args.category_id } : {}),
            ...(args.force !== undefined ? { force: args.force } : {}),
          },
        });
        return json({
          translated: true,
          portal_slug: args.portal_slug,
          article_ids: args.article_ids,
          locale: args.locale,
          response: res,
        });
      }

      const {
        action: _action,
        portal_slug: _ps,
        article_id,
        positions_hash: _ph,
        article_ids: _ids,
        force: _force,
        ...articleFields
      } = args;

      if (mode === 'create') {
        if (!articleFields.title || !articleFields.slug || !articleFields.content) {
          return failure(
            'validation_error',
            '`title`, `slug`, and `content` are required when creating an article',
          );
        }
        let authorId = articleFields.author_id;
        if (authorId === undefined) {
          const profile = asRecord(await client.request('/api/v1/profile', { prefix: 'raw' }));
          if (typeof profile.id === 'number') {
            authorId = profile.id;
          }
        }
        return untrustedJson(
          await client.request(`/portals/${portalSlug}/articles`, {
            method: 'POST',
            body: {
              article: {
                status: 'draft',
                ...articleFields,
                ...(authorId !== undefined ? { author_id: authorId } : {}),
              },
            },
          }),
        );
      }

      if (article_id === undefined) {
        return failure('validation_error', '`article_id` is required when updating an article');
      }
      return untrustedJson(
        await client.request(`/portals/${portalSlug}/articles/${article_id}`, {
          method: 'PATCH',
          body: { article: articleFields },
        }),
      );
    },
  }),

  defineTool({
    name: 'article_publish',
    stability: 'stable',
    title: 'Publish, unpublish, or archive help center article(s)',
    description:
      'Transition one article (`PATCH /portals/:portal_id/articles/:id`) or a batch of articles (`PATCH /portals/:portal_id/articles/bulk_actions/update_status`) ' +
      'between `"published"`, `"draft"`, and `"archived"`. Marked irreversible because publishing exposes article content on the public help center portal; requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      portal_slug: z.string().min(1).describe('Portal slug string'),
      article_id: z.number().int().optional().describe('Single article ID to update'),
      article_ids: z.array(z.number().int()).min(1).optional().describe('Batch of article IDs (`bulk_actions/update_status`)'),
      status: z.enum(['published', 'draft', 'archived']).optional().describe('Defaults to "published"'),
      confirm: z.boolean().optional().describe('Set true only after a human approves changing article publication status'),
    }),
    handler: async ({ portal_slug, article_id, article_ids, status = 'published', confirm }, { client }) => {
      const slug = encodeURIComponent(portal_slug);

      if (article_ids && article_ids.length > 0) {
        const gate = requireConfirmation(confirm, {
          action: `Set status="${status}" on ${article_ids.length} article(s) in portal "${portal_slug}"`,
          target: { portal_slug, article_ids, status },
        });
        if (gate) return gate;

        await client.request(`/portals/${slug}/articles/bulk_actions/update_status`, {
          method: 'PATCH',
          body: { ids: article_ids, status },
        });
        return json({ updated: true, portal_slug, article_ids, status });
      }

      if (article_id === undefined) {
        return failure('validation_error', 'Provide either `article_id` or `article_ids`');
      }

      const raw = asRecord(await client.request(`/portals/${slug}/articles/${article_id}`));
      const art = raw.payload && typeof raw.payload === 'object' ? asRecord(raw.payload) : raw;
      const gate = requireConfirmation(confirm, {
        action: `Set status="${status}" on article #${article_id} (${typeof art.title === 'string' ? `"${art.title}"` : 'untitled'}) in portal "${portal_slug}"`,
        target: {
          portal_slug,
          article_id,
          title: art.title ?? null,
          current_status: art.status ?? null,
          next_status: status,
        },
      });
      if (gate) return gate;

      return untrustedJson(
        await client.request(`/portals/${slug}/articles/${article_id}`, {
          method: 'PATCH',
          body: { article: { status } },
        }),
      );
    },
  }),

  defineTool({
    name: 'article_delete',
    stability: 'stable',
    title: 'Delete one or more help center articles',
    description:
      'Permanently delete a single article (`DELETE /portals/:portal_id/articles/:id`) or a batch of articles (`DELETE /portals/:portal_id/articles/bulk_actions/delete_articles`). ' +
      'Requires `confirm: true`.',
    write: true,
    irreversible: true,
    inputSchema: z.object({
      portal_slug: z.string().min(1).describe('Portal slug string'),
      article_id: z.number().int().optional().describe('Single article ID to delete'),
      article_ids: z.array(z.number().int()).min(1).optional().describe('Batch of article IDs (`bulk_actions/delete_articles`)'),
      confirm: z.boolean().optional().describe('Set true only after a human approves deleting the article(s)'),
    }),
    handler: async ({ portal_slug, article_id, article_ids, confirm }, { client }) => {
      const slug = encodeURIComponent(portal_slug);

      if (article_ids && article_ids.length > 0) {
        const gate = requireConfirmation(confirm, {
          action: `Permanently delete ${article_ids.length} article(s) from portal "${portal_slug}"`,
          target: { portal_slug, article_ids },
        });
        if (gate) return gate;

        await client.request(`/portals/${slug}/articles/bulk_actions/delete_articles`, {
          method: 'DELETE',
          body: { ids: article_ids },
        });
        return json({ deleted: true, portal_slug, article_ids });
      }

      if (article_id === undefined) {
        return failure('validation_error', 'Provide either `article_id` or `article_ids`');
      }

      const raw = asRecord(await client.request(`/portals/${slug}/articles/${article_id}`));
      const art = raw.payload && typeof raw.payload === 'object' ? asRecord(raw.payload) : raw;
      const gate = requireConfirmation(confirm, {
        action: `Delete article #${article_id} (${typeof art.title === 'string' ? `"${art.title}"` : 'untitled'}) from portal "${portal_slug}"`,
        target: { portal_slug, article_id, title: art.title ?? null, slug: art.slug ?? null },
      });
      if (gate) return gate;

      await client.request(`/portals/${slug}/articles/${article_id}`, { method: 'DELETE' });
      return json({ deleted: true, portal_slug, article_id });
    },
  }),
];
