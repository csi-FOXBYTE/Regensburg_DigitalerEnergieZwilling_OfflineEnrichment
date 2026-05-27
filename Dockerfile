FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable

RUN apk add --no-cache libspatialite

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsdown.config.ts ./
COPY src ./src
COPY test ./test

RUN pnpm install --frozen-lockfile
RUN pnpm run build
RUN pnpm prune --prod

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV SPATIALITE_PATH=/usr/lib/mod_spatialite.so.8

RUN apk add --no-cache libspatialite

COPY package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

CMD ["node", "dist/cli.mjs", "--src", "/data"]
