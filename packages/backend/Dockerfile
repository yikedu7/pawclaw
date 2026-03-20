FROM node:20-alpine AS base
RUN npm install -g pnpm

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/
RUN pnpm install --frozen-lockfile --filter @x-pet/backend...

# Build
FROM deps AS builder
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend
RUN pnpm --filter @x-pet/shared build
RUN pnpm --filter @x-pet/backend build

# Runner
FROM node:20-alpine AS runner
RUN npm install -g pnpm
WORKDIR /app
COPY pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/
RUN pnpm install --frozen-lockfile --filter @x-pet/backend... --prod
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist

EXPOSE 3000
CMD ["node", "packages/backend/dist/index.js"]
