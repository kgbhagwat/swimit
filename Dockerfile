FROM node:22-alpine AS build
WORKDIR /app
ARG GIT_COMMIT=unknown
ARG BUILD_TIME=unknown

COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

RUN npm ci

COPY client ./client
COPY server ./server

RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ARG GIT_COMMIT=unknown
ARG BUILD_TIME=unknown
ENV GIT_COMMIT=$GIT_COMMIT
ENV BUILD_TIME=$BUILD_TIME

COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist
COPY scripts/docker-entrypoint.sh /docker-entrypoint.sh

RUN chmod +x /docker-entrypoint.sh \
  && mkdir -p /app/server/uploads \
  && chown -R node:node /app

USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/docker-entrypoint.sh"]
