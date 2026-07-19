FROM node:22-alpine

ARG COMMIT_HASH=unknown
ARG BUILD_TIMESTAMP
ENV COMMIT_HASH=$COMMIT_HASH
ENV BUILD_TIMESTAMP=$BUILD_TIMESTAMP
ENV NODE_ENV=production

WORKDIR /app

# Install dependencies.
# Alpine uses musl libc; sqlite3's prebuild-install downloads the linuxmusl
# prebuilt binary which has no GLIBC_2.38 requirement unlike the glibc build.
# Build tools are installed as a virtual package so they can be removed after
# npm install, keeping the image lean in case the prebuilt download fails and
# node-gyp must compile from source as a fallback.
# Production-only install: devDependencies (eslint, jest, etc.) stay out of the image.
COPY package*.json .npmrc ./
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && npm ci --omit=dev \
    && npm rebuild sqlite3 --ignore-scripts=false \
    && apk del .build-deps

# Copy application files
COPY . .

# SQLite data dir; run as non-root (official image provides uid 1000 `node`).
# Host bind mounts for ./data work best when the host dir is also owned by uid 1000.
RUN mkdir -p /app/data \
    && chown -R node:node /app

USER node

VOLUME ["/app/data"]

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/version').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
