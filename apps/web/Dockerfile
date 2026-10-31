# syntax=docker/dockerfile:1.7
# apps/web as a Next.js standalone server. Build context = repo root.
FROM node:22-alpine AS base
RUN corepack enable && apk add --no-cache libc6-compat
WORKDIR /repo

FROM base AS deps
# Every workspace manifest, so the install layer caches until a dependency
# changes. A missing one does not fail here; it fails the build later with an
# error that does not name it (GLK learned this twice).
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/web/package.json apps/web/
COPY apps/collector/package.json apps/collector/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/sources/package.json packages/sources/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @hockey/web... build

FROM node:22-alpine AS runtime
# The commit this image was built from; /api/health reports it.
ARG GIT_SHA=""
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1 GIT_SHA=$GIT_SHA
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "apps/web/server.js"]
