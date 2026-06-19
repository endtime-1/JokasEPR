# ── Stage 1: Install all deps (including devDependencies for building) ────────
FROM node:22-alpine AS installer
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

# ── Stage 2: Build all packages ───────────────────────────────────────────────
FROM installer AS builder
COPY . .
RUN pnpm --filter @jokas/shared build && \
    pnpm --filter @jokas/db prisma:generate && \
    pnpm --filter @jokas/db build && \
    pnpm --filter @jokas/api build

# ── Stage 3: Production runtime ───────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
RUN corepack enable

ENV NODE_ENV=production
ENV PORT=4001

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001 -G nodejs

# Copy the full workspace (pnpm symlinks require the full node_modules layout)
COPY --from=builder --chown=nestjs:nodejs /app .

USER nestjs

EXPOSE 4001

# Health check — verifies the NestJS process is responding
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:4001/api/ 2>&1 | grep -qv "refused" || exit 1

CMD ["pnpm", "--filter", "@jokas/api", "start"]
