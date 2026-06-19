# ── Stage 1: Install dependencies ────────────────────────────────────────────
FROM node:22-alpine AS installer
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM installer AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter @jokas/shared build && \
    pnpm --filter @jokas/web build

# ── Stage 3: Minimal production runtime (Next.js standalone) ─────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 -G nodejs

# Standalone server + static assets (all that's needed at runtime)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000 2>&1 | grep -qv "refused" || exit 1

# Standalone output entry point
CMD ["node", "apps/web/server.js"]
