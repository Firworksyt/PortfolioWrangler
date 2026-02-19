FROM node:20-slim

ARG COMMIT_HASH=unknown
ARG BUILD_TIMESTAMP
ENV COMMIT_HASH=$COMMIT_HASH
ENV BUILD_TIMESTAMP=$BUILD_TIMESTAMP

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy application files
COPY . .

# Create volume mount points
VOLUME ["/app/data"]

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]
