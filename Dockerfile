# NOMAD Almanac: sun and moon times, compass declination and tide predictions,
# served as a static site.
#
# Two stages: Node builds the Vite/React site (running the tests and the offline
# guard first, so a wrong sunrise or declination fails the build), then only the
# static files are copied into nginx. The WMM2025 coefficients and the station
# tide constants are in the repo; the EOT20 coastal tiles (about 6 MB, too big to
# keep in git) are a release asset of this repository, fetched here and checked
# against a pinned SHA-256 so a changed file can never slip into an image.
# scripts/build-eot20.py rebuilds that asset from the published model.
# No Node, no server code, no volumes at runtime; every computation runs in the
# browser and saved places live in each browser's localStorage.
# The site is the same on every CPU: build it (and run the tests) once, natively.
FROM --platform=$BUILDPLATFORM alpine:3.22 AS eot20
ARG EOT20_URL=https://github.com/FuryNocturn/FNProject-NOMAD-Almanac/releases/download/data-eot20-v1/eot20-coastal-v1.tar.gz
ARG EOT20_SHA256=806151c6eed25979969fe730187594043fee4db5e2a81c8876f50d4ffddfc122
RUN wget -q -O /eot20.tar.gz "$EOT20_URL" \
 && echo "$EOT20_SHA256  /eot20.tar.gz" | sha256sum -c - \
 && mkdir /eot20 && tar -xzf /eot20.tar.gz -C /eot20 \
 && test -s /eot20/index.json

FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
COPY --from=eot20 /eot20 public/data/eot20
RUN npm test && npm run build && test -s dist/data/tides.json && test -s dist/data/eot20/index.json

FROM nginx:1.28-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
