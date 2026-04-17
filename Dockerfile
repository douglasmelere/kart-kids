# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Build Vite client
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS client-build

WORKDIR /build/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./

# VITE_SERVER_URL vazia = socket.io conecta na mesma origem (sem hardcode de URL)
ARG VITE_SERVER_URL=""
ENV VITE_SERVER_URL=$VITE_SERVER_URL

RUN npm run build
# Resultado em /build/client/dist


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Servidor de produção
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS production

# Dependências nativas mínimas (sql.js usa WASM puro, sem bindings nativos)
RUN apk add --no-cache tini

WORKDIR /app

# Dependências do servidor (apenas produção)
COPY server/package*.json ./server/
RUN npm ci --prefix server --omit=dev

# Código-fonte do servidor
COPY server/ ./server/

# Client compilado
COPY --from=client-build /build/client/dist ./client/dist

# Diretório do banco de dados (monta volume aqui no Coolify)
RUN mkdir -p ./server/data

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# tini garante reaping de processos zumbi
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/src/index.js"]
