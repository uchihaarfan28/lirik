# Build lokal dari folder server: docker build -t lirik-island .
# Deploy Coolify monorepo: pakai Dockerfile di root repo (bukan file ini).
FROM node:22-alpine

WORKDIR /app
COPY package.json ./
COPY src ./src

ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=8888

RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
EXPOSE 8888

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1

USER node
CMD ["node", "src/server.js"]
