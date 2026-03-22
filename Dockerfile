FROM node:22-alpine

ARG COMMIT_HASH=unknown
ARG BUILD_TIMESTAMP
ENV COMMIT_HASH=$COMMIT_HASH
ENV BUILD_TIMESTAMP=$BUILD_TIMESTAMP

WORKDIR /app

# Install dependencies.
# Alpine uses musl libc; sqlite3's prebuild-install downloads the linuxmusl
# prebuilt binary which has no GLIBC_2.38 requirement unlike the glibc build.
# Build tools are installed as a virtual package so they can be removed after
# npm install, keeping the image lean in case the prebuilt download fails and
# node-gyp must compile from source as a fallback.
COPY package*.json ./
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && npm install \
    && apk del .build-deps

# Copy application files
COPY . .

# Create volume mount points
VOLUME ["/app/data"]

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]
