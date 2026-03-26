FROM node:22-alpine AS base
RUN npm install -g pnpm

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/
RUN pnpm install --frozen-lockfile --filter @pawclaw/backend...

# Build
FROM deps AS builder
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend
RUN pnpm --filter @pawclaw/shared build
RUN pnpm --filter @pawclaw/backend build

# Runner
FROM node:22-alpine AS runner
RUN npm install -g pnpm
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/
RUN pnpm install --frozen-lockfile --filter @pawclaw/backend... --prod
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=builder /app/packages/backend/drizzle ./packages/backend/drizzle
COPY --from=builder /app/packages/backend/src/runtime/okx-skills ./packages/backend/dist/runtime/okx-skills
RUN chown -R appuser:appgroup /app
USER appuser

ENV PORT=3000
EXPOSE 3000
CMD ["sh", "-c", "cd /app/packages/backend && node dist/db/migrate.js && node dist/index.js"]
