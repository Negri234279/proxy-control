# syntax=docker/dockerfile:1

# OCI image metadata — populated by CI (docker-publish.yml) at build time.
ARG VERSION="unknown"
ARG VCS_REF="unknown"
ARG VCS_URL="unknown"
ARG BUILD_DATE="unknown"
ARG DESCRIPTION="Panel to govern Nginx Proxy Manager domains, reconciling public (Cloudflare) and private (Mikrotik) DNS."

# =========================================================================
# Base: Node 24 sobre Alpine. proxy-control solo hace HTTP/HTTPS saliente
# (NPM, Cloudflare, Mikrotik) y habla con Postgres; no necesita iputils ni
# red del host. `wget` (busybox) basta para el healthcheck del compose.
# =========================================================================
FROM node:24-alpine AS base
WORKDIR /app

# --- Dependencias completas (incluye dev, necesarias para el build) ---
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# --- Build de Astro (genera dist/server/entry.mjs + dist/client) ---
FROM deps AS build
COPY . .
RUN npm run build

# --- Solo dependencias de producción, para una imagen final ligera ---
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# =========================================================================
# Runtime (staging / prod): imagen mínima con el servidor SSR standalone.
# =========================================================================
FROM base AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321

# Re-declare the metadata ARGs so they're in scope for this stage.
ARG VERSION
ARG VCS_REF
ARG VCS_URL
ARG BUILD_DATE
ARG DESCRIPTION

# OCI standard metadata (values injected by CI at build time).
LABEL org.opencontainers.image.title="proxy-control" \
    org.opencontainers.image.description="${DESCRIPTION}" \
    org.opencontainers.image.version="${VERSION}" \
    org.opencontainers.image.revision="${VCS_REF}" \
    org.opencontainers.image.created="${BUILD_DATE}" \
    org.opencontainers.image.source="${VCS_URL}" \
    org.opencontainers.image.url="${VCS_URL}"

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# Corre como usuario sin privilegios (el usuario `node` existe en la imagen base).
USER node

EXPOSE 4321
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1
CMD ["node", "./dist/server/entry.mjs"]

# =========================================================================
# Dev: hot reload. El código fuente se monta por volumen desde el compose.
# =========================================================================
FROM deps AS dev
ENV NODE_ENV=development
ENV HOST=0.0.0.0
ENV PORT=4321

EXPOSE 4321
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
