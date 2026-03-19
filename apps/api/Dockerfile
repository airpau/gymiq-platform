FROM node:20-alpine AS base
RUN apk add --no-cache openssl

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy root package files
COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/
COPY apps/marketing/package.json ./apps/marketing/
COPY apps/web/package.json ./apps/web/
COPY packages/database/package.json ./packages/database/
COPY packages/ai-gateway/package.json ./packages/ai-gateway/
COPY packages/shared/package.json ./packages/shared/
COPY packages/connectors/package.json ./packages/connectors/

RUN npm install --production=false

# Build stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN cd packages/database && npx prisma generate

# Build all packages and API
RUN npm run build --workspace=packages/database 2>/dev/null || true
RUN npm run build --workspace=packages/ai-gateway 2>/dev/null || true
RUN npm run build --workspace=packages/shared 2>/dev/null || true
RUN npm run build --workspace=packages/connectors 2>/dev/null || true
RUN npm run build --workspace=apps/api

# Production stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy necessary files
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/package.json ./

WORKDIR /app/apps/api

EXPOSE 3001

# Run migrations then start
CMD ["sh", "-c", "npx prisma migrate deploy --schema=../../packages/database/prisma/schema.prisma && node dist/index.js"]
