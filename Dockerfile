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
# Doc-extraction deps (pdf-parse/pdfjs canvas polyfill, OCR) are traced into
# node_modules but Nitro only traces ESM chunks — carry the runtime packages.
COPY --from=build --chown=kamkazi:kamkazi /app/node_modules/@napi-rs ./node_modules/@napi-rs
COPY --from=build --chown=kamkazi:kamkazi /app/node_modules/tesseract.js ./node_modules/tesseract.js
COPY --from=build --chown=kamkazi:kamkazi /app/node_modules/bmp-js ./node_modules/bmp-js
COPY --from=build --chown=kamkazi:kamkazi /app/node_modules/regenerator-runtime ./node_modules/regenerator-runtime
COPY --from=build --chown=kamkazi:kamkazi /app/node_modules/is-url ./node_modules/is-url
COPY --from=build --chown=kamkazi:kamkazi /app/node_modules/node-fetch ./node_modules/node-fetch
COPY --from=build --chown=kamkazi:kamkazi /app/node_modules/wasm-feature-detect ./node_modules/wasm-feature-detect
COPY --from=build --chown=kamkazi:kamkazi /app/node_modules/tesseract.js-core ./node_modules/tesseract.js-core
# pdf-parse v2 bundles pdfjs; its worker file is looked up relative to the
# traced Nitro chunk — copy the whole pdfjs-dist build there.
COPY --from=build --chown=kamkazi:kamkazi /app/node_modules/pdfjs-dist/build/pdf.worker.min.mjs /app/.output/server/_libs/pdf.worker.mjs
USER kamkazi
EXPOSE 8086
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8086/login || exit 1
CMD ["node", ".output/server/index.mjs"]