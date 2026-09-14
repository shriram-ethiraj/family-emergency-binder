ARG NODE_VERSION=24.21.0

FROM node:${NODE_VERSION}-bookworm-slim AS development
WORKDIR /app
RUN corepack enable
RUN chown node:node /app
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node apps/frontend/package.json apps/frontend/package.json
COPY --chown=node:node apps/backend/package.json apps/backend/package.json
USER node
RUN pnpm install --frozen-lockfile --filter @family-emergency-binder/frontend...
COPY --chown=node:node apps/frontend apps/frontend
CMD ["pnpm", "--filter", "@family-emergency-binder/frontend", "dev", "--", "--host", "0.0.0.0"]

FROM development AS build
RUN pnpm --filter @family-emergency-binder/frontend build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
