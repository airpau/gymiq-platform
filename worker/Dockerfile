# gymIQ worker. Build context is the REPO ROOT (fly.toml sets this) because the
# worker imports the ingest + iq library from unified/ so there is one source of truth.
FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# Worker deps first (layer cache).
COPY worker/package.json worker/package-lock.json* ./worker/
RUN cd worker && npm ci --omit=dev --no-audit --no-fund
# The ingest lives under unified/ and resolves pg/xlsx by walking up: give it the worker's modules.
RUN ln -s /app/worker/node_modules /app/node_modules

# Shared iq library + ingest (imported by the worker at runtime through tsx).
COPY unified/src/lib/iq ./unified/src/lib/iq
COPY unified/scripts/iq/daily-ingest.mts ./unified/scripts/iq/daily-ingest.mts

# Worker source + playbooks.
COPY worker/src ./worker/src
COPY worker/playbooks ./worker/playbooks
COPY worker/tsconfig.json ./worker/tsconfig.json

WORKDIR /app/worker
ENV PORT=8080
ENV SCRATCH_DIR=/tmp/gymiq-worker
EXPOSE 8080
CMD ["npx", "tsx", "src/index.ts"]
