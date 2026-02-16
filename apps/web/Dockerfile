# Stage 1: Prune monorepo to only include @techteam/web and its dependencies
FROM node:22-alpine AS pruner
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
RUN apk add --no-cache libc6-compat
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app
RUN pnpm add -g turbo@^2
COPY . .
RUN turbo prune @techteam/web --docker

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

# Build args for Next.js public env vars (baked at build time)
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN pnpm turbo build --filter=@techteam/web...

# Stage 3: Production runner
FROM node:22-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

USER nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

ENV HOSTNAME="0.0.0.0"
ENV PORT=3009
EXPOSE 3009
CMD ["node", "apps/web/server.js"]
