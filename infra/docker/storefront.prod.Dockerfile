# ── Stage 1: Install dependencies ────────────────────────────────────────────
FROM node:22-alpine AS installer
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/storefront/package.json apps/storefront/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM installer AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter @jokas/shared build && \
    pnpm --filter @jokas/storefront build

# ── Stage 3: Minimal production runtime (Next.js standalone) ─────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3002

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 -G nodejs

COPY --from=builder --chown=nextjs:nodejs /app/apps/storefront/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/storefront/.next/static ./apps/storefront/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/storefront/public ./apps/storefront/public

USER nextjs

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3002 2>&1 | grep -qv "refused" || exit 1

CMD ["node", "apps/storefront/server.js"]
