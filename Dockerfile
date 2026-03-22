# Build stage: compile native modules against the container's glibc
FROM node:20-slim AS builder

# Install build tools required for compiling native modules (e.g. sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install all dependencies (prebuild-install will download a prebuilt sqlite3
# binary compiled against a newer glibc than what this image provides).
# Immediately rebuild sqlite3 from source so it links against this image's
# glibc (Debian bookworm / GLIBC 2.36) instead of the incompatible prebuilt.
COPY package*.json ./
RUN npm install && npm rebuild sqlite3 --build-from-source

# Runtime stage: lean image without build tools
FROM node:20-slim

ARG COMMIT_HASH=unknown
ARG BUILD_TIMESTAMP
ENV COMMIT_HASH=$COMMIT_HASH
ENV BUILD_TIMESTAMP=$BUILD_TIMESTAMP

WORKDIR /app

# Copy node_modules (with locally-compiled native binaries) from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application files
COPY . .

# Create volume mount points
VOLUME ["/app/data"]

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]
