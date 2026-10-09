# Ours — one image that serves both the API and the built web app.
#   docker compose up --build        (app + MongoDB, see docker-compose.yml)
#   docker build -t ours .           (image only; needs an external MONGODB_URI)

ARG NODE_VERSION=22

# ── 1. Build the web app and the server ──────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
ENV MONGOMS_DISABLE_POSTINSTALL=1
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ── 2. Production dependencies for the server only ───────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
ENV MONGOMS_DISABLE_POSTINSTALL=1
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --omit=dev --workspace server --include-workspace-root=false --no-audit --no-fund \
 && mkdir -p server/node_modules \
 && npm cache clean --force

# ── 3. Runtime ───────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4000
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=deps --chown=node:node /app/server/node_modules ./server/node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node server/package.json ./server/
COPY --from=build --chown=node:node /app/server/dist ./server/dist
COPY --from=build --chown=node:node /app/client/dist ./client/dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/dist/index.js"]
