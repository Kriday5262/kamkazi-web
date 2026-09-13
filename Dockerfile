# syntax=docker/dockerfile:1
# Multi-stage production build for Kamkazi (TanStack Start / Nitro node-server).

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Nitro node-server preset -> .output/server/index.mjs
RUN NITRO_PRESET=node_server npm run build

FROM node:22-alpine AS runtime
# IST everywhere: SmartHub lives in Dehradun; all users are IST.
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Kolkata /etc/localtime && \
    echo "Asia/Kolkata" > /etc/timezone
ENV NODE_ENV=production \
    TZ=Asia/Kolkata \
    NITRO_PORT=8086 \
    NITRO_HOST=0.0.0.0
WORKDIR /app
RUN addgroup -S kamkazi && adduser -S kamkazi -G kamkazi
COPY --from=build --chown=kamkazi:kamkazi /app/.output ./.output
USER kamkazi
EXPOSE 8086
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8086/login || exit 1
CMD ["node", ".output/server/index.mjs"]