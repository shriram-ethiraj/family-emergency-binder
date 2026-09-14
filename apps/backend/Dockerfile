ARG NODE_VERSION=24.21.0

FROM node:${NODE_VERSION}-bookworm-slim AS development
WORKDIR /app
RUN corepack enable
RUN chown node:node /app
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node apps/frontend/package.json apps/frontend/package.json
COPY --chown=node:node apps/backend/package.json apps/backend/package.json
USER node
RUN pnpm install --frozen-lockfile --filter @family-emergency-binder/backend...
COPY --chown=node:node apps/backend apps/backend
WORKDIR /app/apps/backend
# Keep the watcher as the container's direct child so docker-init can forward
# stop signals to it. Running through pnpm adds an extra process layer that can
# terminate the API before Fastify and the SQLite connection close gracefully.
CMD ["node", "node_modules/tsx/dist/cli.mjs", "watch", "src/index.ts"]

FROM development AS build
RUN pnpm --filter @family-emergency-binder/backend build

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY apps/backend/package.json apps/backend/package.json
RUN pnpm install --prod --frozen-lockfile --filter @family-emergency-binder/backend...
COPY --from=build /app/apps/backend/dist ./apps/backend/dist
COPY definitions ./definitions
USER node
WORKDIR /app/apps/backend
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173 DEFINITIONS_DIR=/app/definitions
EXPOSE 4173
CMD ["node", "dist/index.js"]
