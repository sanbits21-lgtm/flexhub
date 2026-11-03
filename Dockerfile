# syntax=docker/dockerfile:1
# One image runs the whole product: the API, and the built staff website it serves from
# ../frontend/dist (see app.js). The member/trainer mobile app is not containerised - it is
# built and shipped with EAS (see mobile/README or docs/DEPLOY.md).

# ---- website build ----------------------------------------------------------------------
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- production dependencies only (no jest/nodemon/supertest) ---------------------------
FROM node:20-alpine AS backend-deps
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# ---- runtime ----------------------------------------------------------------------------
FROM node:20-alpine AS runtime
# tini: PID 1 that forwards SIGTERM, so `docker stop` triggers our graceful shutdown.
RUN apk add --no-cache tini
ENV NODE_ENV=production \
    PORT=8080 \
    UPLOAD_DIR=/data/uploads
WORKDIR /app/backend
COPY --from=backend-deps /app/backend/node_modules ./node_modules
COPY backend/ ./
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist
# Member photos live on a volume so they survive container replacement.
RUN mkdir -p /data/uploads && chown -R node:node /data /app
USER node
VOLUME ["/data/uploads"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
