# Step 1: Base image
FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

# Step 2: Install dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Step 3: Build application
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set production environment and build Nx console project
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN pnpm nx build console

# Step 4: Runner image
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy standalone output or Next.js build assets
COPY --from=builder /app/apps/console/public ./apps/console/public
COPY --from=builder /app/dist/apps/console ./dist/apps/console
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

CMD ["pnpm", "nx", "start", "console"]
