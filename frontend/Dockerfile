# syntax=docker/dockerfile:1
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Estas variables se "hornean" en el build (URL pública del sitio y backend interno para el proxy /api).
ARG NEXT_PUBLIC_SITE_URL=
ARG API_INTERNAL_URL=http://backend:8000
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL API_INTERNAL_URL=$API_INTERNAL_URL NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ARG NEXT_PUBLIC_SITE_URL=
ARG API_INTERNAL_URL=http://backend:8000
# También en RUNTIME: los Server Components llaman al backend desde el contenedor.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL API_INTERNAL_URL=$API_INTERNAL_URL
RUN apk upgrade --no-cache && addgroup -S app && adduser -S app -G app
# En ejecución solo hace falta `node`: sin npm/corepack hay menos superficie de ataque y desaparecen sus dependencias vulnerables.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/es" >/dev/null || exit 1
CMD ["node", "server.js"]
