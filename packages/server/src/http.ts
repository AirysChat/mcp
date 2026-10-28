#!/usr/bin/env node
/**
 * AirysChat MCP server — Stateless Streamable HTTP entry point (REM-02, ADRs 0004 & 0006).
 *
 * Designed for Cloud Run (`mcp.airys.chat` / `mcp.staging.airys.chat`):
 * - Serves `/healthz` and `/health` for startup/liveness probes.
 * - Serves `/.well-known/oauth-protected-resource` (RFC 9728) pointing at the instance's
 *   AirysChat OAuth 2.1 Authorization Server.
 * - Serves `/mcp` and `/<instance>/mcp` (REM-15) with OAuth 2.1 Bearer introspection,
 *   audience/expiry/account/scope verification, per-token rate limiting, and per-request
 *   `McpServer` construction.
 * - Emits structured JSON logs with no headers, bodies, or tokens (fingerprint only).
 */

import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';
import {
  AirysChatTokenIntrospector,
  OAuthError,
  SlidingWindowRateLimiter,
  bearerAuthChallengeResponse,
  createProtectedResourceMetadataResponse,
  formatStructuredLog,
  loadInstanceAllowlist,
  resolveRequestRoute,
  type InstanceAllowlist,
  type StructuredHttpLogEntry,
} from './auth.js';
import { AirysChatClient } from './client.js';
import {
  DEFAULT_TOOLSETS,
  parseFeatures,
  parseToolsets,
  type Config,
  type Stability,
  type ToolsetName,
} from './config.js';
import { VERSION, createServerForContext } from './server.js';

export const DEFAULT_HTTP_MAX_BODY_BYTES = 256 * 1024; // 256 KiB

export interface HttpAppOptions {
  env?: NodeJS.ProcessEnv;
  allowlist?: InstanceAllowlist;
  introspector?: AirysChatTokenIntrospector;
  rateLimiter?: SlidingWindowRateLimiter;
  maxBodyBytes?: number;
  publicOrigin?: string;
  log?: (line: string) => void;
}

export interface HttpApp {
  fetch: (request: Request) => Promise<Response>;
  allowlist: InstanceAllowlist;
  introspector: AirysChatTokenIntrospector;
  rateLimiter: SlidingWindowRateLimiter;
}

export function createHttpApp(options: HttpAppOptions = {}): HttpApp {
  const env = options.env ?? process.env;
  const allowlist = options.allowlist ?? loadInstanceAllowlist(env);
  const defaultToolsets: Set<ToolsetName> = env.AIRYSCHAT_TOOLSETS
    ? parseToolsets(env.AIRYSCHAT_TOOLSETS)
    : new Set(DEFAULT_TOOLSETS);
  const features: Exclude<Stability, 'deprecated'> = parseFeatures(env.AIRYSCHAT_FEATURES);
  const timeoutMs = Number(env.AIRYSCHAT_TIMEOUT_MS ?? 30_000);
  const maxBodyBytes = options.maxBodyBytes ?? Number(env.AIRYSCHAT_MAX_BODY_BYTES ?? DEFAULT_HTTP_MAX_BODY_BYTES);
  const publicOrigin = options.publicOrigin ?? env.AIRYSCHAT_PUBLIC_ORIGIN?.trim();

  const introspector =
    options.introspector ??
    new AirysChatTokenIntrospector({
      cacheTtlSeconds: Number(env.AIRYSCHAT_INTROSPECTION_CACHE_TTL_S ?? 60),
      timeoutMs: Number(env.AIRYSCHAT_INTROSPECTION_TIMEOUT_MS ?? 5_000),
      introspectionSecret: env.AIRYSCHAT_INTROSPECTION_SECRET?.trim() || undefined,
      defaultToolsets,
    });

  const rateLimitPerMin = Number(env.AIRYSCHAT_RATE_LIMIT_PER_MIN ?? 120);
  const rateLimiter = options.rateLimiter ?? new SlidingWindowRateLimiter(rateLimitPerMin, 60_000);
  const writeLog = options.log ?? ((line: string) => process.stderr.write(line));

  const fetchHandler = async (request: Request): Promise<Response> => {
    const startMs = performance.now();
    const requestId = request.headers.get('x-request-id')?.trim() || randomUUID();
    const url = new URL(request.url);
    const route = resolveRequestRoute(url, request.headers, allowlist, publicOrigin);

    const logAndReturn = (
      response: Response,
      meta: Partial<Pick<StructuredHttpLogEntry, 'instance' | 'account_id' | 'token_fp' | 'error_code'>> = {},
    ): Response => {
      const durationMs = performance.now() - startMs;
      const severity = response.status >= 500 ? 'ERROR' : response.status >= 400 ? 'WARNING' : 'INFO';
      writeLog(
        formatStructuredLog({
          severity,
          request_id: requestId,
          method: request.method,
          path: url.pathname,
          status: response.status,
          duration_ms: durationMs,
          ...meta,
        }),
      );
      const headers = new Headers(response.headers);
      headers.set('x-request-id', requestId);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    };

    if (route.kind === 'health') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return logAndReturn(Response.json({ error: 'method_not_allowed' }, { status: 405 }));
      }
      return logAndReturn(Response.json({ status: 'ok', version: VERSION }, { status: 200 }));
    }

    if (route.kind === 'not_found') {
      return logAndReturn(Response.json({ error: 'not_found' }, { status: 404 }), { error_code: 'not_found' });
    }

    if (route.kind === 'invalid_instance') {
      return logAndReturn(
        Response.json(
          { error: 'unknown_instance', error_description: route.message },
          { status: 400 },
        ),
        { error_code: 'unknown_instance' },
      );
    }

    if (route.kind === 'metadata') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return logAndReturn(
          Response.json({ error: 'method_not_allowed' }, { status: 405 }),
          { instance: route.instance.slug, error_code: 'method_not_allowed' },
        );
      }
      return logAndReturn(
        createProtectedResourceMetadataResponse(route.instance, route.resourceUrl),
        { instance: route.instance.slug },
      );
    }

    // route.kind === 'mcp'
    let auth;
    try {
      auth = await introspector.verifyRequest(
        request,
        route.instance,
        route.resourceUrl,
        route.metadataUrl,
      );
    } catch (error) {
      const errorCode = error instanceof OAuthError ? error.code : 'server_error';
      const challenge = bearerAuthChallengeResponse(error, {
        requiredScopes: ['mcp:read'],
        resourceMetadataUrl: route.metadataUrl,
      });
      return logAndReturn(challenge, {
        instance: route.instance.slug,
        error_code: errorCode,
      });
    }

    const rateCheck = rateLimiter.check(`${route.instance.slug}:${auth.tokenFp}`);
    if (!rateCheck.allowed) {
      return logAndReturn(
        Response.json(
          {
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Rate limit exceeded. Retry later.' },
            id: null,
          },
          {
            status: 429,
            headers: { 'Retry-After': String(rateCheck.retryAfterSeconds) },
          },
        ),
        {
          instance: route.instance.slug,
          account_id: auth.accountId,
          token_fp: auth.tokenFp,
          error_code: 'rate_limited',
        },
      );
    }

    const config: Config = {
      baseUrl: route.instance.baseUrl,
      apiKey: auth.token,
      accountId: auth.accountId,
      toolsets: auth.toolsets,
      features,
      readOnly: auth.maxAccess === 'read',
      timeoutMs,
      maxAccess: auth.maxAccess,
      toolsetsRestricted: auth.toolsetsRestricted,
      authScheme: 'bearer',
    };

    const context = { config, client: new AirysChatClient(config) };
    const { server } = createServerForContext(context);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      maxRequestBodySize: maxBodyBytes,
    });

    await server.connect(transport);
    try {
      const normalizedReq = ensureStreamableAcceptHeader(request);
      const response = await transport.handleRequest(normalizedReq, { authInfo: auth });
      return logAndReturn(response, {
        instance: route.instance.slug,
        account_id: auth.accountId,
        token_fp: auth.tokenFp,
      });
    } finally {
      await transport.close().catch(() => {});
      await server.close().catch(() => {});
    }
  };

  return {
    fetch: fetchHandler,
    allowlist,
    introspector,
    rateLimiter,
  };
}

/**
 * Ensures callers sending `Accept: application/json` or `* /*` (e.g. MCP 2026-07-28
 * stateless JSON clients) satisfy `WebStandardStreamableHTTPServerTransport`'s combined
 * `application/json, text/event-stream` check while still rejecting incompatible `Accept`
 * headers like `text/html`.
 */
function ensureStreamableAcceptHeader(request: Request): Request {
  if (request.method !== 'POST') return request;
  const accept = request.headers.get('accept');
  if (accept && accept.includes('application/json') && accept.includes('text/event-stream')) {
    return request;
  }
  if (!accept || accept.includes('application/json') || accept.includes('*/*')) {
    const headers = new Headers(request.headers);
    headers.set('accept', 'application/json, text/event-stream');
    return new Request(request.url, {
      method: request.method,
      headers,
      body: request.body,
      duplex: 'half',
    });
  }
  return request;
}

export interface RunningHttpServer {
  server: Server;
  port: number;
  close: () => Promise<void>;
}

/**
 * Starts a `node:http` server wrapping `createHttpApp(options)`.
 */
export async function startHttpServer(
  options: HttpAppOptions & { port?: number; host?: string } = {},
): Promise<RunningHttpServer> {
  const app = createHttpApp(options);
  const env = options.env ?? process.env;
  const port = options.port ?? Number(env.PORT ?? 8080);
  const host = options.host ?? env.HOST ?? '0.0.0.0';
  const maxBodyBytes = options.maxBodyBytes ?? Number(env.AIRYSCHAT_MAX_BODY_BYTES ?? DEFAULT_HTTP_MAX_BODY_BYTES);

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const hostHeader = req.headers.host ?? `${host}:${port}`;
      const url = new URL(req.url ?? '/', `http://${hostHeader}`);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (Array.isArray(value)) {
          for (const item of value) headers.append(key, item);
        } else if (value !== undefined) {
          headers.set(key, value);
        }
      }

      let bodyBytes: Buffer | undefined;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const declaredLength = Number(req.headers['content-length']);
        if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32000, message: `Payload Too Large: Request body must not exceed ${maxBodyBytes} bytes` },
              id: null,
            }),
          );
          req.resume();
          return;
        }

        const chunks: Buffer[] = [];
        let received = 0;
        let tooLarge = false;
        for await (const chunk of req) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
          received += buf.byteLength;
          if (received > maxBodyBytes) {
            tooLarge = true;
            break;
          }
          chunks.push(buf);
        }
        if (tooLarge) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32000, message: `Payload Too Large: Request body must not exceed ${maxBodyBytes} bytes` },
              id: null,
            }),
          );
          return;
        }
        bodyBytes = Buffer.concat(chunks);
      }

      const webReq = new Request(url, {
        method: req.method ?? 'GET',
        headers,
        body: bodyBytes && bodyBytes.byteLength > 0 ? new Uint8Array(bodyBytes) : undefined,
      });

      const webRes = await app.fetch(webReq);
      const outHeaders: Record<string, string> = {};
      webRes.headers.forEach((value, key) => {
        outHeaders[key] = value;
      });
      res.writeHead(webRes.status, outHeaders);
      const arrayBuf = await webRes.arrayBuffer();
      res.end(Buffer.from(arrayBuf));
    } catch {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null }));
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });

  const address = server.address();
  const boundPort = typeof address === 'object' && address ? address.port : port;

  return {
    server,
    port: boundPort,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  startHttpServer()
    .then(({ port }) => {
      process.stderr.write(
        `${JSON.stringify({
          severity: 'INFO',
          timestamp: new Date().toISOString(),
          message: `airyschat-mcp HTTP server ${VERSION} listening`,
          port,
        })}\n`,
      );
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `${JSON.stringify({
          severity: 'ERROR',
          timestamp: new Date().toISOString(),
          message: error instanceof Error ? error.message : String(error),
        })}\n`,
      );
      process.exit(1);
    });
}
