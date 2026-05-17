# syntax=docker/dockerfile:1.7
#
# Multi-stage Bun + Astro image.
# Stage 1 installs deps and builds the Astro standalone Node-adapter output.
# Stage 2 ships only the runtime artefacts plus production dependencies.

ARG BUN_VERSION=1.3

# ----------------------------------------------------------------------------
# 1. Dependencies
# ----------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-alpine AS deps
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ----------------------------------------------------------------------------
# 2. Build
# ----------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Astro sync generates types under .astro/; needed before build/check.
RUN bunx astro sync && bun run build

# ----------------------------------------------------------------------------
# 3. Runtime
# ----------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4321

# Production dependencies only.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Built Astro output (server entry + static assets + client islands).
COPY --from=build /app/dist ./dist

# Drop privileges. The oven/bun image ships a `bun` user.
USER bun

EXPOSE 4321

CMD ["bun", "run", "./dist/server/entry.mjs"]
