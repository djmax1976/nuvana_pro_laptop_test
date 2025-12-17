# Dockerfile - Fastify Backend Production Build
# Multi-stage build for optimal image size

# =============================================================================
# Stage 1: Builder
# =============================================================================
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for build)
# Note: No native build tools needed - bcryptjs is pure JavaScript
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# =============================================================================
# Stage 2: Production Dependencies
# =============================================================================
FROM node:20-alpine AS prod-deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Install production dependencies only
# Note: No native build tools needed - bcryptjs is pure JavaScript
RUN npm ci --only=production

# Generate Prisma client
RUN npx prisma generate

# =============================================================================
# Stage 3: Runner (Production)
# =============================================================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install runtime dependencies:
# - wget: for health checks
# - libc6-compat: required for Prisma on Alpine
RUN apk add --no-cache wget libc6-compat

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 fastify

# Copy production dependencies
COPY --from=prod-deps /app/node_modules ./node_modules

# Copy Prisma schema and generated client
COPY --from=prod-deps /app/prisma ./prisma
COPY --from=prod-deps /app/node_modules/.prisma ./node_modules/.prisma

# Copy Prisma CLI for migrations
COPY --from=prod-deps /app/node_modules/prisma ./node_modules/prisma

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# Copy source files needed for startup scripts (RBAC seed, bootstrap admin)
# These are needed because tsx will run TypeScript files directly
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Copy startup script with executable permissions (as root, before switching user)
COPY --from=builder --chmod=755 /app/start.sh ./start.sh

# Switch to non-root user
# Note: We switch user AFTER copying files and setting permissions
USER fastify

# Expose port
EXPOSE 3001

# Health check (Railway sets PORT automatically, health check uses that port)
# Note: Railway exposes services on PORT env var, which defaults to the EXPOSE port
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3001}/api/health || exit 1

# Start the application (runs migrations first)
CMD ["./start.sh"]
