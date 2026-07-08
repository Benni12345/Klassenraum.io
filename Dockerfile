FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/packages/server/dist ./server
COPY --from=build /app/packages/client/dist ./client/dist
ENV NODE_ENV=production \
    PORT=8080 \
    DB_PATH=/data/klassenraum.db \
    STATIC_DIR=/app/client/dist
VOLUME /data
EXPOSE 8080
CMD ["node", "server/index.cjs"]
