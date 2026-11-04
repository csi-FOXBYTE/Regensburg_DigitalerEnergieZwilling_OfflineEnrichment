FROM node:22.23.4-alpine3.24 AS builder

WORKDIR /app

RUN corepack enable

RUN apk add --no-cache libspatialite
ENV SPATIALITE_PATH=/usr/lib/mod_spatialite.so.8

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsdown.config.ts ./
COPY LICENSE COPYING COPYING.LESSER NOTICE ./
COPY src ./src
COPY test ./test

RUN pnpm install --frozen-lockfile
RUN pnpm run build
RUN pnpm prune --prod

FROM node:22.23.4-alpine3.24 AS runtime

LABEL org.opencontainers.image.licenses="LGPL-3.0-or-later" \
      org.opencontainers.image.source="https://github.com/csi-FOXBYTE/Regensburg_DigitalerEnergieZwilling_OfflineEnrichment"

WORKDIR /app
ENV NODE_ENV=production
ENV SPATIALITE_PATH=/usr/lib/mod_spatialite.so.8

RUN apk add --no-cache libspatialite

COPY package.json ./
COPY --from=builder /app/LICENSE /app/COPYING /app/COPYING.LESSER /app/NOTICE ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY SBOM.cdx.json /usr/share/regensburg/SBOM.cdx.json

# Run as the unprivileged "node" user (uid/gid 1000) shipped with the base image.
# The app files stay root-owned and read-only; the CLI only writes to the mounted
# job directories and os.tmpdir(). Numeric so runAsNonRoot can verify it.
USER 1000:1000

CMD ["node", "dist/cli.mjs", "--src", "/data"]
