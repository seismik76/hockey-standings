# syntax=docker/dockerfile:1.7
# apps/collector as a run-once job: collect, write, exit. Build context = repo root.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
# Every workspace manifest; see apps/web/Dockerfile.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/web/package.json apps/web/
COPY apps/collector/package.json apps/collector/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/sources/package.json packages/sources/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# `deploy` copies the collector with its production dependencies, the
# workspace packages included as their built dist/ (and @hockey/db's migrations).
RUN pnpm --filter @hockey/collector... build && pnpm --filter @hockey/collector deploy --prod /out

FROM node:22-alpine AS runtime
ARG GIT_SHA=""
ENV NODE_ENV=production GIT_SHA=$GIT_SHA
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
ENTRYPOINT ["node", "dist/cli.js"]
