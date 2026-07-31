# Step 1: Base image
FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate

# Step 2: Install dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Step 3: Build application
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Accept Build Arguments for Environment Variables
ARG CONNECT_API_URL
ARG ADMIN_API_KEY
ARG GOOGLE_CLIENT_ID
ARG GOOGLE_CLIENT_SECRET
ARG NEXTAUTH_SECRET
ARG NEXTAUTH_URL
ARG ADMIN_EMAILS
ARG ALLOWED_GOOGLE_DOMAIN

# Map Arguments to ENV so Next.js build step can read them
ENV CONNECT_API_URL=${CONNECT_API_URL}
ENV ADMIN_API_KEY=${ADMIN_API_KEY}
ENV GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
ENV GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
ENV NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
ENV NEXTAUTH_URL=${NEXTAUTH_URL}
ENV ADMIN_EMAILS=${ADMIN_EMAILS}
ENV ALLOWED_GOOGLE_DOMAIN=${ALLOWED_GOOGLE_DOMAIN}

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN pnpm nx build console --skip-nx-cache

# Step 4: Runner image
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

# Standalone output includes only the files needed to run — no full node_modules copy needed
COPY --from=builder /app/apps/console/.next/standalone ./
COPY --from=builder /app/apps/console/.next/static ./apps/console/.next/static
COPY --from=builder /app/apps/console/public ./apps/console/public

EXPOSE 3000
CMD ["node", "apps/console/server.js"]
