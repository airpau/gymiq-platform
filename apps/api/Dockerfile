FROM node:20-alpine AS base
RUN apk add --no-cache openssl

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy root package files
COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/
COPY packages/database/package.json ./packages/database/
COPY packages/ai-gateway/package.json ./packages/ai-gateway/
COPY packages/shared/package.json ./packages/shared/
COPY packages/connectors/package.json ./packages/connectors/

# Create stub package.json files for apps not included in build
RUN mkdir -p apps/web apps/marketing && \
    echo '{"name":"@gymiq/web","version":"0.1.0","private":true}' > apps/web/package.json && \
    echo '{"name":"@gymiq/marketing","version":"0.1.0","private":true}' > apps/marketing/package.json

RUN npm install --production=false

# Build stage - CACHE BUST: 20260319-v3-passwordHash
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Restore stub package.json files for missing apps
RUN mkdir -p apps/web apps/marketing && \
    echo '{"name":"@gymiq/web","version":"0.1.0","private":true}' > apps/web/package.json && \
    echo '{"name":"@gymiq/marketing","version":"0.1.0","private":true}' > apps/marketing/package.json

# Generate Prisma client from schema (schema has passwordHash, role, gymId, firstName, lastName)
RUN cd packages/database && node_modules/.bin/prisma generate

# Build shared packages and API
RUN npm run build --workspace=packages/shared 2>/dev/null || true
RUN npm run build --workspace=apps/api

# Production stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy necessary files
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./
COPY --from=builder /app/package.json /app/package.json

EXPOSE 3001

CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy --schema=/app/packages/database/prisma/schema.prisma && node dist/apps/api/src/index.js"]
