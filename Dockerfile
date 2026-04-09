# clawdRALPH Dockerfile
# Multi-stage build for optimized production image

# ==============================================================================
# Stage 1: Build the application
# ==============================================================================
FROM node:25-alpine AS builder

WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache python3 make g++ git

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for building)
RUN npm ci

# Copy source files
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

# Build the application
RUN npm run build

# ==============================================================================
# Stage 2: Build the web dashboard
# ==============================================================================
FROM node:25-alpine AS web-builder

WORKDIR /app/web

# Copy web package files
COPY web/package*.json ./

# Install dependencies
RUN npm ci

# Copy web source files
COPY web ./

# Build the web dashboard
RUN npm run build

# ==============================================================================
# Stage 3: Production image
# ==============================================================================
FROM node:25-alpine AS production

WORKDIR /app

# Install runtime dependencies only
RUN apk add --no-cache \
    git \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    dumb-init

# Set Playwright to use system Chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create non-root user for security
RUN addgroup -g 1001 -S clawdralph && \
    adduser -S clawdralph -u 1001 -G clawdralph

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy web dashboard from web-builder stage
COPY --from=web-builder /app/web/dist ./web/dist

# Copy scripts
COPY scripts ./scripts

# Create data directories
RUN mkdir -p /data/sessions /data/logs /data/memory && \
    chown -R clawdralph:clawdralph /data

# Set environment variables
ENV NODE_ENV=production
ENV CLAWDRALPH_DATA_DIR=/data
ENV CLAWDRALPH_CONFIG=/data/config.json
ENV CLAWDRALPH_LOG_FILE=/data/logs/clawdralph.log

# Expose gateway port
EXPOSE 18789

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:18789/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Switch to non-root user
USER clawdralph

# Use dumb-init to properly handle signals
ENTRYPOINT ["dumb-init", "--"]

# Default command: start the gateway
CMD ["node", "dist/entry.js", "gateway"]
