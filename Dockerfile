# 4Walls — one image: the authoritative game server (Colyseus) + account API + the built web client.
# Build:  docker build -t 4walls .
# Run:    docker run -p 2567:2567 -v 4walls-data:/data 4walls   → http://localhost:2567

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
# Manifests first: dependency layers stay cached while the source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/game-shared/package.json packages/game-shared/
COPY packages/game-core/package.json packages/game-core/
COPY packages/game-protocol/package.json packages/game-protocol/
COPY apps/web/package.json apps/web/
COPY apps/game-server/package.json apps/game-server/
RUN pnpm install --frozen-lockfile --filter @4walls/web... --filter @4walls/game-server...
COPY packages ./packages
COPY apps/web ./apps/web
COPY apps/game-server ./apps/game-server
RUN pnpm --filter @4walls/web build

FROM node:22-alpine
ENV NODE_ENV=production PORT=2567 DATA_FILE=/data/accounts.json
WORKDIR /app
RUN corepack enable && mkdir -p /data && chown node:node /data
# The server runs the TypeScript sources through tsx (the shared packages are TS-only).
COPY --from=build --chown=node:node /app /app
USER node
VOLUME /data
EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- http://127.0.0.1:2567/healthz || exit 1
WORKDIR /app/apps/game-server
CMD ["node", "--import", "tsx", "src/index.ts"]
