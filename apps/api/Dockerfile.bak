FROM node:20-alpine AS base
RUN apk add --no-cache openssl

FROM base AS builder
WORKDIR /app

COPY package.json package-lock.json* ./

# Stubs for apps not in build
RUN mkdir -p apps/web apps/marketing && \
    echo '{"name":"@gymiq/web","version":"0.1.0","private":true}' > apps/web/package.json && \
    echo '{"name":"@gymiq/marketing","version":"0.1.0","private":true}' > apps/marketing/package.json

COPY apps/api/package.json ./apps/api/
COPY packages/database/package.json ./packages/database/
COPY packages/ai-gateway/package.json ./packages/ai-gateway/
COPY packages/shared/package.json ./packages/shared/
COPY packages/connectors/package.json ./packages/connectors/

RUN npm install --production=false

COPY . .

# Restore stubs overwritten by COPY
RUN echo '{"name":"@gymiq/web","version":"0.1.0","private":true}' > apps/web/package.json && \
    echo '{"name":"@gymiq/marketing","version":"0.1.0","private":true}' > apps/marketing/package.json

# Remove any local stub Prisma clients that would shadow the generated one
RUN rm -rf node_modules/@prisma/client node_modules/.prisma \
           apps/api/node_modules/@prisma/client apps/api/node_modules/.prisma \
           packages/database/node_modules/@prisma/client packages/database/node_modules/.prisma

# Generate Prisma client into root node_modules
RUN cd packages/database && npx prisma@5.22.0 generate

# Build
RUN npm run build --workspace=packages/shared 2>/dev/null || true
RUN npm run build --workspace=apps/api

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./
COPY --from=builder /app/package.json /app/package.json

EXPOSE 3001

CMD ["sh", "-c", "npx prisma@5.22.0 migrate deploy --schema=/app/packages/database/prisma/schema.prisma && node dist/apps/api/src/index.js"]
