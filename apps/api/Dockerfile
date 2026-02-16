# Stage 1: Prune monorepo to only include @techteam/api and its dependencies
FROM node:22-alpine AS pruner
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
RUN apk add --no-cache libc6-compat
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app
RUN pnpm add -g turbo@^2
COPY . .
RUN turbo prune @techteam/api --docker

# Stage 2: Install dependencies and build
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
RUN apk add --no-cache libc6-compat
ENV NODE_OPTIONS="--max-old-space-size=8192"
WORKDIR /app
# Copy pruned package.json files first (Docker cache layer for deps)
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN pnpm install --frozen-lockfile || pnpm install
# Copy full source and build
COPY --from=pruner /app/out/full/ .
COPY turbo.json turbo.json
COPY tsconfig.json tsconfig.json
# Generate Prisma client for Alpine Linux (not copied from host via .dockerignore)
# DATABASE_URL is only needed for config resolution; prisma generate does not connect to the DB
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" pnpm --filter @techteam/database exec prisma generate
RUN pnpm turbo build --filter=@techteam/api...

# Stage 3: Production runner
FROM node:22-alpine AS runner
RUN apk add --no-cache git openssl
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser
# Copy built application
COPY --from=builder --chown=appuser:nodejs /app .
# Copy entrypoint script from pruner stage (scripts/ is at monorepo root, not in turbo prune output)
COPY --from=pruner /app/scripts/docker-entrypoint-api.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
USER appuser
EXPOSE 3010
ENTRYPOINT ["/entrypoint.sh"]
