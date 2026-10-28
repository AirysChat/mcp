# syntax=docker/dockerfile:1

# Multi-stage distroless Node 24 image for the hosted AirysChat MCP server
# (REM-06, ADR 0004). Default entry point runs the stateless Streamable HTTP
# server on PORT=8080 (/healthz, /.well-known/oauth-protected-resource, /mcp).

FROM node:24-slim AS build
RUN corepack enable
WORKDIR /src

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/server/package.json packages/server/tsconfig.json ./packages/server/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @airyschat/mcp

COPY docs/api/ ./docs/api/
COPY scripts/inventory/ ./scripts/inventory/
COPY packages/server/src ./packages/server/src
COPY packages/server/README.md ./packages/server/README.md

RUN pnpm --filter @airyschat/mcp build \
    && pnpm --filter @airyschat/mcp --prod deploy --legacy /app

FROM gcr.io/distroless/nodejs24-debian12:nonroot
WORKDIR /app
COPY --from=build --chown=nonroot:nonroot /app/node_modules ./node_modules
COPY --from=build --chown=nonroot:nonroot /app/dist ./dist
COPY --from=build --chown=nonroot:nonroot /app/catalog.json ./catalog.json
COPY --from=build --chown=nonroot:nonroot /app/package.json ./package.json

ARG GIT_SHA=unknown
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    AIRYS_GIT_SHA=$GIT_SHA

USER nonroot
EXPOSE 8080
CMD ["dist/http.js"]
